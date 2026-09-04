import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { periodRange, type Period } from "@/lib/bi";
import { fetchProdutividadeFn, type ProdutividadeData } from "@/lib/produtividade.functions";
import { AREA_LABELS, AREA_ORDER, type BusinessArea } from "@/lib/pipeline-areas";
import { useCurrency } from "@/lib/currency-context";
import { formatInt, formatPct } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { format as formatDate } from "date-fns";
import { Users, Trophy, Target, Clock, LayoutGrid } from "lucide-react";
export const Route = createFileRoute("/_app/produtividade")({
  component: Produtividade,
});

const COLORS = [
  "#8b5cf6",
  "#6366f1",
  "#3b82f6",
  "#06b6d4",
  "#10b981",
  "#84cc16",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#a855f7",
];

function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  return `${d}d ${h}h`;
}

function Produtividade() {
  const [period, setPeriod] = useState<Period>("month");
  const [area, setArea] = useState<BusinessArea>("COMERCIAL");
  const { format: money } = useCurrency();

  const { start, end } = periodRange(period);

  // Toda a agregação acontece no servidor (src/lib/produtividade.functions.ts).
  // Esta tela baixava clint_deals INTEIRA e rodava oito agregações sobre o mesmo
  // array no navegador. Agora chegam algumas dezenas de linhas de resultado.
  //
  // As três janelas de tempo (período da tela, snapshot sem período do funil, e
  // o intervalo do último CSV importado) estão documentadas no server function —
  // recortar a leitura por período quebraria duas delas em silêncio.
  const { data, isLoading } = useQuery({
    queryKey: ["produtividade", period, area],
    queryFn: () => fetchProdutividadeFn({ data: { period, area } }),
  });

  const kpis: ProdutividadeData["kpis"] = data?.kpis ?? {
    leads: 0,
    won: 0,
    convRate: 0,
    revenue: 0,
    avgCycleMs: 0,
  };
  const lossReasons: ProdutividadeData["motivosPerda"] = data?.motivosPerda ?? [];
  const funnelBySeller: ProdutividadeData["funilPorVendedor"] = data?.funilPorVendedor ?? [];
  const salesByVendor: ProdutividadeData["vendasPorVendedor"] = data?.vendasPorVendedor ?? [];
  const teamProductivity: ProdutividadeData["produtividadeTime"] = data?.produtividadeTime ?? [];
  const followupRows: ProdutividadeData["followupRows"] = data?.followupRows ?? [];
  const latestActivityPeriod = data?.activityPeriodo ?? null;
  const latestFollowupPeriod = data?.followupPeriodo ?? null;

  // O servidor devolve a data ISO; o rótulo dd/MM é formatação de exibição.
  const lostByDay = useMemo(
    () =>
      ((data?.perdasPorDia ?? []) as ProdutividadeData["perdasPorDia"]).map((r) => ({
        day: formatDate(new Date(r.day), "dd/MM"),
        count: r.count,
      })),
    [data],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Produtividade Comercial</h2>
          <p className="text-sm text-muted-foreground">
            Motivo de perda, funil por vendedor e detalhamento de vendas — espelhando a Visão Geral
            da Clint. Ligações, e-mails, tarefas e WhatsApp por vendedor não entram aqui: a API da
            Clint não expõe esse dado (módulo de atividades não tem suporte via API).
          </p>
        </div>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList>
            <TabsTrigger value="week">Sem</TabsTrigger>
            <TabsTrigger value="month">Mês</TabsTrigger>
            <TabsTrigger value="quarter">Trim</TabsTrigger>
            <TabsTrigger value="year">Ano</TabsTrigger>
            <TabsTrigger value="all">Tudo</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <LayoutGrid className="h-4 w-4 text-muted-foreground mr-1" />
          {AREA_ORDER.filter((a) => a !== "TESTES").map((a) => (
            <button
              key={a}
              onClick={() => setArea(a)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                area === a
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
              }`}
            >
              {AREA_LABELS[a]}
            </button>
          ))}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-muted-foreground">Carregando…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              title="Negócios recebidos"
              value={formatInt(kpis.leads)}
              icon={<Users className="h-4 w-4 text-primary" />}
            />
            <Kpi
              title="Vendas"
              value={formatInt(kpis.won)}
              icon={<Trophy className="h-4 w-4 text-success" />}
              accent="success"
            />
            <Kpi
              title="Taxa de conversão"
              value={formatPct(kpis.convRate)}
              icon={<Target className="h-4 w-4 text-primary" />}
            />
            <Kpi
              title="Ciclo médio de venda"
              value={fmtDuration(kpis.avgCycleMs)}
              icon={<Clock className="h-4 w-4 text-primary" />}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Motivo de perda — {AREA_LABELS[area]}</CardTitle>
              </CardHeader>
              <CardContent>
                {lossReasons.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-12 text-center">
                    Nenhuma perda no período.
                  </p>
                ) : (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="h-[200px] w-full sm:w-1/2">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={lossReasons}
                            dataKey="count"
                            nameKey="label"
                            innerRadius={40}
                            outerRadius={80}
                          >
                            {lossReasons.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: "var(--popover)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              color: "var(--foreground)",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-full space-y-1.5 sm:w-1/2">
                      {lossReasons.map((r, i) => (
                        <div key={r.label} className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 truncate">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: COLORS[i % COLORS.length] }}
                            />
                            <span className="truncate">{r.label}</span>
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {formatInt(r.count)} ({formatPct(r.pct)})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Detalhamento do funil por vendedor</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[400px] overflow-y-auto space-y-4">
                {funnelBySeller.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-12 text-center">
                    Nenhum negócio encontrado.
                  </p>
                ) : (
                  funnelBySeller.map((g) => (
                    <div key={g.user}>
                      <div className="flex items-center justify-between border-b border-border pb-1.5 mb-1.5">
                        <Badge className="text-xs">{g.user}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatInt(g.total)} negócios
                        </span>
                      </div>
                      <table className="w-full text-sm">
                        <tbody>
                          {g.stages.map((s) => (
                            <tr key={s.stage} className="border-b border-border/50">
                              <td className="py-1 pr-4 text-muted-foreground">{s.stage}</td>
                              <td className="py-1 text-right tabular-nums">{formatInt(s.count)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Perdidos por dia — {AREA_LABELS[area]}</CardTitle>
            </CardHeader>
            <CardContent className="h-[200px]">
              {lostByDay.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">
                  Nenhuma perda no período.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={lostByDay} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--foreground)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#ef4444"
                      fill="#ef4444"
                      fillOpacity={0.2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Produtividade do time</CardTitle>
              <p className="text-xs text-muted-foreground">
                {latestActivityPeriod
                  ? `Período importado: ${formatDate(new Date(latestActivityPeriod.periodo_inicio), "dd/MM/yy")} – ${formatDate(new Date(latestActivityPeriod.periodo_fim), "dd/MM/yy")}. Ligações/e-mails/tarefas/reuniões/WhatsApp vêm de CSV (sem API na Clint) — importe em /import.`
                  : 'Nenhum dado importado ainda. Vá em /import → "Atividade do time" para subir o CSV exportado da Clint.'}
              </p>
            </CardHeader>
            {teamProductivity.length > 0 && (
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-4">Vendedor</th>
                      <th className="py-2 pr-4 text-right">Ligações</th>
                      <th className="py-2 pr-4 text-right">Emails</th>
                      <th className="py-2 pr-4 text-right">Tarefas</th>
                      <th className="py-2 pr-4 text-right">Reuniões</th>
                      <th className="py-2 pr-4 text-right">WhatsApp</th>
                      <th className="py-2 pr-4 text-right">Trabalhados</th>
                      <th className="py-2 text-right">% sobre recebidos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamProductivity.map((r) => (
                      <tr key={r.user_name} className="border-b border-border/50">
                        <td className="py-1.5 pr-4 font-medium">{r.user_name}</td>
                        <td className="py-1.5 pr-4 text-right tabular-nums">
                          {formatInt(r.ligacoes)}
                        </td>
                        <td className="py-1.5 pr-4 text-right tabular-nums">
                          {formatInt(r.emails)}
                        </td>
                        <td className="py-1.5 pr-4 text-right tabular-nums">
                          {formatInt(r.tarefas)}
                        </td>
                        <td className="py-1.5 pr-4 text-right tabular-nums">
                          {formatInt(r.reunioes_agendadas)}
                        </td>
                        <td className="py-1.5 pr-4 text-right tabular-nums">
                          {formatInt(r.whatsapp)}
                        </td>
                        <td className="py-1.5 pr-4 text-right tabular-nums">
                          {formatInt(r.negocios_trabalhados)}
                          <span className="text-muted-foreground">
                            {" "}
                            / {formatInt(r.negociosRecebidos)}
                          </span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {r.pctTrabalhados !== null ? (
                            <Badge variant="secondary" className="text-xs">
                              {formatPct(r.pctTrabalhados)}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            )}
          </Card>

          {followupRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Atividades de follow-up — time todo</CardTitle>
                {latestFollowupPeriod && (
                  <p className="text-xs text-muted-foreground">
                    Período importado:{" "}
                    {formatDate(new Date(latestFollowupPeriod.periodo_inicio), "dd/MM/yy")} –{" "}
                    {formatDate(new Date(latestFollowupPeriod.periodo_fim), "dd/MM/yy")}
                  </p>
                )}
              </CardHeader>
              <CardContent className="max-h-[240px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-4">Tipo de atividade</th>
                      <th className="py-2 text-right">Quantidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {followupRows.map((r) => (
                      <tr key={r.titulo_atividade} className="border-b border-border/50">
                        <td className="py-1.5 pr-4">{r.titulo_atividade}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {formatInt(r.quantidade)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Detalhamento das vendas — {AREA_LABELS[area]}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {salesByVendor.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">
                  Nenhuma venda no período.
                </p>
              ) : (
                salesByVendor.map((g) => (
                  <div key={g.vendedor}>
                    <div className="flex items-center justify-between border-b border-border pb-2 mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className="text-xs">{g.vendedor}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatInt(g.items.length)} venda{g.items.length > 1 ? "s" : ""}
                        </span>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{money(g.total)}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-muted-foreground">
                            <th className="py-1.5 pr-4">Contato</th>
                            <th className="py-1.5 pr-4">Email</th>
                            <th className="py-1.5 pr-4">Origem</th>
                            <th className="py-1.5 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.items.map((s) => (
                            <tr key={s.id} className="border-b border-border/50">
                              <td className="py-1.5 pr-4">{s.contato}</td>
                              <td className="py-1.5 pr-4 text-muted-foreground">{s.email}</td>
                              <td className="py-1.5 pr-4 text-muted-foreground">{s.origem}</td>
                              <td className="py-1.5 text-right tabular-nums font-medium">
                                {money(s.valor)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({
  title,
  value,
  icon,
  accent,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  accent?: "success";
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p
          className="text-2xl font-semibold tracking-tight"
          style={accent === "success" ? { color: "var(--success)" } : undefined}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
