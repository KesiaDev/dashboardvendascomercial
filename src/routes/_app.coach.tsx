import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sparkles, Upload, AlertTriangle, Settings, MessageSquare,
  TrendingUp, Clock, Target, Users, RefreshCw, Trash2, CheckCircle2,
  Zap, Copy, Eye, BarChart2, Phone, Plus, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  listCoachConversationsFn, listCoachAlertsFn, uploadConversationFn,
  analyzeConversationFn, runAlertsScanFn, resolveCoachAlertFn,
  deleteCoachConversationFn, getCoachConfigFn, saveCoachConfigFn,
  fetchClintWebhookStatsFn, fetchClintIntegrationLogsFn, runClintMigrationsFn,
  fetchWeeklyStatsFn, runAutoAnalysisFn, syncClintMessagesFn,
  type CoachConfig, type WeeklyStats,
} from "@/lib/coach.functions";
import { getHotmartWebhookTokenFn } from "@/lib/hotmart-webhook.functions";

export const Route = createFileRoute("/_app/coach")({
  component: CoachPage,
});

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtEur(n: number | null | undefined) {
  if (n == null) return "—";
  return "€" + n.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function sentimentColor(s: string | null | undefined) {
  if (s === "positivo") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  if (s === "negativo") return "bg-rose-500/15 text-rose-700 dark:text-rose-400";
  return "bg-slate-500/15 text-slate-700 dark:text-slate-300";
}
function scoreColor(n: number | null | undefined) {
  if (n == null) return "text-muted-foreground";
  if (n >= 8) return "text-emerald-600 dark:text-emerald-400";
  if (n >= 6) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function CoachPage() {
  const [tab, setTab] = useState("visao");
  const qc = useQueryClient();
  const { data: cfg } = useQuery({ queryKey: ["coach-config"], queryFn: () => getCoachConfigFn() });

  const autoEnabled = cfg?.auto_analysis ?? true;
  const analysisIntervalMs = (cfg?.analysis_interval_hours ?? 1) * 60 * 60 * 1000;
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    scanTimerRef.current = setInterval(async () => {
      try { await runAlertsScanFn(); qc.invalidateQueries({ queryKey: ["coach-alerts"] }); } catch {}
    }, 5 * 60 * 1000);
    return () => { if (scanTimerRef.current) clearInterval(scanTimerRef.current); };
  }, [qc]);

  useEffect(() => {
    if (!autoEnabled) return;
    const runAnalysis = async () => {
      try {
        const r = await runAutoAnalysisFn();
        if ((r as any)?.analyzed > 0) {
          qc.invalidateQueries({ queryKey: ["coach-convs"] });
          qc.invalidateQueries({ queryKey: ["coach-alerts"] });
        }
      } catch {}
    };
    runAnalysis();
    analysisTimerRef.current = setInterval(runAnalysis, analysisIntervalMs);
    return () => { if (analysisTimerRef.current) clearInterval(analysisTimerRef.current); };
  }, [autoEnabled, analysisIntervalMs, qc]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Coach Comercial com IA</h1>
          <p className="text-xs text-muted-foreground">Análise inteligente das conversas dos vendedores</p>
        </div>
        {autoEnabled && (
          <Badge variant="outline" className="ml-auto text-[10px] text-emerald-600 border-emerald-500/40">
            ● auto-análise ativa
          </Badge>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full flex-wrap h-auto">
          <TabsTrigger value="visao"><TrendingUp className="h-4 w-4 mr-1" />Visão geral</TabsTrigger>
          <TabsTrigger value="conversas"><MessageSquare className="h-4 w-4 mr-1" />Conversas</TabsTrigger>
          <TabsTrigger value="alertas"><AlertTriangle className="h-4 w-4 mr-1" />Alertas</TabsTrigger>
          <TabsTrigger value="upload"><Upload className="h-4 w-4 mr-1" />Nova análise</TabsTrigger>
          <TabsTrigger value="config"><Settings className="h-4 w-4 mr-1" />Config</TabsTrigger>
          <TabsTrigger value="integracao"><Zap className="h-4 w-4 mr-1" />Integração Clint</TabsTrigger>
        </TabsList>
        <TabsContent value="visao"><VisaoGeral /></TabsContent>
        <TabsContent value="conversas"><Conversas /></TabsContent>
        <TabsContent value="alertas"><Alertas /></TabsContent>
        <TabsContent value="upload"><UploadTab onDone={() => setTab("conversas")} /></TabsContent>
        <TabsContent value="config"><ConfigTab /></TabsContent>
        <TabsContent value="integracao"><IntegracaoClint /></TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({ icon, label, value, valueClass = "" }: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <p className={"text-2xl font-bold mt-1 " + valueClass}>{value}</p>
      </CardContent>
    </Card>
  );
}

function WeeklyChart({ stats }: { stats: WeeklyStats[] }) {
  const weeks = [...new Set(stats.map((s) => s.week_start))].sort((a, b) => b.localeCompare(a)).slice(0, 6);
  const sellers = [...new Set(stats.map((s) => s.seller_name ?? s.seller_email ?? "—"))];
  if (!weeks.length || !sellers.length) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="text-left py-1 pr-3 text-muted-foreground font-normal min-w-[120px]">Vendedor</th>
            {weeks.map((w) => (
              <th key={w} className="px-2 text-center text-muted-foreground font-normal whitespace-nowrap">
                {new Date(w + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sellers.map((seller) => (
            <tr key={seller}>
              <td className="py-1 pr-3 font-medium truncate max-w-[140px]">{seller}</td>
              {weeks.map((w) => {
                const entry = stats.find(
                  (s) => (s.seller_name ?? s.seller_email ?? "—") === seller && s.week_start === w,
                );
                return (
                  <td key={w} className="px-2 text-center">
                    {entry ? (
                      <span className={"font-bold " + scoreColor(entry.avg_score)}>
                        {Number(entry.avg_score ?? 0).toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VisaoGeral() {
  const { data: convs = [] } = useQuery({ queryKey: ["coach-convs"], queryFn: () => listCoachConversationsFn() });
  const { data: alerts = [] } = useQuery({ queryKey: ["coach-alerts"], queryFn: () => listCoachAlertsFn() });
  const { data: weekly = [] } = useQuery({ queryKey: ["coach-weekly"], queryFn: () => fetchWeeklyStatsFn(), staleTime: 5 * 60_000 });

  const analyzed = convs.filter((c: any) => c.analysis && c.analysis.status === "ok");
  const avgScore = analyzed.length
    ? Number((analyzed.reduce((s: number, c: any) => s + Number(c.analysis.score_geral ?? 0), 0) / analyzed.length).toFixed(1))
    : null;
  const tentativas = analyzed.length
    ? Math.round((analyzed.filter((c: any) => c.analysis.tentou_fechar).length / analyzed.length) * 100)
    : 0;
  const respTimes = analyzed.map((c: any) => c.analysis.tempo_medio_resposta_min).filter((x: any) => x != null);
  const avgResp = respTimes.length
    ? Math.round(respTimes.reduce((a: number, b: number) => a + b, 0) / respTimes.length)
    : null;
  const openAlerts = alerts.filter((a: any) => a.state !== "resolvido" && !a.resolved).length;

  const bySeller = new Map<string, { name: string; count: number; sum: number; wins: number }>();
  for (const c of analyzed) {
    const a: any = c.analysis;
    const name = (c as any).seller_name ?? (c as any).seller_email ?? "—";
    const cur = bySeller.get(name) ?? { name, count: 0, sum: 0, wins: 0 };
    cur.count += 1; cur.sum += Number(a.score_geral ?? 0);
    if (a.tentou_fechar) cur.wins += 1;
    bySeller.set(name, cur);
  }
  const ranking = Array.from(bySeller.values())
    .map((s) => ({ ...s, avg: Number((s.sum / s.count).toFixed(1)) }))
    .sort((a, b) => b.avg - a.avg);

  const objCount = new Map<string, number>();
  for (const c of analyzed) {
    const a: any = c.analysis;
    for (const o of (a.objecoes ?? []) as string[]) {
      const k = String(o).trim();
      if (k) objCount.set(k, (objCount.get(k) ?? 0) + 1);
    }
  }
  const topObj = Array.from(objCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<Target className="h-4 w-4" />} label="Nota média equipa" value={avgScore != null ? avgScore.toFixed(1) : "—"} valueClass={scoreColor(avgScore)} />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="% com tentativa de fecho" value={tentativas + "%"} />
        <KpiCard icon={<Clock className="h-4 w-4" />} label="Tempo médio resposta" value={avgResp != null ? avgResp + " min" : "—"} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" />} label="Alertas abertos" value={String(openAlerts)} valueClass={openAlerts > 0 ? "text-rose-600 dark:text-rose-400" : ""} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />Ranking por qualidade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ranking.length === 0 && <p className="text-sm text-muted-foreground">Sem análises ainda.</p>}
            {ranking.map((s, i) => (
              <div key={s.name} className="flex items-center gap-3">
                <span className="text-xs font-bold w-5 text-muted-foreground">{i + 1}º</span>
                <span className="flex-1 text-sm truncate">{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.count} conv.</span>
                <span className={"text-sm font-bold w-10 text-right " + scoreColor(s.avg)}>{s.avg.toFixed(1)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Principais objeções</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {topObj.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma objeção catalogada.</p>}
            {topObj.map(([o, n]) => (
              <div key={o} className="flex items-center gap-3">
                <span className="flex-1 text-sm capitalize">{o}</span>
                <Badge variant="secondary">{n}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {weekly.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="h-4 w-4" />Nota média por vendedor · semanas recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WeeklyChart stats={weekly} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Conversas() {
  const qc = useQueryClient();
  const { data: convs = [], isLoading } = useQuery({ queryKey: ["coach-convs"], queryFn: () => listCoachConversationsFn() });
  const [q, setQ] = useState("");
  const [minScore, setMinScore] = useState("");

  const analyze = useMutation({
    mutationFn: (id: string) => analyzeConversationFn({ data: { conversationId: id, force: true } }),
    onSuccess: (r: any) => {
      toast.success(r?.status === "insufficient_data" ? "Dados insuficientes" : "Análise concluída");
      qc.invalidateQueries({ queryKey: ["coach-convs"] });
      qc.invalidateQueries({ queryKey: ["coach-alerts"] });
      qc.invalidateQueries({ queryKey: ["coach-weekly"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha na análise"),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteCoachConversationFn({ data: { id } }),
    onSuccess: () => { toast.success("Conversa apagada"); qc.invalidateQueries({ queryKey: ["coach-convs"] }); },
  });

  const [syncingId, setSyncingId] = useState<string | null>(null);
  const syncOne = async (id: string, silent = false) => {
    setSyncingId(id);
    try {
      const r: any = await syncClintMessagesFn({ data: { conversationId: id } });
      if (!silent) toast.success(`Sincronizado: ${r.synced} nova(s) msg (total ${r.total ?? "?"})`);
      qc.invalidateQueries({ queryKey: ["coach-convs"] });
      return r;
    } catch (e: any) {
      if (!silent) {
        toast.error(e?.message ?? "Falha no sync", {
          description: "Ver consola para payload Clint",
          duration: 8000,
        });
        console.error("[Clint sync]", e);
      }
    } finally {
      setSyncingId((s) => (s === id ? null : s));
    }
  };

  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (autoSyncedRef.current || !convs.length) return;
    autoSyncedRef.current = true;
    const targets = convs.filter((c: any) => (c.message_count ?? 0) === 0).slice(0, 5);
    (async () => { for (const c of targets) await syncOne(c.id, true); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convs.length]);

  const filtered = useMemo(() => {
    let list = convs;
    if (q) {
      const s = q.toLowerCase();
      list = list.filter((c: any) =>
        (c.seller_name ?? "").toLowerCase().includes(s) ||
        (c.contact_name ?? "").toLowerCase().includes(s) ||
        (c.deal_id ?? "").toLowerCase().includes(s));
    }
    if (minScore) {
      const m = Number(minScore);
      list = list.filter((c: any) => (c.analysis?.score_geral ?? 0) >= m);
    }
    return list;
  }, [convs, q, minScore]);

  return (
    <div className="space-y-3 mt-4">
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Buscar por vendedor, cliente, deal…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Input placeholder="Nota mínima" type="number" min={0} max={10} value={minScore} onChange={(e) => setMinScore(e.target.value)} className="max-w-[120px]" />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">A carregar…</p>}
      {!isLoading && filtered.length === 0 && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma conversa. Vai à aba <b>Nova análise</b> para colar uma transcrição de WhatsApp.
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {filtered.map((c: any) => (
          <Card key={c.id}>
            <CardContent className="p-3 flex items-start gap-3">
              <div className={"h-12 w-12 rounded-lg flex flex-col items-center justify-center shrink-0 " + (c.analysis?.status === "ok" ? "bg-muted" : "bg-muted/50")}>
                <span className={"text-lg font-bold leading-none " + scoreColor(c.analysis?.score_geral)}>
                  {c.analysis?.status === "ok" ? Number(c.analysis.score_geral ?? 0).toFixed(1) : c.analysis?.status === "insufficient_data" ? "—" : "?"}
                </span>
                <span className="text-[10px] text-muted-foreground mt-0.5">nota</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{c.contact_name ?? "Contacto —"}</span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">{c.seller_name ?? c.seller_email ?? "sem vendedor"}</span>
                  {c.analysis?.sentimento && (
                    <span className={"text-[10px] px-1.5 py-0.5 rounded " + sentimentColor(c.analysis.sentimento)}>{c.analysis.sentimento}</span>
                  )}
                  {c.analysis?.tentou_fechar === true && (
                    <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/40">tentou fechar</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {c.origin_name ?? "—"} · {c.stage ?? "—"} · {c.message_count} msgs · Última: {fmtDate(c.last_message_at)} · {fmtEur(c.deal_value)}
                </p>
                {c.analysis?.resumo && <p className="text-xs mt-1 line-clamp-2">{c.analysis.resumo}</p>}
                {c.analysis?.justificativa_nota && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 italic line-clamp-1">{c.analysis.justificativa_nota}</p>
                )}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Link to="/coach/$id" params={{ id: c.id }}>
                  <Button size="sm" variant="outline">Abrir</Button>
                </Link>
                <Button size="sm" variant="ghost" title="Sincronizar mensagens da Clint" onClick={() => syncOne(c.id)} disabled={syncingId === c.id}>
                  <RefreshCw className={"h-3.5 w-3.5 " + (syncingId === c.id ? "animate-spin" : "")} />
                </Button>
                <Button size="sm" variant="ghost" title="Re-analisar" onClick={() => analyze.mutate(c.id)} disabled={analyze.isPending}>
                  <Sparkles className={"h-3.5 w-3.5 " + (analyze.isPending ? "animate-pulse" : "")} />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { if (confirm("Apagar conversa?")) del.mutate(c.id); }}>
                  <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Alertas() {
  const qc = useQueryClient();
  const { data: alerts = [], isLoading } = useQuery({ queryKey: ["coach-alerts"], queryFn: () => listCoachAlertsFn() });

  const scan = useMutation({
    mutationFn: () => runAlertsScanFn(),
    onSuccess: (r: any) => { toast.success(`${r.created} novos alertas`); qc.invalidateQueries({ queryKey: ["coach-alerts"] }); },
  });
  const setState = useMutation({
    mutationFn: ({ id, state }: { id: string; state: "aberto" | "visto" | "resolvido" }) =>
      resolveCoachAlertFn({ data: { id, state } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coach-alerts"] }),
  });

  const typeLabel: Record<string, string> = {
    lead_quente_sem_resposta: "Lead quente sem resposta",
    follow_up_esquecido: "Follow-up esquecido",
    intencao_compra: "Intenção de compra",
    conversa_parada: "Conversa parada",
    risco_perda: "Risco de perda",
    nota_baixa: "Nota baixa",
  };
  const sevColor: Record<string, string> = {
    high: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
    medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    low: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  };
  const stateBadge: Record<string, string> = {
    aberto: "border-slate-300 text-slate-500",
    visto: "border-amber-400 text-amber-600",
    resolvido: "border-emerald-400 text-emerald-600",
  };

  const openCount = alerts.filter((a: any) => a.state === "aberto" || (!a.state && !a.resolved)).length;
  const vistoCount = alerts.filter((a: any) => a.state === "visto").length;
  const resolvidoCount = alerts.filter((a: any) => a.state === "resolvido" || a.resolved).length;

  return (
    <div className="space-y-3 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          {openCount} abertos · {vistoCount} vistos · {resolvidoCount} resolvidos
        </p>
        <Button size="sm" onClick={() => scan.mutate()} disabled={scan.isPending}>
          <RefreshCw className={"h-4 w-4 mr-1 " + (scan.isPending ? "animate-spin" : "")} />Rodar scan
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">A carregar…</p>}
      {!isLoading && alerts.length === 0 && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum alerta.</CardContent></Card>
      )}

      {alerts.map((a: any) => {
        const currentState: string = a.state ?? (a.resolved ? "resolvido" : "aberto");
        const isResolved = currentState === "resolvido";
        return (
          <Card key={a.id} className={isResolved ? "opacity-60" : ""}>
            <CardContent className="p-3 flex items-start gap-3">
              <Badge className={"shrink-0 border " + (sevColor[a.severity] ?? "")}>{a.severity}</Badge>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold">{typeLabel[a.type] ?? a.type}</p>
                  <Badge variant="outline" className={"text-[10px] " + (stateBadge[currentState] ?? "")}>
                    {currentState}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{a.seller_name ?? a.seller_email ?? "—"} · {fmtDate(a.created_at)}</p>
                <p className="text-sm mt-1">{a.message}</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                {a.conversation_id && (
                  <Link to="/coach/$id" params={{ id: a.conversation_id }}>
                    <Button size="sm" variant="outline">Abrir</Button>
                  </Link>
                )}
                {currentState === "aberto" && (
                  <Button size="sm" variant="outline" onClick={() => setState.mutate({ id: a.id, state: "visto" })}>
                    <Eye className="h-3.5 w-3.5 mr-1" />Visto
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={isResolved ? "outline" : "default"}
                  onClick={() => setState.mutate({ id: a.id, state: isResolved ? "aberto" : "resolvido" })}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />{isResolved ? "Reabrir" : "Resolver"}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function UploadTab({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [form, setForm] = useState({
    sellerName: "", sellerEmail: "", contactName: "", contactEmail: "",
    originName: "", stage: "", dealValue: "", transcript: "",
  });
  const upload = useMutation({
    mutationFn: async () => {
      const res = await uploadConversationFn({ data: {
        sellerName: form.sellerName || undefined, sellerEmail: form.sellerEmail || undefined,
        contactName: form.contactName || undefined, contactEmail: form.contactEmail || undefined,
        originName: form.originName || undefined, stage: form.stage || undefined,
        dealValue: form.dealValue ? Number(form.dealValue) : undefined, transcript: form.transcript,
      }});
      try { await analyzeConversationFn({ data: { conversationId: res.id } }); } catch {}
      return res;
    },
    onSuccess: (r) => {
      toast.success(`Conversa criada (${r.message_count} msgs) — análise IA iniciada`);
      qc.invalidateQueries({ queryKey: ["coach-convs"] });
      nav({ to: "/coach/$id", params: { id: r.id } });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha no upload"),
  });

  return (
    <div className="mt-4 space-y-3">
      <Card>
        <CardHeader><CardTitle className="text-base">Nova análise de conversa</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Vendedor</Label><Input value={form.sellerName} onChange={(e) => setForm({ ...form, sellerName: e.target.value })} placeholder="Ex: Gisele Pimentel" /></div>
            <div><Label className="text-xs">Email vendedor</Label><Input value={form.sellerEmail} onChange={(e) => setForm({ ...form, sellerEmail: e.target.value })} /></div>
            <div><Label className="text-xs">Cliente</Label><Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></div>
            <div><Label className="text-xs">Email cliente</Label><Input value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></div>
            <div><Label className="text-xs">Origem/Funil</Label><Input value={form.originName} onChange={(e) => setForm({ ...form, originName: e.target.value })} /></div>
            <div><Label className="text-xs">Etapa</Label><Input value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} /></div>
            <div><Label className="text-xs">Valor negócio (€)</Label><Input type="number" value={form.dealValue} onChange={(e) => setForm({ ...form, dealValue: e.target.value })} /></div>
          </div>
          <div>
            <Label className="text-xs">Transcrição da conversa</Label>
            <Textarea
              rows={12} value={form.transcript}
              onChange={(e) => setForm({ ...form, transcript: e.target.value })}
              placeholder={"Cola aqui o export do WhatsApp. Exemplo:\n[12/07/2026, 14:32] Gisele: Bom dia!\n[12/07/2026, 14:40] João: Olá, sim"}
              className="font-mono text-xs"
            />
          </div>
          <Button onClick={() => upload.mutate()} disabled={upload.isPending || form.transcript.trim().length < 20}>
            {upload.isPending ? "A processar…" : "Analisar com IA"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ConfigTab() {
  const qc = useQueryClient();
  const { data: cfg } = useQuery({ queryKey: ["coach-config"], queryFn: () => getCoachConfigFn() });
  const [form, setForm] = useState<CoachConfig | null>(null);
  const current = form ?? cfg;

  const save = useMutation({
    mutationFn: () => saveCoachConfigFn({ data: {
      nota_minima: Number(current!.nota_minima),
      horas_lead_quente: Number(current!.horas_lead_quente),
      dias_sem_resposta: Number(current!.dias_sem_resposta),
      auto_analysis: current!.auto_analysis ?? true,
      analysis_interval_hours: Number(current!.analysis_interval_hours ?? 1),
      seller_phones: current!.seller_phones ?? [],
    }}),
    onSuccess: () => { toast.success("Config salva"); qc.invalidateQueries({ queryKey: ["coach-config"] }); setForm(null); },
  });

  if (!current) return <p className="text-sm text-muted-foreground mt-4">A carregar…</p>;
  const phones = current.seller_phones ?? [];

  function updatePhone(idx: number, field: "name" | "phone", value: string) {
    setForm({ ...current!, seller_phones: phones.map((p, i) => i === idx ? { ...p, [field]: value } : p) });
  }

  return (
    <div className="mt-4 space-y-4 max-w-lg">
      <Card>
        <CardHeader><CardTitle className="text-base">Parâmetros de alerta</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Nota mínima aceitável (0–10)</Label>
            <Input type="number" min={0} max={10} value={current.nota_minima}
              onChange={(e) => setForm({ ...current, nota_minima: Number(e.target.value) })} />
          </div>
          <div>
            <Label className="text-xs">Horas até "lead quente sem resposta"</Label>
            <Input type="number" min={1} value={current.horas_lead_quente}
              onChange={(e) => setForm({ ...current, horas_lead_quente: Number(e.target.value) })} />
          </div>
          <div>
            <Label className="text-xs">Dias sem resposta = conversa parada</Label>
            <Input type="number" min={1} value={current.dias_sem_resposta}
              onChange={(e) => setForm({ ...current, dias_sem_resposta: Number(e.target.value) })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Auto-análise</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Ativar auto-análise de conversas Clint</Label>
            <Switch checked={current.auto_analysis ?? true}
              onCheckedChange={(v) => setForm({ ...current, auto_analysis: v })} />
          </div>
          {(current.auto_analysis ?? true) && (
            <div>
              <Label className="text-xs">Intervalo mínimo entre análises (horas)</Label>
              <Input type="number" min={1} value={current.analysis_interval_hours ?? 1}
                onChange={(e) => setForm({ ...current, analysis_interval_hours: Number(e.target.value) })} />
              <p className="text-[10px] text-muted-foreground mt-1">
                Só analisa conversas com última mensagem há pelo menos este número de horas.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-4 w-4" />Telefones dos vendedores
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Usados para identificar quem é "vendedor" nas mensagens do webhook da Clint.
          </p>
          {phones.map((p, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <Input placeholder="Ex: 351910000000" value={p.phone}
                onChange={(e) => updatePhone(idx, "phone", e.target.value)} className="text-xs flex-1" />
              <Input placeholder="Nome" value={p.name}
                onChange={(e) => updatePhone(idx, "name", e.target.value)} className="text-xs flex-1" />
              <Button size="sm" variant="ghost"
                onClick={() => setForm({ ...current, seller_phones: phones.filter((_, i) => i !== idx) })}>
                <X className="h-3.5 w-3.5 text-rose-500" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline"
            onClick={() => setForm({ ...current, seller_phones: [...phones, { name: "", phone: "" }] })}>
            <Plus className="h-3.5 w-3.5 mr-1" />Adicionar vendedor
          </Button>
        </CardContent>
      </Card>

      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? "A salvar…" : "Salvar configuração"}
      </Button>
    </div>
  );
}

function IntegracaoClint() {
  const qc = useQueryClient();
  const isPreview = typeof window !== "undefined" && window.location.hostname.includes("lovableproject.com");
  const webhookUrl = isPreview
    ? "https://dashboardvendascomercial.lovable.app/api/clint/webhook"
    : typeof window !== "undefined"
      ? `${window.location.origin}/api/clint/webhook`
      : "/api/clint/webhook";


  const { data: stats } = useQuery({
    queryKey: ["clint-webhook-stats"], queryFn: () => fetchClintWebhookStatsFn(), refetchInterval: 30_000,
  });
  const { data: logs = [] } = useQuery({
    queryKey: ["clint-integration-logs"], queryFn: () => fetchClintIntegrationLogsFn(), refetchInterval: 30_000,
  });

  const [migrationSql, setMigrationSql] = React.useState<string | null>(null);
  const migrate = useMutation({
    mutationFn: () => runClintMigrationsFn(),
    onSuccess: (res) => {
      if ((res as any)?.already_applied) toast.success("Migrations já aplicadas!");
      else toast.success("Tabelas criadas com sucesso");
      setMigrationSql(null);
      qc.invalidateQueries({ queryKey: ["clint-webhook-stats"] });
    },
    onError: (e: unknown) => {
      const msg = (e as Error).message ?? "";
      if (msg.startsWith("MIGRATION_NEEDED:")) setMigrationSql(msg.replace("MIGRATION_NEEDED:", ""));
      else toast.error(msg || "Falha ao verificar migrations");
    },
  });

  const statusColor = stats?.is_connected
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    : "bg-slate-500/15 text-slate-600 dark:text-slate-400";

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground mb-1">Status</p>
          <span className={"text-sm font-semibold px-2 py-1 rounded " + statusColor}>
            {stats?.is_connected ? "Conectado" : "Aguardando eventos"}
          </span>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground mb-1">Conversas via webhook</p>
          <p className="text-2xl font-bold">{stats?.webhook_conversation_count ?? 0}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground mb-1">Último evento</p>
          <p className="text-sm">{stats?.last_event_at ? fmtDate(stats.last_event_at) : "—"}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">URL do webhook</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted px-3 py-2 rounded text-xs font-mono break-all">{webhookUrl}</code>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("URL copiada!"); }}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Configure em <b>Clint → Configurações → Integrações → Webhooks</b>.
            Selecione "Qualquer mudança de etapa" e mensagens de atendimento.
          </p>
        </CardContent>
      </Card>

      <HotmartWebhookCard />


      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Credenciais Clint</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">API Token Clint</Label>
              <Input type="password" placeholder="U2FsdGVkX1/+..." className="font-mono text-xs"
                defaultValue={import.meta.env.VITE_CLINT_TOKEN ?? ""} readOnly />
              <p className="text-[10px] text-muted-foreground mt-1">Definido via VITE_CLINT_TOKEN</p>
            </div>
            <div>
              <Label className="text-xs">API Base URL</Label>
              <Input value="https://api.clint.digital/v1/" readOnly className="text-xs" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Inicialização do banco</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Verifica se as tabelas v2 foram aplicadas.
          </p>
          <Button onClick={() => migrate.mutate()} disabled={migrate.isPending} variant="outline">
            <RefreshCw className={"h-4 w-4 mr-2 " + (migrate.isPending ? "animate-spin" : "")} />
            {migrate.isPending ? "Verificando…" : "Verificar migrations"}
          </Button>
          {migrationSql && (
            <div className="space-y-2">
              <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">{migrationSql}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Log de eventos recentes</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ["clint-integration-logs"] })}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum evento registrado. Configure o webhook na Clint e aguarde.
            </p>
          )}
          <div className="space-y-1.5">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 text-xs">
                <span className={"shrink-0 px-1.5 py-0.5 rounded font-medium " + (
                  log.status === "processed" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : log.status === "error" ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                  : "bg-slate-500/15 text-slate-600 dark:text-slate-400"
                )}>{log.status}</span>
                <span className="text-muted-foreground shrink-0">{fmtDate(log.created_at)}</span>
                <span className={
                  log.event_type === "unknown"
                    ? "font-mono text-amber-500"
                    : "font-mono"
                }>
                  {log.event_type === "unknown" ? "⚠ unknown (evento não reconhecido)" : log.event_type ?? "—"}
                </span>
                {log.error_msg && <span className="text-rose-500 truncate">{log.error_msg}</span>}
              </div>

            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
