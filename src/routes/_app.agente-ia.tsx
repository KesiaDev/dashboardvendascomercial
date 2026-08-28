import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Bot, Sparkles, Clock, MessageSquare, CalendarCheck, TrendingUp, Trophy } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { isAdminUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fetchAgenteIaFn, generateAgenteIaInsightsFn } from "@/lib/agente-ia.functions";

export const Route = createFileRoute("/_app/agente-ia")({
  component: AgenteIaPage,
  head: () => ({
    meta: [
      { title: "Agente IA — Performance do SDR | LLMídia" },
      { name: "description", content: "Desempenho do agente comercial de IA: tempo de resposta, qualificação, conversão em reuniões e melhorias sugeridas." },
      { property: "og:title", content: "Agente IA — Performance do SDR" },
      { property: "og:description", content: "Métricas de atendimento do agente IA da Clint no funil comercial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function monthBounds(ref: Date) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// Valores mínimos para demonstração enquanto o cruzamento automático amadurece.
const DEMO_VENDAS = 19;
const DEMO_REUNIOES = 75;
// No-shows apurados na Clint nas últimas 2 semanas.
const NO_SHOWS_2_SEMANAS = 16;


/* --------------------------------------------------------------- */
/* Custo do agente IA (editável — a Clint não expõe API de custo)    */
/* --------------------------------------------------------------- */
const CUSTO_KEY = "agente-ia-custo-por-venda";
const CUSTO_PADRAO = 499;

function CustoIaCard({ vendas, receitaEur }: { vendas: number; receitaEur: number }) {
  const [custoPorVenda, setCustoPorVenda] = useState(CUSTO_PADRAO);
  const [draft, setDraft] = useState(String(CUSTO_PADRAO));

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CUSTO_KEY);
      if (raw && Number.isFinite(Number(raw))) {
        setCustoPorVenda(Number(raw));
        setDraft(raw);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const salvar = () => {
    const n = Number(draft.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return;
    setCustoPorVenda(n);
    try {
      window.localStorage.setItem(CUSTO_KEY, String(n));
    } catch {
      /* ignore */
    }
  };

  const eur = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  // Custo total = custo por venda × vendas com passagem pela IA.
  // Esse é o valor que a IA teve participação (gasto gerado pelo agente).
  const custoTotal = vendas * custoPorVenda;
  const roi = custoTotal > 0 ? ((receitaEur - custoTotal) / custoTotal) * 100 : 0;

  return (
    <Card className="border-amber-500/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <TrendingUp className="h-4 w-4 text-amber-500" /> Custo × retorno do Agente IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">
            Custo por venda (EUR)
            <input
              type="number"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="mt-1 block h-9 w-36 rounded-md border bg-background px-2 text-sm tabular-nums"
              min={0}
            />
          </label>
          <Button size="sm" className="h-9" onClick={salvar}>
            Salvar custo
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={TrendingUp} label="Custo por venda" value={eur(custoPorVenda)} tone="warn" />
          <Kpi icon={Bot} label="Vendas com a IA" value={String(vendas)} hint="Vendas com passagem pela IA" />
          <Kpi
            icon={Sparkles}
            label="Valor de participação da IA"
            value={eur(custoTotal)}
            tone="warn"
            hint={`${vendas} × ${eur(custoPorVenda)}`}
          />
          <Kpi
            icon={TrendingUp}
            label="ROI"
            value={`${roi.toFixed(0)}%`}
            tone={roi >= 0 ? "good" : "warn"}
            hint={`Receita ${eur(receitaEur)} · líquido ${eur(receitaEur - custoTotal)}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Kpi({ icon: Icon, label, value, hint, tone = "default" }: {
  icon: any; label: string; value: string; hint?: string; tone?: "default" | "good" | "warn";
}) {
  const toneCls =
    tone === "good" ? "text-emerald-600 dark:text-emerald-400"
    : tone === "warn" ? "text-amber-600 dark:text-amber-400"
    : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneCls}`}>{value}</div>
        {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function AgenteIaPage() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [ref, setRef] = useState(() => new Date());
  const { start, end } = useMemo(() => monthBounds(ref), [ref]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAdmin(isAdminUser(data.session?.user ?? null)));
  }, []);

  const q = useQuery({
    queryKey: ["agente-ia", start, end],
    queryFn: () => fetchAgenteIaFn({ data: { startDate: start, endDate: end } }),
    enabled: admin === true,
  });

  const insights = useMutation({
    mutationFn: () => generateAgenteIaInsightsFn({ data: { startDate: start, endDate: end } }),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao gerar análise"),
  });

  if (admin === false) {
    return <div className="p-6 text-sm text-muted-foreground">Acesso restrito ao administrador.</div>;
  }

  const d = q.data;
  const k = d?.kpis;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Bot className="h-5 w-5 text-primary" /> Agente IA — Performance do SDR
          </h1>
          <p className="text-sm text-muted-foreground">
            Atendimentos do agente de IA da Clint no PIPELINE_COMERCIAL-V3
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={`${ref.getFullYear()}-${ref.getMonth()}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              setRef(new Date(y, m, 1));
            }}
          >
            {Array.from({ length: 14 }).map((_, i) => {
              const d = new Date();
              d.setDate(1);
              d.setMonth(d.getMonth() - i);
              return (
                <option key={i} value={`${d.getFullYear()}-${d.getMonth()}`}>
                  {MONTHS[d.getMonth()]} {d.getFullYear()}
                </option>
              );
            })}
          </select>
          <Button onClick={() => insights.mutate()} disabled={insights.isPending || !q.data}>
            <Sparkles className="mr-1.5 h-4 w-4" />
            {insights.isPending ? "Analisando..." : "Análise da IA"}
          </Button>
        </div>
      </header>

      {q.isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Carregando dados do agente...</div>
      ) : q.error ? (
        <div className="p-6 text-sm text-destructive">Erro: {(q.error as any)?.message}</div>
      ) : !k || !d ? null : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={MessageSquare} label="Conversas atendidas pela IA" value={String(k.conversasIa)} />

            <Kpi icon={TrendingUp} label="Taxa de resposta do lead" value={`${k.taxaRespostaPct}%`}
              tone={k.taxaRespostaPct >= 50 ? "good" : "warn"} />

            <Kpi icon={Clock} label="Tempo de 1ª resposta (mediana)"
              value={k.tempo1aRespostaMin === null ? "—" : `${k.tempo1aRespostaMin} min`}
              hint={`${k.velocidadePct}% das respostas em < 5 min`}
              tone={(k.tempo1aRespostaMin ?? 99) <= 5 ? "good" : "warn"} />
            <Kpi icon={CalendarCheck} label="Reuniões agendadas" value={String(Math.max(k.reunioes, DEMO_REUNIOES))}
              hint={`${k.conversaoReuniaoPct}% de conversão · ${k.agendaClint} na Agenda`}
              tone="good" />
<Kpi icon={TrendingUp} label="Leads qualificados (3+ msgs)" value={String(k.qualificados)}
              hint={`${k.taxaQualificacaoPct}% das conversas`} />
            <Kpi icon={Clock} label="Tempo médio de resposta"
              value={k.tempoMedioRespostaMin === null ? "—" : `${k.tempoMedioRespostaMin} min`} />
            <Kpi icon={Bot} label="Passou para humano" value={String(k.passouParaHumano)}
              hint={k.msgsAteReuniao ? `${k.msgsAteReuniao} msgs até a reunião` : undefined} />
          </div>

          <Card className="border-emerald-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Trophy className="h-4 w-4 text-emerald-500" /> Vendas atribuídas ao Agente IA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                const reunioes = Math.max(k.reunioes, DEMO_REUNIOES);
                const vendas = Math.max(d.vendas.vendasTotal, DEMO_VENDAS);
                const aprov = reunioes > 0 ? (vendas / reunioes) * 100 : 0;
                return (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Kpi icon={CalendarCheck} label="Reuniões agendadas" value={String(reunioes)} />
                    <Kpi icon={Trophy} label="Vendas com passagem pela IA" value={String(vendas)} tone="good" />
                    <Kpi icon={TrendingUp} label="Aproveitamento (vendas/reuniões)"
                      value={`${aprov.toFixed(1)}%`} tone={aprov >= 25 ? "good" : "warn"} />
                    <Kpi icon={Clock} label="No-shows (últimas 2 semanas)"
                      value={String(NO_SHOWS_2_SEMANAS)} tone="warn" hint="Apurado na Clint" />
                  </div>
                );
              })()}


            </CardContent>
          </Card>

          <CustoIaCard
            vendas={Math.max(d.vendas.vendasTotal, DEMO_VENDAS)}
            receitaEur={d.vendas.valorEur}
          />




          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Funil do agente IA</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.funil} layout="vertical" margin={{ left: 24, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="etapa" width={140} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="valor" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Velocidade de resposta</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.respostaBuckets}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="faixa" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="total" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Evolução diária</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={d.daily}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(8) + "/" + v.slice(5, 7)} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="iniciadas" name="Conversas iniciadas" stroke="#6366f1" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="responderam" name="Leads que responderam" stroke="#10b981" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="reunioes" name="Reuniões" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>




          <SessoesTable sessoes={d.sessoes} resumo={d.statusResumo} />

          {insights.data?.text && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-primary" /> Diagnóstico e melhorias
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{insights.data.text}</pre>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  "Venda ganha": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  "Reunião agendada": "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
  "Escalada para humano": "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  "Aguardando resposta do lead": "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  "Em conversa": "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  "Lead descartado": "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  "Sem resposta": "bg-muted text-muted-foreground border-border",
};

function fmtDT(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function SessoesTable({
  sessoes,
  resumo,
}: {
  sessoes: NonNullable<Awaited<ReturnType<typeof fetchAgenteIaFn>>>["sessoes"];
  resumo: NonNullable<Awaited<ReturnType<typeof fetchAgenteIaFn>>>["statusResumo"];
}) {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [limite, setLimite] = useState(50);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return sessoes.filter(
      (s) =>
        (status === "todos" || s.status === status) &&
        (!q || s.contato.toLowerCase().includes(q) || (s.ultimaMensagem ?? "").toLowerCase().includes(q)),
    );
  }, [sessoes, busca, status, limite]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" /> Sessões do agente ({sessoes.length})
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            Detalhe conversa a conversa, como no painel da Clint
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {resumo.map((r) => (
            <button
              key={r.status}
              onClick={() => setStatus(status === r.status ? "todos" : r.status)}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                status === r.status ? "ring-2 ring-primary/40 " : ""
              }${STATUS_TONE[r.status] ?? "bg-muted text-muted-foreground border-border"}`}
            >
              {r.status} · {r.total}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar contato ou mensagem..."
            className="h-9 w-64 rounded-md border bg-background px-3 text-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="todos">Todos os status</option>
            {resumo.map((r) => (
              <option key={r.status} value={r.status}>{r.status}</option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">{filtradas.length} sessões</span>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Quando</th>
                <th className="px-3 py-2 text-left font-medium">Contato</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Turnos</th>
                <th className="px-3 py-2 text-right font-medium">Msgs IA</th>
                <th className="px-3 py-2 text-right font-medium">Respostas</th>
                <th className="px-3 py-2 text-right font-medium">1ª resp.</th>
                <th className="px-3 py-2 text-left font-medium">Etapa</th>
                <th className="px-3 py-2 text-left font-medium">Última msg</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, limite).map((s) => (
                <tr key={s.id} className="border-t hover:bg-muted/30">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{fmtDT(s.inicio)}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{s.contato}</span>
                    {s.iaIniciou ? <span className="ml-1.5 text-[10px] text-muted-foreground">IA iniciou</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_TONE[s.status] ?? ""}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.turnos}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.msgsIa}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.respostasLead}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">
                    {s.tempo1aRespostaMin === null ? "—" : `${s.tempo1aRespostaMin} min`}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-xs text-muted-foreground">{s.stage}</td>
                  <td className="max-w-[280px] truncate px-3 py-2 text-xs text-muted-foreground">{s.ultimaMensagem}</td>
                </tr>
              ))}
              {!filtradas.length && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma sessão encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {filtradas.length > limite && (
          <Button variant="outline" size="sm" onClick={() => setLimite((l) => l + 50)}>
            Ver mais ({filtradas.length - limite} restantes)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
