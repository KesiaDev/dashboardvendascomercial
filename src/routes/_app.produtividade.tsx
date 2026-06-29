import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAllDeals,
  fetchPipelineAreas,
  buildAreaMap,
  filterDealsByArea,
  periodRange,
  type Period,
} from "@/lib/bi";
import { fetchStagesFn, fetchLostStatusesFn } from "@/lib/data.functions";
import { AREA_LABELS, AREA_ORDER, type BusinessArea } from "@/lib/pipeline-areas";
import { useCurrency } from "@/lib/currency-context";
import { formatInt, formatPct } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Users, Trophy, Target, Clock, LayoutGrid } from "lucide-react";

export const Route = createFileRoute("/_app/produtividade")({
  component: Produtividade,
});

type Stage = { id: string; origin_id: string; label: string; stage_order: number; type: string };
type LostStatus = { id: string; label: string | null };

async function fetchStages(): Promise<Stage[]> {
  return (await fetchStagesFn()) as Stage[];
}

async function fetchLostStatuses(): Promise<LostStatus[]> {
  return (await fetchLostStatusesFn()) as LostStatus[];
}

const COLORS = [
  "#8b5cf6", "#6366f1", "#3b82f6", "#06b6d4", "#10b981",
  "#84cc16", "#f59e0b", "#ef4444", "#ec4899", "#a855f7",
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

  const { data: deals = [], isLoading } = useQuery({ queryKey: ["bi_deals"], queryFn: fetchAllDeals });
  const { data: pipelineAreas = [] } = useQuery({ queryKey: ["bi_pipeline_areas"], queryFn: fetchPipelineAreas });
  const { data: stages = [] } = useQuery({ queryKey: ["clint_stages"], queryFn: fetchStages });
  const { data: lostStatuses = [] } = useQuery({ queryKey: ["clint_lost_statuses"], queryFn: fetchLostStatuses });

  const areaMap = useMemo(() => buildAreaMap(pipelineAreas), [pipelineAreas]);
  const dealsInArea = useMemo(() => filterDealsByArea(deals, areaMap, area), [deals, areaMap, area]);
  const { start, end } = periodRange(period);

  const stageLabel = useMemo(() => new Map(stages.map((s) => [s.id, s.label])), [stages]);
  const lostLabel = useMemo(() => new Map(lostStatuses.map((s) => [s.id, s.label ?? "Outro"])), [lostStatuses]);

  function inPeriod(iso: string | null) {
    if (!iso) return false;
    const d = new Date(iso);
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  }

  const kpis = useMemo(() => {
    const leads = dealsInArea.filter((d) => inPeriod(d.created_at));
    const won = dealsInArea.filter((d) => d.status === "WON" && inPeriod(d.won_at));
    const lost = dealsInArea.filter((d) => d.status === "LOST" && inPeriod(d.lost_at));
    const closed = won.length + lost.length;
    const revenue = won.reduce((s, d) => s + (d.value ?? 0), 0);
    const cycles = won
      .filter((d) => d.created_at && d.won_at)
      .map((d) => new Date(d.won_at!).getTime() - new Date(d.created_at!).getTime())
      .filter((ms) => ms > 0);
    const avgCycleMs = cycles.length > 0 ? cycles.reduce((a, b) => a + b, 0) / cycles.length : 0;
    return { leads: leads.length, won: won.length, convRate: closed > 0 ? won.length / closed : 0, revenue, avgCycleMs };
  }, [dealsInArea, start, end]);

  const lossReasons = useMemo(() => {
    const lost = dealsInArea.filter((d) => d.status === "LOST" && inPeriod(d.lost_at));
    const map = new Map<string, number>();
    for (const d of lost) {
      const label = d.lost_status_id ? lostLabel.get(d.lost_status_id) ?? "Outro" : "Sem motivo";
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    const total = lost.length;
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count, pct: total > 0 ? count / total : 0 }))
      .sort((a, b) => b.count - a.count);
  }, [dealsInArea, start, end, lostLabel]);

  const funnelBySeller = useMemo(() => {
    const open = dealsInArea.filter((d) => d.status === "OPEN");
    const sellers = new Map<string, Map<string, number>>();
    for (const d of open) {
      const user = d.user_name ?? d.user_email ?? "—";
      const stage = d.stage_id ? stageLabel.get(d.stage_id) ?? d.stage ?? "—" : d.stage ?? "—";
      if (!sellers.has(user)) sellers.set(user, new Map());
      const m = sellers.get(user)!;
      m.set(stage, (m.get(stage) ?? 0) + 1);
    }
    const rows: { user: string; stage: string; count: number }[] = [];
    for (const [user, stageMap] of sellers) {
      for (const [stage, count] of stageMap) rows.push({ user, stage, count });
    }
    return rows.sort((a, b) => a.user.localeCompare(b.user) || b.count - a.count);
  }, [dealsInArea, stageLabel]);

  const salesDetail = useMemo(() => {
    return dealsInArea
      .filter((d) => d.status === "WON" && inPeriod(d.won_at))
      .map((d) => ({
        id: d.id,
        contato: d.contact_name ?? "—",
        email: d.contact_email ?? "—",
        origem: d.origin_name ?? "—",
        vendedor: d.user_name ?? d.user_email ?? "—",
        valor: d.value ?? 0,
        data: d.won_at,
      }))
      .sort((a, b) => new Date(b.data ?? 0).getTime() - new Date(a.data ?? 0).getTime());
  }, [dealsInArea, start, end]);

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
            <Kpi title="Negócios recebidos" value={formatInt(kpis.leads)} icon={<Users className="h-4 w-4 text-primary" />} />
            <Kpi title="Vendas" value={formatInt(kpis.won)} icon={<Trophy className="h-4 w-4 text-success" />} accent="success" />
            <Kpi title="Taxa de conversão" value={formatPct(kpis.convRate)} icon={<Target className="h-4 w-4 text-primary" />} />
            <Kpi title="Ciclo médio de venda" value={fmtDuration(kpis.avgCycleMs)} icon={<Clock className="h-4 w-4 text-primary" />} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Motivo de perda — {AREA_LABELS[area]}</CardTitle>
              </CardHeader>
              <CardContent>
                {lossReasons.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-12 text-center">Nenhuma perda no período.</p>
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
                            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-full space-y-1.5 sm:w-1/2">
                      {lossReasons.map((r, i) => (
                        <div key={r.label} className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 truncate">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
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
                <CardTitle className="text-base">Funil por vendedor — em aberto</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[280px] overflow-y-auto">
                {funnelBySeller.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-12 text-center">Nenhum negócio em aberto.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-2 pr-4">Vendedor</th>
                        <th className="py-2 pr-4">Etapa</th>
                        <th className="py-2 text-right">Qtd</th>
                      </tr>
                    </thead>
                    <tbody>
                      {funnelBySeller.map((r, i) => (
                        <tr key={`${r.user}-${r.stage}-${i}`} className="border-b border-border/50">
                          <td className="py-1.5 pr-4">{r.user}</td>
                          <td className="py-1.5 pr-4 text-muted-foreground">{r.stage}</td>
                          <td className="py-1.5 text-right tabular-nums">{formatInt(r.count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalhamento das vendas — {AREA_LABELS[area]}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {salesDetail.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">Nenhuma venda no período.</p>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-2 pr-4">Contato</th>
                        <th className="py-2 pr-4">Email</th>
                        <th className="py-2 pr-4">Origem</th>
                        <th className="py-2 pr-4">Vendedor</th>
                        <th className="py-2 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesDetail.slice(0, 100).map((s) => (
                        <tr key={s.id} className="border-b border-border/50">
                          <td className="py-1.5 pr-4">{s.contato}</td>
                          <td className="py-1.5 pr-4 text-muted-foreground">{s.email}</td>
                          <td className="py-1.5 pr-4 text-muted-foreground">{s.origem}</td>
                          <td className="py-1.5 pr-4">
                            <Badge variant="secondary" className="text-xs">{s.vendedor}</Badge>
                          </td>
                          <td className="py-1.5 text-right tabular-nums font-medium">{money(s.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {salesDetail.length > 100 && (
                    <p className="pt-3 text-xs text-muted-foreground">
                      Mostrando as 100 vendas mais recentes de {formatInt(salesDetail.length)} no período.
                    </p>
                  )}
                </>
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
        <p className="text-2xl font-semibold tracking-tight" style={accent === "success" ? { color: "var(--success)" } : undefined}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
