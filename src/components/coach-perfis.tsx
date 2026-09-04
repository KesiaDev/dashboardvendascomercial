import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, MessageSquare, Sparkles, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";

type ConversaProva = {
  id: string;
  contato: string;
  seller: string;
  is_ai: boolean;
  origin_name: string | null;
  stage: string | null;
  status: "ganho" | "perdido" | "aberto";
  mensagens: { direction: string; sender: string | null; body: string; sent_at: string }[];
};

async function fetchConversaProva(id: string): Promise<ConversaProva> {
  const { data: sess } = await supabase.auth.getSession();
  const res = await fetch(`/api/conversa-prova?id=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${sess.session?.access_token ?? ""}` },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erro ao carregar conversa");
  return res.json();
}
import {
  fetchPerfisLeadsFn,
  generatePerfisInsightFn,
  type PerfilRow,
  type PerfisInsight,
} from "@/lib/perfis.functions";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function PerfisTab() {
  const [periodMode, setPeriodMode] = useState<"range" | "month">("range");
  const [from, setFrom] = useState(iso(new Date(Date.now() - 90 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const [mesSel, setMesSel] = useState<string>(iso(new Date()).slice(0, 7) + "-01");
  const [origem, setOrigem] = useState<"todas" | "humano" | "ia">("todas");
  const [insight, setInsight] = useState<PerfisInsight | null>(null);
  const [perfilAberto, setPerfilAberto] = useState<PerfilRow | null>(null);
  const [conversaId, setConversaId] = useState<string | null>(null);

  // Lista de meses disponíveis desde o início da temporada (jun/2026) até o mês atual
  const monthOptions = useMemo(() => {
    const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const months: { value: string; label: string }[] = [];
    const now = new Date();
    let y = 2026, m = 1; // janeiro/2026 — histórico completo do ano
    while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
      months.push({
        value: `${y}-${String(m).padStart(2, "0")}-01`,
        label: `${MESES[m - 1]} ${y}`,
      });
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return months.reverse(); // mais recente primeiro
  }, []);

  // Quando modo mês, from/to derivam do mês selecionado
  const effFrom = periodMode === "month" ? mesSel : from;
  const effTo = useMemo(() => {
    if (periodMode !== "month") return to;
    const [y, mo] = mesSel.split("-").map(Number);
    const lastDay = new Date(y, mo, 0).getDate();
    const last = `${y}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const today = iso(new Date());
    return last > today ? today : last;
  }, [periodMode, mesSel, to]);

  const { data, isLoading } = useQuery({
    queryKey: ["coach-perfis", effFrom, effTo, origem],
    queryFn: () => fetchPerfisLeadsFn({ data: { from: effFrom, to: effTo, origem } }),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  const gerar = useMutation({
    mutationFn: () =>
      generatePerfisInsightFn({
        data: {
          ranking: (data?.ranking ?? []).map((r) => ({
            perfil: r.perfil, total: r.total, pct: r.pct, avg_score: r.avg_score,
          })),
          contexto: `Período ${effFrom} a ${effTo}. Conversas com texto do lead: ${data?.total_conversas ?? 0}. Origem: ${
            origem === "todas" ? "equipe + agente IA" : origem === "ia" ? "agente IA" : "equipe comercial"
          }.`,
        },
      }),
    onSuccess: (r) => { setInsight(r); toast.success("Leitura de perfis gerada"); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao gerar leitura"),
  });

  const chartData = useMemo(
    () => (data?.ranking ?? []).slice(0, 10).map((r) => ({ nome: r.perfil, total: r.total })),
    [data],
  );

  return (
    <div className="space-y-4 pt-4">
      <Card>
        <CardContent className="pt-4 flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            {(["range", "month"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPeriodMode(m)}
                className={
                  "px-3 py-1 text-xs rounded-md transition " +
                  (periodMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
                }
              >
                {m === "range" ? "Intervalo" : "Mês"}
              </button>
            ))}
          </div>
          {periodMode === "range" ? (
            <>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">De</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Até</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" />
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Mês</Label>
              <Select value={mesSel} onValueChange={setMesSel}>
                <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthOptions.map((mo) => (
                    <SelectItem key={mo.value} value={mo.value}>{mo.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Origem do atendimento</Label>
            <Select value={origem} onValueChange={(v) => setOrigem(v as any)}>
              <SelectTrigger className="h-9 w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Equipe + Agente IA</SelectItem>
                <SelectItem value="humano">Só equipe comercial</SelectItem>
                <SelectItem value="ia">Só Agente IA</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {periodMode === "range" && (
            <Button
              variant="outline"
              className="h-9"
              onClick={() => { setFrom("2026-01-01"); setTo(iso(new Date())); }}
            >
              Desde jan/2026
            </Button>
          )}
          <Button className="h-9 ml-auto" disabled={gerar.isPending || !data?.ranking.length} onClick={() => gerar.mutate()}>
            <Sparkles className="h-4 w-4 mr-1" />
            {gerar.isPending ? "Gerando..." : "Ler perfis com IA"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Conversas analisadas" value={String(data?.total_conversas ?? 0)} />
        <Kpi label="Leads com perfil identificado" value={String(data?.classificadas ?? 0)} />
        <Kpi label="Sem perfil claro" value={String(data?.nao_identificados ?? 0)} />
        <Kpi label="Vendas no fechamento" value={String(data?.total_vendas ?? 0)} />
      </div>


      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Perfis mais atendidos</CardTitle>
        </CardHeader>
        <CardContent className="h-[320px]">
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">{isLoading ? "Carregando..." : "Sem dados no período."}</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="nome" width={200} fontSize={11} />
                <Tooltip />
                <Bar dataKey="total" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Detalhe por perfil</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm border-collapse table-fixed">
            <colgroup>
              <col className="w-[220px]" />
              <col className="w-[60px]" />
              <col className="w-[60px]" />
              <col className="w-[70px]" />
              <col className="w-[70px]" />
              <col className="w-[70px]" />
              <col className="w-[70px]" />
              <col className="w-[80px]" />
              <col className="w-[70px]" />
              <col className="w-[80px]" />
              <col className="w-[80px]" />
              <col className="w-[300px]" />
              <col className="w-[130px]" />
            </colgroup>
            <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
              <tr className="[&>th]:border-r [&>th]:border-border/60 [&>th:last-child]:border-r-0">
                <th className="text-left p-3 sticky left-0 bg-muted/40">Perfil</th>
                <th className="text-center p-3">Leads</th>
                <th className="text-center p-3">%</th>
                <th className="text-center p-3">Vendas</th>
                <th className="text-center p-3">Conv.</th>
                <th className="text-center p-3">Ganho</th>
                <th className="text-center p-3">Perdido</th>
                <th className="text-center p-3">Aberto</th>
                <th className="text-center p-3">Equipe</th>
                <th className="text-center p-3">Ag. IA</th>
                <th className="text-center p-3">Nota</th>
                <th className="text-left p-3">Trecho real / vendedores</th>
                <th className="text-center p-3">Prova</th>
              </tr>
            </thead>
            <tbody>
              {(data?.ranking ?? []).map((r, idx) => (
                <tr key={r.perfil} className={`border-b border-border/60 align-top hover:bg-muted/30 ${idx % 2 ? "bg-muted/10" : ""}`}>
                  <td className="p-3 border-r border-border/60 sticky left-0 bg-background">
                    <p className="font-medium">{r.perfil}</p>
                    <p className="text-[11px] text-muted-foreground">{r.descricao}</p>
                  </td>
                  <td className="p-3 text-center font-semibold border-r border-border/60">{r.total}</td>
                  <td className="p-3 text-center border-r border-border/60">{r.pct.toFixed(1)}%</td>
                  <td className="p-3 text-center font-semibold text-success-fg border-r border-border/60">{r.vendas}</td>
                  <td className="p-3 text-center border-r border-border/60">{r.conv.toFixed(1)}%</td>
                  <td className="p-3 text-center text-success-fg border-r border-border/60">{r.ganhos}</td>
                  <td className="p-3 text-center text-destructive-fg border-r border-border/60">{r.perdidos}</td>
                  <td className="p-3 text-center text-warning-fg border-r border-border/60">{r.abertos}</td>
                  <td className="p-3 text-center border-r border-border/60">{r.humano}</td>
                  <td className="p-3 text-center border-r border-border/60">{r.ia}</td>
                  <td className="p-3 text-center border-r border-border/60">{r.avg_score != null ? r.avg_score.toFixed(2) : "—"}</td>
                  <td className="p-3 border-r border-border/60">
                    {r.exemplos.slice(0, 2).map((e, i) => (
                      <p key={i} className="text-[11px] text-muted-foreground italic mb-1">{e}</p>
                    ))}
                    {r.sem_pergunta > 0 && (
                      <p className="text-[11px] text-warning-fg mb-1">
                        {r.sem_pergunta} de {r.total} sem pergunta de profissão pelo vendedor
                      </p>
                    )}
                    {r.profissoes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {r.profissoes.slice(0, 6).map((p) => (
                          <Badge key={p.nome} variant="secondary" className="text-[10px] capitalize">
                            {p.nome} · {p.total}
                            {p.vendas > 0 ? ` · ${p.vendas} venda${p.vendas > 1 ? "s" : ""}` : ""}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {r.sellers.map((s) => (
                        <Badge key={s.seller} variant="outline" className="text-[10px]">{s.seller} · {s.total}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setPerfilAberto(r)}>
                      <MessageSquare className="h-3 w-3 mr-1" /> Ver
                    </Button>
                  </td>
                </tr>
              ))}
              {(data?.ranking?.length ?? 0) === 0 && (
                <tr><td colSpan={13} className="p-6 text-center text-muted-foreground">{isLoading ? "Carregando..." : "Sem dados."}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" /> Vendas do fechamento e o perfil de cada cliente
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            {(data?.total_vendas ?? 0)} venda{(data?.total_vendas ?? 0) === 1 ? "" : "s"} no período ·{" "}
            {(data?.total_vendas ?? 0) - (data?.vendas_sem_conversa ?? 0)} com conversa analisada ·{" "}
            {(data?.vendas_sem_conversa ?? 0)} sem conversa registrada. A soma das vendas por perfil bate
            com o fechamento.
          </p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left p-3">Data</th>
                <th className="text-left p-3">Cliente</th>
                <th className="text-left p-3">Vendedor</th>
                <th className="text-left p-3">Produto</th>
                <th className="text-left p-3">Funil</th>
                <th className="text-left p-3">Perfil</th>
              </tr>
            </thead>
            <tbody>
              {(data?.vendas ?? []).map((v, i) => (
                <tr key={`${v.cliente}-${v.data}-${i}`} className={`border-b border-border/60 ${i % 2 ? "bg-muted/10" : ""}`}>
                  <td className="p-3 whitespace-nowrap">{v.data.split("-").reverse().join("/")}</td>
                  <td className="p-3">
                    <p className="font-medium">{v.cliente}</p>
                    {v.email && <p className="text-[11px] text-muted-foreground">{v.email}</p>}
                  </td>
                  <td className="p-3">{v.seller}</td>
                  <td className="p-3">{v.produto}</td>
                  <td className="p-3">{v.funil}</td>
                  <td className="p-3">
                    <Badge
                      variant={v.vinculo === "conversa" ? "secondary" : "outline"}
                      className="text-[10px]"
                    >
                      {v.perfil}
                    </Badge>
                  </td>
                </tr>
              ))}
              {(data?.vendas?.length ?? 0) === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">{isLoading ? "Carregando..." : "Nenhuma venda registrada no período."}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>


      {insight && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4" /> Leitura de perfis (IA)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {insight.resumo && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{insight.resumo}</p>}
            {insight.icp && (
              <div className="rounded-lg border p-3">
                <p className="text-[10px] uppercase text-muted-foreground">ICP identificado</p>
                <p className="text-sm">{insight.icp}</p>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {insight.perfis.map((p) => (
                <div key={p.perfil} className="rounded-lg border p-3 space-y-2">
                  <p className="font-medium text-sm">{p.perfil}</p>
                  <Field titulo="Dor central" texto={p.dor} />
                  <Field titulo="Gatilho" texto={p.gatilho} />
                  <Field titulo="Como abordar" texto={p.abordagem} />
                  {p.script && (
                    <div className="rounded-md bg-muted/50 p-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] uppercase text-muted-foreground">Script</span>
                        <Button
                          size="sm" variant="ghost" className="h-6 px-2 ml-auto"
                          onClick={() => { navigator.clipboard.writeText(p.script); toast.success("Script copiado"); }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs whitespace-pre-wrap">{p.script}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {insight.acoes.length > 0 && (
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium mb-2">Ações para a gestão</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                  {insight.acoes.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <PerfilConversasDialog
        perfil={perfilAberto}
        onClose={() => setPerfilAberto(null)}
        onOpenConversa={(id) => setConversaId(id)}
      />
      <ConversaDialog id={conversaId} onClose={() => setConversaId(null)} />
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  ganho: "bg-success/15 text-success-fg border-success/30",
  perdido: "bg-destructive/15 text-destructive-fg border-destructive/30",
  aberto: "bg-warning/15 text-warning-fg border-warning/30",
};

function PerfilConversasDialog({
  perfil, onClose, onOpenConversa,
}: { perfil: PerfilRow | null; onClose: () => void; onOpenConversa: (id: string) => void }) {
  const [filtro, setFiltro] = useState<"todos" | "ganho" | "perdido" | "aberto">("todos");
  const lista = (perfil?.conversas ?? []).filter((c) => filtro === "todos" || c.status === filtro);
  return (
    <Dialog open={!!perfil} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-base">{perfil?.perfil} — conversas reais ({perfil?.conversas.length ?? 0})</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {(["todos", "ganho", "perdido", "aberto"] as const).map((f) => (
            <Button key={f} size="sm" variant={filtro === f ? "default" : "outline"} className="h-7 text-[11px] capitalize" onClick={() => setFiltro(f)}>
              {f === "todos" ? "Todos" : f === "aberto" ? "Em aberto" : f}
              {f !== "todos" && perfil ? ` · ${f === "ganho" ? perfil.ganhos : f === "perdido" ? perfil.perdidos : perfil.abertos}` : ""}
            </Button>
          ))}
        </div>
        <ScrollArea className="h-[60vh] pr-3">
          <div className="space-y-2">
            {lista.map((c) => (
              <button
                key={c.id}
                onClick={() => onOpenConversa(c.id)}
                className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{c.contato}</span>
                  <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[c.status]}`}>{c.status === "aberto" ? "em aberto" : c.status}</Badge>
                  <Badge variant="outline" className="text-[10px]">{c.is_ai ? "Agente IA" : c.seller}</Badge>
                  {c.profissao && <Badge variant="secondary" className="text-[10px] capitalize">{c.profissao}</Badge>}
                  {!c.perguntou_profissao && (
                    <Badge variant="outline" className="text-[10px] border-warning/40 text-warning-fg">
                      vendedor não perguntou a profissão
                    </Badge>
                  )}
                  {c.score != null && <Badge variant="outline" className="text-[10px]">nota {c.score.toFixed(1)}</Badge>}
                  <span className="text-[11px] text-muted-foreground ml-auto">
                    {c.last_message_at ? new Date(c.last_message_at).toLocaleDateString("pt-BR") : "—"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground italic mt-1 line-clamp-2">{c.trecho}</p>
              </button>
            ))}
            {lista.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">Nenhuma conversa neste filtro.</p>}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function ConversaDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["perfil-conversa", id],
    queryFn: () => fetchConversaProva(id!),
    enabled: !!id,
  });
  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            {data?.contato ?? "Conversa"}{" "}
            {data && (
              <Badge variant="outline" className={`text-[10px] ml-2 ${STATUS_STYLE[data.status]}`}>
                {data.status === "aberto" ? "em aberto" : data.status}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        {data && (
          <p className="text-[11px] text-muted-foreground -mt-2">
            {data.is_ai ? "Agente IA" : data.seller}
            {data.origin_name ? ` · ${data.origin_name}` : ""}{data.stage ? ` · ${data.stage}` : ""}
          </p>
        )}
        <ScrollArea className="h-[65vh] pr-3">
          {isLoading && <p className="text-sm text-muted-foreground p-4">Carregando conversa...</p>}
          <div className="space-y-2">
            {(data?.mensagens ?? []).map((m, i) => {
              const lead = m.direction === "inbound";
              return (
                <div key={i} className={`flex ${lead ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${lead ? "bg-muted" : "bg-primary/10"}`}>
                    <p className="text-[10px] text-muted-foreground mb-0.5">
                      {lead ? "Lead" : m.sender || "Vendedor/IA"} · {m.sent_at ? new Date(m.sent_at).toLocaleString("pt-BR") : ""}
                    </p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                </div>
              );
            })}
            {!isLoading && (data?.mensagens?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground p-4 text-center">Sem mensagens sincronizadas.</p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Field({ titulo, texto }: { titulo: string; texto: string }) {
  if (!texto) return null;
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground">{titulo}</p>
      <p className="text-xs">{texto}</p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
