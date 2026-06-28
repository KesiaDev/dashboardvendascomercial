import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAllDeals,
  fetchAllSales,
  fetchPipelineAreas,
  buildAreaMap,
  filterDealsByArea,
  rankSellers,
  computeAreaKpis,
  findPhantomWonDeals,
  periodRange,
  type Period,
} from "@/lib/bi";
import { AREA_LABELS, AREA_ORDER, type BusinessArea } from "@/lib/pipeline-areas";
import { useCurrency } from "@/lib/currency-context";
import { formatInt, formatPct } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { Users, Trophy, TrendingUp, CircleDollarSign, Target, LayoutGrid } from "lucide-react";

export const Route = createFileRoute("/_app/executivo")({
  component: Executivo,
});

const COLORS = [
  "#8b5cf6", "#6366f1", "#3b82f6", "#06b6d4", "#10b981",
  "#84cc16", "#f59e0b", "#ef4444", "#ec4899", "#a855f7",
];

function Executivo() {
  const [period, setPeriod] = useState<Period>("month");
  const [area, setArea] = useState<BusinessArea>("COMERCIAL");
  const { format: money, currency, brlPerEur: rate } = useCurrency();

  const { data: deals = [], isLoading } = useQuery({ queryKey: ["bi_deals"], queryFn: fetchAllDeals });
  const { data: sales = [] } = useQuery({ queryKey: ["bi_sales"], queryFn: fetchAllSales });
  const { data: pipelineAreas = [] } = useQuery({
    queryKey: ["bi_pipeline_areas"],
    queryFn: fetchPipelineAreas,
  });

  const areaMap = useMemo(() => buildAreaMap(pipelineAreas), [pipelineAreas]);
  const dealsInArea = useMemo(() => filterDealsByArea(deals, areaMap, area), [deals, areaMap, area]);
  const phantomWonIds = useMemo(() => findPhantomWonDeals(deals, sales), [deals, sales]);
  const { start, end } = periodRange(period);

  const kpis = useMemo(
    () => computeAreaKpis(dealsInArea, start, end, currency, rate, phantomWonIds),
    [dealsInArea, start, end, currency, rate, phantomWonIds],
  );
  const sellers = useMemo(
    () => rankSellers(dealsInArea, start, end, currency, rate, phantomWonIds),
    [dealsInArea, start, end, currency, rate, phantomWonIds],
  );

  // Visão geral por área (para o card "Todas as áreas")
  const byArea = useMemo(() => {
    return AREA_ORDER.filter((a) => a !== "TESTES" && a !== "OUTROS").map((a) => {
      const d = filterDealsByArea(deals, areaMap, a);
      const k = computeAreaKpis(d, start, end, currency, rate, phantomWonIds);
      return { area: a, ...k };
    });
  }, [deals, areaMap, start, end, currency, rate, phantomWonIds]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Dashboard Executivo</h2>
          <p className="text-sm text-muted-foreground">
            Visão consolidada por área de negócio — sem precisar escolher pipeline.
          </p>
          {phantomWonIds.size > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {phantomWonIds.size} ganho{phantomWonIds.size > 1 ? "s" : ""} descontado
              {phantomWonIds.size > 1 ? "s" : ""} do faturamento: venda cancelada/reembolsada na
              Hotmart depois de marcada como ganha na Clint.
            </p>
          )}
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

      {/* Seletor de área */}
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
          {/* KPIs da área selecionada */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi title="Leads recebidos" value={formatInt(kpis.leads)} icon={<Users className="h-4 w-4 text-primary" />} />
            <Kpi
              title="Taxa de conversão"
              value={formatPct(kpis.convRate)}
              icon={<Target className="h-4 w-4 text-primary" />}
            />
            <Kpi title="Vendas (won_at)" value={formatInt(kpis.won)} icon={<Trophy className="h-4 w-4 text-success" />} accent="success" />
            <Kpi
              title="Faturamento"
              value={money(kpis.revenue)}
              icon={<CircleDollarSign className="h-4 w-4 text-success" />}
              accent="success"
            />
            <Kpi title="Em aberto" value={formatInt(kpis.open)} icon={<TrendingUp className="h-4 w-4 text-primary" />} />
          </div>

          {/* Ranking de vendedores na área */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Ranking — {AREA_LABELS[area]} ({currency})
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[280px]">
              {sellers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">
                  Nenhuma venda nesta área no período.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={sellers.map((s) => ({ name: s.name, value: s.revenue }))}
                    margin={{ left: 4, right: 8, top: 8, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} angle={-20} textAnchor="end" interval={0} height={50} />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      tickFormatter={(v) => `${currency === "EUR" ? "€" : "R$"}${Math.round(v / 1000)}k`}
                    />
                    <Tooltip
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }}
                      formatter={(v: number) => new Intl.NumberFormat(currency === "EUR" ? "de-DE" : "pt-BR", { style: "currency", currency }).format(v)}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {sellers.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Tabela detalhada por vendedor */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalhe por vendedor — {AREA_LABELS[area]}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4">#</th>
                    <th className="py-2 pr-4">Vendedor</th>
                    <th className="py-2 pr-4 text-right">Leads</th>
                    <th className="py-2 pr-4 text-right">Ganhos</th>
                    <th className="py-2 pr-4 text-right">Perdidos</th>
                    <th className="py-2 pr-4 text-right">Em aberto</th>
                    <th className="py-2 pr-4 text-right">Conversão</th>
                    <th className="py-2 text-right">Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {sellers.map((s, i) => {
                    const closed = s.won + s.lost;
                    const conv = closed > 0 ? s.won / closed : 0;
                    return (
                      <tr key={s.user_id} className="border-b border-border/50">
                        <td className="py-2 pr-4">
                          <Badge variant="secondary" className="text-xs">#{i + 1}</Badge>
                        </td>
                        <td className="py-2 pr-4 font-medium">{s.name}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{formatInt(s.leads)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-success">{formatInt(s.won)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{formatInt(s.lost)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{formatInt(s.open)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{formatPct(conv)}</td>
                        <td className="py-2 text-right tabular-nums font-semibold">{money(s.revenue)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Visão consolidada de todas as áreas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Todas as áreas — {period === "month" ? "este mês" : "período"}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              {byArea.map((a) => (
                <button
                  key={a.area}
                  onClick={() => setArea(a.area)}
                  className={`rounded-lg border p-4 text-left transition hover:border-primary ${
                    area === a.area ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <p className="text-sm font-medium text-muted-foreground">{AREA_LABELS[a.area]}</p>
                  <p className="text-xl font-semibold mt-1">{money(a.revenue)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatInt(a.won)} ganhos · {formatInt(a.leads)} leads · {formatPct(a.convRate)} conversão
                  </p>
                </button>
              ))}
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
        <p className="text-2xl font-semibold tracking-tight" style={accent === "success" ? { color: "var(--success)" } : undefined}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}