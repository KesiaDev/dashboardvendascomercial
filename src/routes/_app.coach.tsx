import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Sparkles, Upload, AlertTriangle, Settings, MessageSquare,
  TrendingUp, Clock, Target, Users, RefreshCw, Trash2, CheckCircle2,
  Zap, Copy, Eye, BarChart2, Phone, Plus, X, Award, CalendarIcon,
} from "lucide-react";
import { fetchPerformanceFn, generatePerformanceFeedbackFn, rangeBoundsFor, type PerfRange, type SellerPerf, type PerfResult } from "@/lib/performance.functions";
import { getSellerPhoto } from "@/lib/seller-photos";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  listCoachConversationsFn, listCoachAlertsFn, uploadConversationFn,
  analyzeConversationFn, runAlertsScanFn, resolveCoachAlertFn,
  deleteCoachConversationFn, getCoachConfigFn, saveCoachConfigFn,
  fetchClintWebhookStatsFn, fetchClintIntegrationLogsFn, runClintMigrationsFn,
  fetchWeeklyStatsFn, runAutoAnalysisFn, syncClintMessagesFn,
  generateTeamInsightsFn, type TeamInsights,
  type CoachConfig, type WeeklyStats,
} from "@/lib/coach.functions";
import { getHotmartWebhookTokenFn } from "@/lib/hotmart-webhook.functions";
import { syncCcpbxCallsFn, listCcpbxCallsFn, analyzeCallFn, type CallRow } from "@/lib/ccpbx.functions";

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
const SELLER_NAME_MAP: { match: string[]; name: string }[] = [
  { name: "João Pessoa",      match: ["joaopessoa", "joao pessoa", "joão pessoa"] },
  { name: "Fabio Nadal",      match: ["fabionadal", "fabio nadal", "nadal"] },
  { name: "Luana Guimarães",  match: ["luanaguimaraes", "luana.guimaraes", "luana guimaraes", "luana guimarães", "luana"] },
  { name: "Gisele Pimentel",  match: ["giselegagliano", "gisele gagliano", "gisele pimentel", "gisele"] },
  { name: "Rita Bandeira",    match: ["ritabandeira", "rita bandeira", "rita"] },
];
function displaySellerName(nameOrEmail: string | null | undefined): string {
  const raw = (nameOrEmail ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "—";
  const lower = raw.toLowerCase();
  for (const { match, name } of SELLER_NAME_MAP) {
    for (const m of match) if (lower === m || lower.includes(m)) return name;
  }
  // Se veio email genérico, mostra a parte antes do @
  if (raw.includes("@")) return raw.split("@")[0];
  return raw;
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
        <Sparkles className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Análise Comercial</h1>
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
          <TabsTrigger value="performance"><Award className="h-4 w-4 mr-1" />Performance</TabsTrigger>
          <TabsTrigger value="alertas"><AlertTriangle className="h-4 w-4 mr-1" />Alertas</TabsTrigger>
          <TabsTrigger value="ligacoes"><Phone className="h-4 w-4 mr-1" />Ligações</TabsTrigger>
          <TabsTrigger value="upload"><Upload className="h-4 w-4 mr-1" />Nova análise</TabsTrigger>
          <TabsTrigger value="config"><Settings className="h-4 w-4 mr-1" />Config</TabsTrigger>
          <TabsTrigger value="integracao"><Zap className="h-4 w-4 mr-1" />Integração Clint</TabsTrigger>
        </TabsList>
        <TabsContent value="visao"><VisaoGeral /></TabsContent>
        <TabsContent value="conversas"><Conversas /></TabsContent>
        <TabsContent value="performance"><PerformanceTab /></TabsContent>
        <TabsContent value="alertas"><Alertas /></TabsContent>
        <TabsContent value="ligacoes"><LigacoesTab /></TabsContent>
        <TabsContent value="upload"><UploadTab onDone={() => setTab("conversas")} /></TabsContent>
        <TabsContent value="config"><ConfigTab /></TabsContent>
        <TabsContent value="integracao"><IntegracaoClint /></TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({ icon, label, value, valueClass = "" }: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <Card className="h-full">
      <CardContent className="h-full pt-4 pb-3 flex flex-col justify-between">
        <div className="flex items-start gap-2 text-xs text-muted-foreground min-h-[2.5rem] leading-tight">{icon}{label}</div>
        <p className={"text-2xl font-bold " + valueClass}>{value}</p>
      </CardContent>
    </Card>
  );
}

function WeeklyChart({ stats }: { stats: WeeklyStats[] }) {
  const weeks = [...new Set(stats.map((s) => s.week_start))].sort((a, b) => b.localeCompare(a)).slice(0, 6);
  // Dedup por nome canônico (mesmo vendedor pode aparecer como email + variantes)
  type Agg = { sum: number; n: number };
  const byCanonical = new Map<string, Map<string, Agg>>(); // canonical → week → agg
  for (const s of stats) {
    const canonical = displaySellerName(s.seller_name ?? s.seller_email ?? "—");
    let weekMap = byCanonical.get(canonical);
    if (!weekMap) { weekMap = new Map(); byCanonical.set(canonical, weekMap); }
    const w = s.week_start;
    const cur = weekMap.get(w) ?? { sum: 0, n: 0 };
    const score = Number(s.avg_score ?? 0);
    cur.sum += score; cur.n += 1;
    weekMap.set(w, cur);
  }
  const sellers = Array.from(byCanonical.keys()).sort();
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
              <td className="py-1 pr-3 font-medium truncate max-w-[160px]">{seller}</td>
              {weeks.map((w) => {
                const agg = byCanonical.get(seller)?.get(w);
                const avg = agg && agg.n > 0 ? agg.sum / agg.n : null;
                return (
                  <td key={w} className="px-2 text-center">
                    {avg != null ? (
                      <span className={"font-bold " + scoreColor(avg)}>{avg.toFixed(1)}</span>
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
    const raw = (c as any).seller_name ?? (c as any).seller_email ?? "—";
    const canonical = displaySellerName(raw);
    const cur = bySeller.get(canonical) ?? { name: canonical, count: 0, sum: 0, wins: 0 };
    cur.count += 1; cur.sum += Number(a.score_geral ?? 0);
    if (a.tentou_fechar) cur.wins += 1;
    bySeller.set(canonical, cur);
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
                <span className="flex-1 text-sm truncate">{displaySellerName(s.name)}</span>
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
  const [sellerFilter, setSellerFilter] = useState("");

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

  const [bulk, setBulk] = useState<{ running: boolean; done: number; total: number; mode: "" | "analyze" | "sync" }>({ running: false, done: 0, total: 0, mode: "" });
  const bulkCancelRef = useRef(false);


  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (autoSyncedRef.current || !convs.length) return;
    autoSyncedRef.current = true;
    const targets = convs.filter((c: any) => (c.message_count ?? 0) === 0).slice(0, 5);
    (async () => { for (const c of targets) await syncOne(c.id, true); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convs.length]);

  const sellerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of convs as any[]) {
      const key = (c.seller_email ?? c.seller_name ?? "").toString();
      if (!key) continue;
      if (!map.has(key)) map.set(key, displaySellerName(c.seller_name ?? c.seller_email ?? key));
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [convs]);

  const filtered = useMemo(() => {
    let list = convs;
    if (sellerFilter) {
      list = list.filter((c: any) => (c.seller_email ?? c.seller_name ?? "") === sellerFilter);
    }
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
  }, [convs, q, minScore, sellerFilter]);

  return (
    <div className="space-y-3 mt-4">
      <TeamInsightsPanel />
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={sellerFilter}
          onChange={(e) => setSellerFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Todos os vendedores</option>
          {sellerOptions.map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <Input placeholder="Buscar por vendedor, cliente, deal…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Input placeholder="Nota mínima" type="number" min={0} max={10} value={minScore} onChange={(e) => setMinScore(e.target.value)} className="max-w-[120px]" />
        {(sellerFilter || q || minScore) && (
          <Button size="sm" variant="ghost" onClick={() => { setSellerFilter(""); setQ(""); setMinScore(""); }}>Limpar</Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} de {convs.length}</span>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Button
          size="sm"
          variant="default"
          disabled={bulk.running || filtered.length === 0}
          onClick={async () => {
            const list = filtered as any[];
            if (!list.length) return;
            if (!confirm(`Analisar ${list.length} conversa(s) filtrada(s)? Isto pode demorar.`)) return;
            bulkCancelRef.current = false;
            setBulk({ running: true, done: 0, total: list.length, mode: "analyze" });
            let ok = 0, fail = 0;
            for (let i = 0; i < list.length; i++) {
              if (bulkCancelRef.current) break;
              try {
                await analyzeConversationFn({ data: { conversationId: list[i].id, force: true } });
                ok++;
              } catch { fail++; }
              setBulk((b) => ({ ...b, done: i + 1 }));
            }
            setBulk({ running: false, done: 0, total: 0, mode: "" });
            qc.invalidateQueries({ queryKey: ["coach-convs"] });
            qc.invalidateQueries({ queryKey: ["coach-alerts"] });
            qc.invalidateQueries({ queryKey: ["coach-weekly"] });
            toast.success(`Análise concluída: ${ok} ok · ${fail} falhas`);
          }}
        >
          <Sparkles className={"h-3.5 w-3.5 mr-1 " + (bulk.running && bulk.mode === "analyze" ? "animate-pulse" : "")} />
          Analisar todas ({filtered.length})
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={bulk.running || filtered.length === 0}
          onClick={async () => {
            const list = filtered as any[];
            if (!list.length) return;
            if (!confirm(`Sincronizar mensagens de ${list.length} conversa(s)?`)) return;
            bulkCancelRef.current = false;
            setBulk({ running: true, done: 0, total: list.length, mode: "sync" });
            let ok = 0, fail = 0;
            for (let i = 0; i < list.length; i++) {
              if (bulkCancelRef.current) break;
              const r = await syncOne(list[i].id, true);
              if (r) ok++; else fail++;
              setBulk((b) => ({ ...b, done: i + 1 }));
            }
            setBulk({ running: false, done: 0, total: 0, mode: "" });
            qc.invalidateQueries({ queryKey: ["coach-convs"] });
            toast.success(`Sync concluído: ${ok} ok · ${fail} falhas`);
          }}
        >
          <RefreshCw className={"h-3.5 w-3.5 mr-1 " + (bulk.running && bulk.mode === "sync" ? "animate-spin" : "")} />
          Sincronizar todas
        </Button>
        {bulk.running && (
          <>
            <span className="text-xs text-muted-foreground">
              {bulk.mode === "analyze" ? "Analisando" : "Sincronizando"} {bulk.done}/{bulk.total}…
            </span>
            <Button size="sm" variant="ghost" onClick={() => { bulkCancelRef.current = true; }}>
              Cancelar
            </Button>
          </>
        )}
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

function TeamInsightsPanel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<TeamInsights | null>(null);
  const gen = useMutation({
    mutationFn: () => generateTeamInsightsFn({ data: { days } }),
    onSuccess: (r) => { setData(r); toast.success(`Insights gerados (${r.sample_size} conversas)`); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao gerar insights"),
  });

  const prioColor = (p: string) =>
    p === "alta" ? "bg-red-500/15 text-red-600 dark:text-red-400"
    : p === "media" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Visão do Coordenador — padrões do time
          </CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value={7}>Últimos 7 dias</option>
              <option value={14}>Últimos 14 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={60}>Últimos 60 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </select>
            <Button size="sm" onClick={() => gen.mutate()} disabled={gen.isPending}>
              <Sparkles className={"h-3.5 w-3.5 mr-1 " + (gen.isPending ? "animate-pulse" : "")} />
              {gen.isPending ? "Analisando…" : data ? "Regenerar" : "Gerar insights"}
            </Button>
          </div>
        </div>
        {!data && !gen.isPending && (
          <p className="text-xs text-muted-foreground">
            Cruza todas as análises recentes e devolve padrões comuns, treinos recomendados e boas práticas para compartilhar entre o time.
          </p>
        )}
      </CardHeader>
      {data && (
        <CardContent className="space-y-4 pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="rounded-md bg-muted/50 p-2">
              <div className="text-muted-foreground">Conversas</div>
              <div className="text-base font-semibold">{data.sample_size}</div>
            </div>
            <div className="rounded-md bg-muted/50 p-2">
              <div className="text-muted-foreground">Nota média</div>
              <div className="text-base font-semibold">{data.avg_score?.toFixed(1) ?? "—"}</div>
            </div>
            <div className="rounded-md bg-muted/50 p-2">
              <div className="text-muted-foreground">Janela</div>
              <div className="text-base font-semibold">{data.window_days}d</div>
            </div>
            <div className="rounded-md bg-muted/50 p-2">
              <div className="text-muted-foreground">Gerado em</div>
              <div className="text-xs font-medium">{fmtDate(data.generated_at)}</div>
            </div>
          </div>

          {data.coordinator_summary && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm leading-relaxed">
              {data.coordinator_summary}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border p-3">
              <div className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Pontos a melhorar (padrões do time)
              </div>
              {data.top_weaknesses.length === 0 && <p className="text-xs text-muted-foreground">Sem padrões relevantes.</p>}
              <ul className="space-y-2">
                {data.top_weaknesses.map((w, i) => (
                  <li key={i} className="text-xs">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold">{w.theme}</span>
                      <Badge variant="outline" className="text-[10px]">{w.frequency}×</Badge>
                    </div>
                    {w.example && <div className="text-muted-foreground italic mt-0.5">“{w.example}”</div>}
                    {w.sellers?.length > 0 && <div className="text-[10px] text-muted-foreground mt-0.5">Afeta: {w.sellers.join(", ")}</div>}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-md border p-3">
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Boas práticas para compartilhar
              </div>
              {data.top_strengths.length === 0 && data.shareable_best_practices.length === 0 && (
                <p className="text-xs text-muted-foreground">Sem destaques ainda.</p>
              )}
              <ul className="space-y-2">
                {data.top_strengths.map((w, i) => (
                  <li key={"s" + i} className="text-xs">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold">{w.theme}</span>
                      <Badge variant="outline" className="text-[10px]">{w.frequency}×</Badge>
                    </div>
                    {w.example && <div className="text-muted-foreground italic mt-0.5">“{w.example}”</div>}
                    {w.sellers?.length > 0 && <div className="text-[10px] text-muted-foreground mt-0.5">Referência: {w.sellers.join(", ")}</div>}
                  </li>
                ))}
                {data.shareable_best_practices.map((p, i) => (
                  <li key={"p" + i} className="text-xs border-t pt-2">
                    <div>{p.practice}</div>
                    <div className="text-[10px] text-muted-foreground">Vindo de: {p.from_seller}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border p-3">
              <div className="text-xs font-semibold mb-2 flex items-center gap-1">
                <Target className="h-3.5 w-3.5" /> Treinamentos recomendados
              </div>
              {data.training_recommendations.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
              <ul className="space-y-2">
                {data.training_recommendations.map((t, i) => (
                  <li key={i} className="text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{t.title}</span>
                      <span className={"text-[10px] px-1.5 py-0.5 rounded " + prioColor(t.priority)}>{t.priority}</span>
                      <Badge variant="outline" className="text-[10px]">{t.format}</Badge>
                    </div>
                    <div className="text-muted-foreground mt-0.5">{t.why}</div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-md border p-3">
              <div className="text-xs font-semibold mb-2 flex items-center gap-1">
                <Award className="h-3.5 w-3.5" /> Foco por vendedor
              </div>
              {data.seller_focus.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
              <ul className="space-y-2">
                {data.seller_focus.map((s, i) => (
                  <li key={i} className="text-xs">
                    <div className="font-semibold">{s.seller}</div>
                    <div className="text-muted-foreground">{s.focus}</div>
                    <div className="mt-0.5"><span className="text-[10px] text-primary">Ação:</span> {s.suggested_action}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {data.top_objections.length > 0 && (
            <div className="rounded-md border p-3">
              <div className="text-xs font-semibold mb-2">Objeções mais frequentes</div>
              <div className="flex flex-wrap gap-1.5">
                {data.top_objections.map((o, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">{o.theme} · {o.frequency}×</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
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
    onSuccess: (_r, v) => {
      toast.success(v.state === "resolvido" ? "Alerta resolvido" : v.state === "visto" ? "Marcado como visto" : "Alerta reaberto");
      qc.invalidateQueries({ queryKey: ["coach-alerts"] });
    },
    onError: (e: any) => toast.error(`Falha ao atualizar alerta: ${e?.message ?? e}`),
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

function HotmartWebhookCard() {
  const { data } = useQuery({
    queryKey: ["hotmart-webhook-token"],
    queryFn: () => getHotmartWebhookTokenFn(),
  });
  const isPreview = typeof window !== "undefined" && window.location.hostname.includes("lovableproject.com");
  const origin = isPreview
    ? "https://dashboardvendascomercial.lovable.app"
    : typeof window !== "undefined" ? window.location.origin : "";
  const token = data?.token ?? "";
  const url = token ? `${origin}/api/hotmart/webhook?hottok=${token}` : `${origin}/api/hotmart/webhook?hottok=…`;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Hotmart Webhook</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-muted px-3 py-2 rounded text-xs font-mono break-all">{url}</code>
          <Button size="sm" variant="outline" disabled={!token}
            onClick={() => { navigator.clipboard.writeText(url); toast.success("URL copiada!"); }}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Configure em <b>Hotmart → Ferramentas → Webhook</b>. Eventos: <code>PURCHASE_APPROVED</code>,
          <code>PURCHASE_COMPLETE</code>, <code>PURCHASE_REFUNDED</code>, <code>PURCHASE_CHARGEBACK</code>,
          <code>PURCHASE_CANCELED</code>, <code>PURCHASE_DISPUTE</code>. Alimenta a tabela <code>sales</code> automaticamente.
        </p>
      </CardContent>
    </Card>
  );
}


// ==================== PERFORMANCE TAB ====================
function fmtEUR(n: number) {
  return "€" + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n: number) {
  return (n * 100).toFixed(1) + "%";
}
function SellerAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const photo = getSellerPhoto(name);
  const initials = name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  if (photo) {
    return <img src={photo} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white flex items-center justify-center text-[10px] font-bold"
      style={{ width: size, height: size }}
    >
      {initials || "?"}
    </div>
  );
}

function PerformanceTab() {
  const [range, setRange] = useState<PerfRange>("week");
  const [scope, setScope] = useState<"team" | "seller">("team");
  const [sellerKey, setSellerKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string>("");
  const todayISO = new Date().toISOString().slice(0, 10);
  const [refDate, setRefDate] = useState<string>(todayISO);

  const effectiveRefDate = range === "day" ? refDate : undefined;

  const { data: perf, isLoading, isFetching, error: perfError } = useQuery({
    queryKey: ["coach-perf", range, effectiveRefDate ?? "today"],
    queryFn: () => fetchPerformanceFn({ data: { range, refDate: effectiveRefDate } }),
    placeholderData: (prev) => prev, // mantém os KPIs visíveis durante refetch (evita "zerar")
    staleTime: 60_000,
  });

  const fbMutation = useMutation({
    mutationFn: () => generatePerformanceFeedbackFn({ data: { range, scope, sellerKey: sellerKey ?? undefined, refDate: effectiveRefDate } }),
    onSuccess: (r) => setFeedback((r as any).text ?? ""),
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  const rangeLabel = perf?.periodLabel ?? (range === "day" ? "Hoje" : range === "week" ? "Semana" : "Mês");

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border p-1 bg-card">
          {(["day", "week", "month"] as PerfRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={
                "px-3 py-1 text-xs rounded-md transition " +
                (range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
              }
            >
              {r === "day" ? "Diário" : r === "week" ? "Semanal" : "Mensal"}
            </button>
          ))}
        </div>
        {range === "day" && (
          <input
            type="date"
            value={refDate}
            max={todayISO}
            onChange={(e) => setRefDate(e.target.value || todayISO)}
            className="text-xs border rounded-md px-2 py-1 bg-background"
          />
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex rounded-lg border p-1 bg-card">
            <button
              onClick={() => { setScope("team"); setSellerKey(null); }}
              className={"px-3 py-1 text-xs rounded-md " + (scope === "team" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            >Equipe</button>
            <button
              onClick={() => setScope("seller")}
              className={"px-3 py-1 text-xs rounded-md " + (scope === "seller" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            >Por vendedor</button>
          </div>
          {scope === "seller" && perf && (
            <select
              className="text-xs border rounded-md px-2 py-1 bg-background"
              value={sellerKey ?? ""}
              onChange={(e) => setSellerKey(e.target.value || null)}
            >
              <option value="">— escolher —</option>
              {perf.sellers.map((s) => (
                <option key={s.key} value={s.key}>{s.name}</option>
              ))}
            </select>
          )}
          <Button
            size="sm"
            onClick={() => fbMutation.mutate()}
            disabled={fbMutation.isPending || (scope === "seller" && !sellerKey)}
          >
            <Sparkles className="h-4 w-4 mr-1" />
            {fbMutation.isPending ? "Gerando..." : "Gerar feedback IA"}
          </Button>
        </div>
      </div>

      {perfError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Erro ao carregar performance: {String((perfError as any)?.message ?? perfError)}
        </div>
      )}
      {isFetching && perf && (
        <div className="text-xs text-muted-foreground">Atualizando dados…</div>
      )}

      {/* KPIs — respeitam o filtro Equipe / Por vendedor */}
      {perf && (() => {
        const showAttendance = (perf.periodStart ?? "") >= "2026-08-01";
        const selected = scope === "seller" && sellerKey
          ? perf.sellers.find((s) => s.key === sellerKey) ?? null
          : null;
        const isSeller = !!selected;
        const view = selected
          ? {
              leadsNovos: selected.leadsNovos,
              atendimentos: selected.atendimentos,
              leadsSemAtendimento: 0,
              vendas: selected.vendas,
              faturamento: selected.faturamento,
              conversaoLead: selected.conversaoLead,
              taxaConversao: selected.taxaConversao,
              leadPorVenda: selected.vendas > 0 ? selected.leadsNovos / selected.vendas : null,
              coberturaAtendimento: selected.leadsNovos > 0 ? selected.atendimentos / selected.leadsNovos : 0,
              notaMedia: selected.notaMedia,
            }
          : perf.team;
        const scopeLabel = isSeller ? selected!.name : rangeLabel;
        return (
          <>
            {isSeller && (
              <div className="text-xs text-muted-foreground -mb-1">
                Mostrando apenas: <span className="font-medium text-foreground">{selected!.name}</span>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 auto-rows-fr">
              <KpiCard icon={<Users className="h-3 w-3" />} label={`Leads V3 (${isSeller ? scopeLabel : rangeLabel})`} value={String(view.leadsNovos)} />
              {showAttendance && (
                <KpiCard
                  icon={<MessageSquare className="h-3 w-3" />}
                  label="Atendimentos (V3)"
                  value={String(view.atendimentos)}
                />
              )}
              {showAttendance && !isSeller && (
                <KpiCard
                  icon={<Users className="h-3 w-3" />}
                  label="Leads V3 sem 1º atendimento"
                  value={String(perf.team.leadsSemAtendimento)}
                  valueClass={perf.team.leadsSemAtendimento > 0 ? "text-amber-600" : "text-emerald-600"}
                />
              )}
              <KpiCard icon={<CheckCircle2 className="h-3 w-3" />} label="Vendas" value={String(view.vendas)} />
              <KpiCard icon={<TrendingUp className="h-3 w-3" />} label="Faturamento" value={fmtEUR(view.faturamento)} />
              <KpiCard
                icon={<Target className="h-3 w-3" />}
                label="Conv. lead→venda"
                value={fmtPct(view.conversaoLead)}
                valueClass="text-emerald-600"
              />
              <KpiCard icon={<Sparkles className="h-3 w-3" />} label="Nota IA média" value={view.notaMedia != null ? view.notaMedia.toFixed(1) : "—"} valueClass={scoreColor(view.notaMedia)} />
            </div>
            {showAttendance ? (
              <div className="text-[11px] text-muted-foreground -mt-2 px-1 space-y-1">
                <div>
                  {!isSeller && (<>Cobertura de atendimento V3: <span className="font-medium text-foreground">{fmtPct(view.coberturaAtendimento)}</span>{" · "}</>)}
                  Taxa atendimento→venda: <span className="font-medium text-foreground">{fmtPct(view.taxaConversao)}</span>
                  {view.leadPorVenda != null && (
                    <> · Leads por venda: <span className="font-medium text-foreground">{view.leadPorVenda.toFixed(1)}</span></>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground -mt-2 px-1">
                Métricas de atendimento ocultas até 01/08/2026 enquanto concluímos o backfill do histórico de conversas.
              </div>
            )}
          </>
        );
      })()}




      {/* Feedback IA */}
      {feedback && (
        <Card className="border-fuchsia-500/30 bg-fuchsia-500/5">
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-fuchsia-500" />
              Mensagem WhatsApp · {scope === "team" ? "equipe" : perf?.sellers.find((s) => s.key === sellerKey)?.name} · {rangeLabel}
            </CardTitle>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(feedback); toast.success("Copiado! Cole no WhatsApp 📋"); }}>
                Copiar
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(feedback)}`, "_blank")}>
                Abrir WhatsApp
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm whitespace-pre-wrap leading-relaxed font-sans">{feedback}</div>
          </CardContent>
        </Card>

      )}

      {/* Daily mini-chart */}
      {perf && perf.range !== "day" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><BarChart2 className="h-4 w-4" />Atendimentos × Vendas por dia</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyBars daily={perf.daily} />
          </CardContent>
        </Card>
      )}

      {/* Ranking */}
      {perf && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" />Ranking por vendedor · {rangeLabel}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {isLoading ? (
              <p className="text-xs text-muted-foreground">Carregando…</p>
            ) : perf.sellers.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma atividade no período.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="text-left py-2 pl-1">#</th>
                    <th className="text-left">Vendedor</th>
                    <th className="text-right" title="Leads novos no período filtrado">Leads</th>
                    <th className="text-right">Atend.</th>
                    <th className="text-right">Vendas</th>
                    <th className="text-right">Faturamento</th>
                    <th className="text-right" title="Vendas ÷ Leads">Conv. Lead</th>
                    <th className="text-right" title="Vendas ÷ Atendimentos">Conv. Atend.</th>
                    <th className="text-right">Nota IA</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(scope === "seller" && sellerKey ? perf.sellers.filter((s) => s.key === sellerKey) : perf.sellers).map((s, i) => (
                    <tr key={s.key} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 pl-1 text-xs text-muted-foreground">{i + 1}º</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <SellerAvatar name={s.name} />
                          <div>
                            <div className="font-medium">{s.name}</div>
                            <div className="text-[10px] text-muted-foreground">{s.email || "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="text-right">{s.leadsNovos}</td>
                      <td className="text-right">{s.atendimentos}</td>
                      <td className="text-right font-medium">{s.vendas}</td>
                      <td className="text-right">{fmtEUR(s.faturamento)}</td>
                      <td className="text-right">{s.leadsNovos > 0 ? fmtPct(s.conversaoLead) : "—"}</td>
                      <td className="text-right">{fmtPct(s.taxaConversao)}</td>
                      <td className={"text-right font-semibold " + scoreColor(s.notaMedia)}>
                        {s.notaMedia != null ? s.notaMedia.toFixed(1) : "—"}
                      </td>

                      <td className="text-right">
                        <button
                          onClick={() => { setScope("seller"); setSellerKey(s.key); fbMutation.mutate(); }}
                          className="text-[10px] text-fuchsia-600 hover:underline"
                          title="Gerar feedback IA para este vendedor"
                        >
                          <Sparkles className="h-3 w-3 inline" /> IA
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DailyBars({ daily }: { daily: PerfResult["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => Math.max(d.leads, d.atendimentos, d.vendas)));
  if (!daily.length) {
    return <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">Sem dados no período.</div>;
  }
  const chartWidth = Math.max(420, daily.length * 88);
  const chartHeight = 180;
  const top = 22;
  const bottom = 24;
  const plotHeight = chartHeight - top - bottom;
  const groupWidth = chartWidth / daily.length;
  const barWidth = Math.max(8, Math.min(16, groupWidth * 0.18));
  const scaleY = (value: number) => (value / max) * plotHeight;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-3">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-44 min-w-full" role="img" aria-label="Leads novos, atendimentos e vendas por dia">
          <line x1="0" x2={chartWidth} y1={chartHeight - bottom} y2={chartHeight - bottom} className="stroke-border" strokeWidth="1" />
          {daily.map((d, i) => {
            const cx = groupWidth * i + groupWidth / 2;
            const baseY = chartHeight - bottom;
            const bars = [
              { key: "leads", v: d.leads, cls: "fill-amber-500/80", off: -barWidth - 2 - barWidth },
              { key: "atend", v: d.atendimentos, cls: "fill-indigo-500/70", off: -barWidth / 2 },
              { key: "vendas", v: d.vendas, cls: "fill-fuchsia-500", off: barWidth + 2 },
            ];
            return (
              <g key={d.date}>
                <title>{`${d.date} · ${d.leads} leads novos / ${d.atendimentos} atend / ${d.vendas} vendas`}</title>
                {bars.map((b) => {
                  const h = b.v > 0 ? Math.max(6, scaleY(b.v)) : 0;
                  return (
                    <g key={b.key}>
                      <rect x={cx + b.off} y={baseY - h} width={barWidth} height={h} rx="2" className={b.cls} />
                      {b.v > 0 && (
                        <text x={cx + b.off + barWidth / 2} y={baseY - h - 4} textAnchor="middle" className="fill-muted-foreground text-[9px] font-medium">
                          {b.v}
                        </text>
                      )}
                    </g>
                  );
                })}
                <text x={cx} y={chartHeight - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                  {d.date.slice(5)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-col gap-1 text-[10px]">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-500/80" /> Leads</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-indigo-500/70" /> Atend.</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-fuchsia-500" /> Vendas</span>
        <span className="mt-2 text-muted-foreground">Máx: {max}</span>
      </div>
    </div>
  );
}

// ---------- Ligações (CCPBX) ----------
function fmtDur(s: number) {
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
function LigacoesTab() {
  const qc = useQueryClient();
  const [range, setRange] = useState<PerfRange>("day");
  const [refDate, setRefDate] = useState<Date>(new Date());
  const [days, setDays] = useState(7);
  const [sellerFilter, setSellerFilter] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<CallRow | null>(null);

  const bounds = useMemo(() => {
    // Alinha ao fuso BR (UTC-3) como o restante do dashboard
    const iso = new Date(refDate.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
    return rangeBoundsFor(range, iso);
  }, [range, refDate]);

  const { data: calls, isLoading } = useQuery({
    queryKey: ["ccpbx-calls", bounds.startDate, bounds.endDate],
    queryFn: () => listCcpbxCallsFn({ data: { limit: 1000, from: `${bounds.startDate}T00:00:00.000Z`, to: `${bounds.endDate}T23:59:59.999Z` } }),
  });
  const syncMut = useMutation({
    mutationFn: () => syncCcpbxCallsFn({ data: { days } }),
    onSuccess: (r: any) => {
      toast.success(`Sync CCPBX: ${r.upserted} ligações (${r.fetched} recebidas)`);
      qc.invalidateQueries({ queryKey: ["ccpbx-calls"] });
    },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });
  const analyzeMut = useMutation({
    mutationFn: (id: string) => analyzeCallFn({ data: { callId: id } }),
    onSuccess: () => {
      toast.success("Análise concluída");
      qc.invalidateQueries({ queryKey: ["ccpbx-calls"] });
    },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  const allCalls = (calls ?? []) as CallRow[];
  const sellerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of allCalls) {
      const key = (c.agent_email ?? c.agent_name ?? c.agent_user ?? "").toString();
      if (!key) continue;
      if (!map.has(key)) map.set(key, displaySellerName(c.agent_name ?? c.agent_email ?? key));
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allCalls]);

  const list = useMemo(() => {
    let l = allCalls;
    if (sellerFilter) {
      l = l.filter((c) => (c.agent_email ?? c.agent_name ?? c.agent_user ?? "") === sellerFilter);
    }
    if (q) {
      const s = q.toLowerCase();
      l = l.filter((c) =>
        (c.agent_name ?? "").toLowerCase().includes(s) ||
        (c.contact_name ?? "").toLowerCase().includes(s) ||
        (c.from_number ?? "").toLowerCase().includes(s) ||
        (c.to_number ?? "").toLowerCase().includes(s));
    }
    return l;
  }, [allCalls, sellerFilter, q]);

  const totalDur = list.reduce((a, c) => a + (c.duration_sec ?? 0), 0);
  const analyzed = list.filter(c => c.score != null).length;
  const avgScore = analyzed > 0 ? list.reduce((a, c) => a + (c.score ?? 0), 0) / analyzed : null;

  const periodLabel = range === "day" ? "Dia" : range === "week" ? "Semana" : "Mês";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<Phone className="h-4 w-4 text-indigo-600" />} label={`Ligações (${periodLabel.toLowerCase()})`} value={String(list.length)} />
        <KpiCard icon={<Clock className="h-4 w-4 text-amber-600" />} label="Tempo total" value={fmtDur(totalDur)} />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} label="Analisadas" value={String(analyzed)} />
        <KpiCard icon={<Award className="h-4 w-4 text-fuchsia-600" />} label="Nota média" value={avgScore == null ? "—" : avgScore.toFixed(1)} valueClass={scoreColor(avgScore)} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="text-base">Ligações do CCPBX</CardTitle>
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <div className="inline-flex rounded-lg border p-1 bg-card">
                {(["day", "week", "month"] as PerfRange[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={cn(
                      "px-3 py-1 text-xs rounded-md transition",
                      range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {r === "day" ? "Dia" : r === "week" ? "Semana" : "Mês"}
                  </button>
                ))}
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1 text-xs">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {format(refDate, "dd/MM/yyyy", { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={refDate}
                    onSelect={(d) => d && setRefDate(d)}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <div className="hidden sm:block h-6 w-px bg-border mx-1" />
              <Label className="text-xs hidden sm:inline">Sync:</Label>
              <Input type="number" min={1} max={90} className="h-8 w-20" value={days} onChange={(e) => setDays(Math.max(1, Math.min(90, Number(e.target.value) || 7)))} />
              <Button size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
                <RefreshCw className={cn("h-4 w-4 mr-1", syncMut.isPending && "animate-spin")} />
                Sincronizar
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-3">
            <Badge variant="secondary" className="text-[10px]">
              {bounds.label}
            </Badge>
            <select
              value={sellerFilter}
              onChange={(e) => setSellerFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Todos os vendedores</option>
              {sellerOptions.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <Input placeholder="Buscar por agente, contato, número…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs h-9" />
            {(sellerFilter || q) && (
              <Button size="sm" variant="ghost" onClick={() => { setSellerFilter(""); setQ(""); }}>Limpar</Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{list.length} de {allCalls.length}</span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> :
            list.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma ligação encontrada no período.</p> :
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-2">Quando</th>
                    <th className="py-2 pr-2">Agente</th>
                    <th className="py-2 pr-2">Contato</th>
                    <th className="py-2 pr-2">Direção</th>
                    <th className="py-2 pr-2">Dur.</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2 pr-2">Nota</th>
                    <th className="py-2 pr-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-muted/40">
                      <td className="py-2 pr-2 whitespace-nowrap">{fmtDate(c.started_at)}</td>
                      <td className="py-2 pr-2">{c.agent_name ?? c.agent_user ?? "—"}</td>
                      <td className="py-2 pr-2">
                        <div>{c.contact_name ?? "—"}</div>
                        <div className="text-[11px] text-muted-foreground">{c.direction === "outbound" ? c.to_number : c.from_number}</div>
                      </td>
                      <td className="py-2 pr-2">
                        <Badge variant="outline" className="text-[10px]">{c.direction ?? "?"}</Badge>
                      </td>
                      <td className="py-2 pr-2">{fmtDur(c.duration_sec)}</td>
                      <td className="py-2 pr-2 text-xs">{c.status ?? "—"}</td>
                      <td className={cn("py-2 pr-2 font-semibold", scoreColor(c.score))}>{c.score == null ? "—" : c.score.toFixed(1)}</td>
                      <td className="py-2 pr-2 text-right">
                        <div className="flex justify-end items-center gap-1">
                          {c.recording_url && (
                            <a href={c.recording_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">áudio</a>
                          )}
                          {c.analysis && (
                            <Button size="sm" variant="outline" onClick={() => setSelected(c)}>
                              Ver análise
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" disabled={analyzeMut.isPending} onClick={() => analyzeMut.mutate(c.id)}>
                            <Sparkles className="h-3 w-3 mr-1" />
                            {c.analyzed_at ? "Reanalisar" : "Analisar"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Análise da ligação</DialogTitle>
          </DialogHeader>
          {selected && (() => {
            const a: any = selected.analysis ?? {};
            const list = (v: any): string[] => Array.isArray(v) ? v.filter(Boolean).map(String) : [];
            return (
              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className={cn("text-3xl font-bold", scoreColor(selected.score))}>
                    {selected.score == null ? "—" : selected.score.toFixed(1)}
                  </div>
                  {a.sentimento && (
                    <span className={cn("text-xs px-2 py-0.5 rounded", sentimentColor(a.sentimento))}>{a.sentimento}</span>
                  )}
                  {a.tentou_fechar === true && <Badge variant="outline" className="text-[10px]">Tentou fechar</Badge>}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {selected.agent_name ?? selected.agent_user ?? "—"} → {selected.contact_name ?? "—"} · {fmtDur(selected.duration_sec)}
                  </span>
                </div>

                {a.resumo && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Resumo</p>
                    <p>{a.resumo}</p>
                  </div>
                )}

                {list(a.pontos_fortes).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-emerald-600 mb-1">Pontos fortes</p>
                    <ul className="list-disc pl-5 space-y-0.5">{list(a.pontos_fortes).map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </div>
                )}

                {list(a.pontos_melhoria).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-amber-600 mb-1">Pontos a melhorar</p>
                    <ul className="list-disc pl-5 space-y-0.5">{list(a.pontos_melhoria).map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </div>
                )}

                {list(a.objecoes).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-rose-600 mb-1">Objeções</p>
                    <ul className="list-disc pl-5 space-y-0.5">{list(a.objecoes).map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </div>
                )}

                {a.proxima_acao && (
                  <div>
                    <p className="text-xs font-semibold text-indigo-600 mb-1">Próxima ação</p>
                    <p>{a.proxima_acao}</p>
                  </div>
                )}

                {selected.transcript && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Transcrição</p>
                    <div className="p-3 rounded bg-muted text-xs whitespace-pre-wrap max-h-60 overflow-y-auto">{selected.transcript}</div>
                  </div>
                )}

                {selected.recording_url && (
                  <a href={selected.recording_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">
                    Ouvir gravação
                  </a>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
