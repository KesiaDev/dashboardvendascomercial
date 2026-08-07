import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Bot, Sparkles, Clock, MessageSquare, CalendarCheck, TrendingUp } from "lucide-react";
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
            <Kpi icon={MessageSquare} label="Conversas atendidas pela IA" value={String(k.conversasIa)}
              hint={`${k.coberturaPct}% das ${k.conversasTotal} conversas V3`} />
            <Kpi icon={TrendingUp} label="Taxa de resposta do lead" value={`${k.taxaRespostaPct}%`}
              hint={`${k.leadsResponderam} responderam · ${k.semResposta} sem resposta`}
              tone={k.taxaRespostaPct >= 50 ? "good" : "warn"} />
            <Kpi icon={Clock} label="Tempo de 1ª resposta (mediana)"
              value={k.tempo1aRespostaMin === null ? "—" : `${k.tempo1aRespostaMin} min`}
              hint={`${k.velocidadePct}% das respostas em < 5 min`}
              tone={(k.tempo1aRespostaMin ?? 99) <= 5 ? "good" : "warn"} />
            <Kpi icon={CalendarCheck} label="Reuniões agendadas" value={String(k.reunioes)}
              hint={`${k.conversaoReuniaoPct}% de conversão · ${k.agendaClint} na Agenda`}
              tone={k.conversaoReuniaoPct >= 15 ? "good" : "default"} />
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
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi icon={Trophy} label="Vendas com passagem pela IA" value={String(d.vendas.vendasTotal)}
                  hint={`${d.vendas.ganhosClint} ganhos na Clint · ${d.vendas.vendasManuais} no fechamento`}
                  tone={d.vendas.vendasTotal > 0 ? "good" : "warn"} />
                <Kpi icon={TrendingUp} label="Conversa IA → venda" value={`${d.vendas.taxaConversaoPct}%`}
                  hint={`${d.vendas.vendasTotal} de ${k.conversasIa} conversas`} />
                <Kpi icon={Trophy} label="Faturamento influenciado" value={`€ ${d.vendas.valorEur.toLocaleString("pt-PT")}`}
                  hint="Soma dos valores das vendas atribuídas" />
                <Kpi icon={Bot} label="Vendas em conversas iniciadas pela IA" value={String(d.vendas.vendasIaIniciou)}
                  hint={`${d.vendas.iniciadasPelaIa} conversas foram abertas pela IA`} />
              </div>

              {d.vendas.lista.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr className="border-b">
                        <th className="py-1.5 text-left font-medium">Cliente</th>
                        <th className="text-left font-medium">Vendedor</th>
                        <th className="text-left font-medium">Produto / etapa</th>
                        <th className="text-right font-medium">Valor</th>
                        <th className="text-left font-medium">Data</th>
                        <th className="text-left font-medium">Atribuição</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.vendas.lista.map((v, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1.5">{v.contato}</td>
                          <td>{v.vendedor}</td>
                          <td className="max-w-[240px] truncate">{v.produto}</td>
                          <td className="text-right tabular-nums">
                            {v.valorEur ? `€ ${v.valorEur.toLocaleString("pt-PT")}` : "—"}
                          </td>
                          <td>{v.data}</td>
                          <td>
                            <div className="flex flex-wrap items-center gap-1">
                              <Badge variant="secondary">{v.origem}</Badge>
                              {v.iaIniciou ? (
                                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">IA iniciou</Badge>
                              ) : (
                                <Badge variant="outline">IA participou</Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {v.msgsIa} msgs IA · {v.match}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Nenhuma venda do período foi cruzada com conversas do agente IA. O cruzamento usa o
                  deal ganho na Clint e o e-mail/nome do cliente no fechamento manual — se o vendedor
                  registar o cliente com outro e-mail, a venda não é atribuída.
                </div>
              )}
            </CardContent>
          </Card>



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

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Onde os leads da IA estão no funil</CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                {d.stages.slice(0, 12).map((s) => (
                  <div key={s.stage} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-1.5 text-sm">
                    <span className="truncate">{s.stage}</span>
                    <Badge variant="secondary">{s.total}</Badge>
                  </div>
                ))}
                {!d.stages.length && <div className="text-sm text-muted-foreground">Sem dados no período.</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Aberturas sem resposta (amostra)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {d.amostraSemResposta.map((a, i) => (
                  <div key={i} className="rounded-md border px-3 py-2 text-xs">
                    <div className="font-medium">{a.contato} <span className="text-muted-foreground">· {a.data}</span></div>
                    <div className="mt-0.5 text-muted-foreground line-clamp-2">{a.abertura}</div>
                  </div>
                ))}
                {!d.amostraSemResposta.length && <div className="text-sm text-muted-foreground">Todos os leads responderam 🎉</div>}
              </CardContent>
            </Card>
          </div>

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
