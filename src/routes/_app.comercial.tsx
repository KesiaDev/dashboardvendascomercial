import { useMemo, useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  syncClintUsers,
  syncClintDeals,
  syncClintOrigins,
  setLostStatusLabel,
  backfillLostStatuses,
} from "@/lib/clint.functions";
import { useCurrency } from "@/lib/currency-context";
import { formatInt, formatPct } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { format as formatDate, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import {
  RefreshCw,
  CalendarIcon,
  X,
  Users,
  Trophy,
  TrendingUp,
  CircleDollarSign,
  Target,
  Filter,
  Pencil,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/comercial")({
  component: Comercial,
});

type Deal = {
  id: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  status: string;
  value: number | null;
  currency: string | null;
  created_at: string | null;
  won_at: string | null;
  lost_at: string | null;
  lost_status_id: string | null;
  stage: string | null;
  stage_id: string | null;
  origin_id: string | null;
  origin_name: string | null;
};

type Origin = { id: string; name: string; group_name: string | null; archived: boolean };
type Stage = { id: string; origin_id: string; label: string; stage_order: number; type: string };
type LostStatus = { id: string; label: string | null };

type Period = "week" | "month" | "quarter" | "semester" | "year" | "all";

function periodStart(p: Period): Date | null {
  if (p === "all") return null;
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === "week") d.setDate(d.getDate() - 7);
  else if (p === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  else if (p === "quarter") return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  else if (p === "semester") return new Date(now.getFullYear(), now.getMonth() < 6 ? 0 : 6, 1);
  else if (p === "year") return new Date(now.getFullYear(), 0, 1);
  return d;
}

async function fetchDeals(): Promise<Deal[]> {
  const all: Deal[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("clint_deals")
      .select(
        "id,user_id,user_name,user_email,status,value,currency,created_at,won_at,lost_at,lost_status_id,stage,stage_id,origin_id,origin_name",
      )
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as Deal[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function fetchOrigins(): Promise<Origin[]> {
  const { data, error } = await supabase
    .from("clint_origins")
    .select("id,name,group_name,archived")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Origin[];
}

async function fetchStages(): Promise<Stage[]> {
  const { data, error } = await supabase
    .from("clint_origin_stages")
    .select("id,origin_id,label,stage_order,type")
    .order("stage_order");
  if (error) throw error;
  return (data ?? []) as Stage[];
}

async function fetchLostStatuses(): Promise<LostStatus[]> {
  const { data, error } = await supabase
    .from("clint_lost_statuses")
    .select("id,label");
  if (error) throw error;
  return (data ?? []) as LostStatus[];
}

async function fetchLastSync() {
  const { data } = await supabase
    .from("clint_sync_log")
    .select("*")
    .eq("kind", "deals")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

const COLORS = [
  "#8b5cf6", "#6366f1", "#3b82f6", "#06b6d4", "#10b981",
  "#84cc16", "#f59e0b", "#ef4444", "#ec4899", "#a855f7",
  "#0ea5e9", "#14b8a6", "#eab308", "#f97316", "#f43f5e",
];

function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${d}d ${h}h ${m}m`;
}

function Comercial() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState<Period>("month");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [originId, setOriginId] = useState<string>("");
  const { format: money, convert, currency, brlPerEur: rate } = useCurrency();

  const { data: deals = [], isLoading } = useQuery({
    queryKey: ["clint_deals"],
    queryFn: fetchDeals,
  });
  const { data: origins = [] } = useQuery({ queryKey: ["clint_origins"], queryFn: fetchOrigins });
  const { data: stages = [] } = useQuery({ queryKey: ["clint_stages"], queryFn: fetchStages });
  const { data: lostStatuses = [] } = useQuery({
    queryKey: ["clint_lost_statuses"],
    queryFn: fetchLostStatuses,
  });
  const { data: lastSync } = useQuery({ queryKey: ["clint_last_sync"], queryFn: fetchLastSync });

  const syncUsersFn = useServerFn(syncClintUsers);
  const syncOriginsFn = useServerFn(syncClintOrigins);
  const syncDealsFn = useServerFn(syncClintDeals);
  const backfillFn = useServerFn(backfillLostStatuses);

  const syncMutation = useMutation({
    mutationFn: async (full: boolean) => {
      await syncUsersFn({ data: undefined as any });
      await syncOriginsFn({ data: undefined as any });
      const r = await syncDealsFn({ data: { full, sinceDays: 365 } });
      await backfillFn({ data: undefined as any });
      return r;
    },
    onSuccess: (r) => {
      toast.success(`Sincronizado: ${r.count} negócios atualizados`);
      qc.invalidateQueries({ queryKey: ["clint_deals"] });
      qc.invalidateQueries({ queryKey: ["clint_origins"] });
      qc.invalidateQueries({ queryKey: ["clint_stages"] });
      qc.invalidateQueries({ queryKey: ["clint_lost_statuses"] });
      qc.invalidateQueries({ queryKey: ["clint_last_sync"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e?.message ?? e}`),
  });

  // Auto-select a sensible default origin once data loads
  useEffect(() => {
    if (originId || origins.length === 0) return;
    // Try Pipeline V3 (10 stages) → Funil Sessão Estratégica → first non-archived w/ deals
    const candidates = [
      origins.find((o) => /pipeline_comercial-v3/i.test(o.name) && !o.archived),
      origins.find((o) => /funil.*sess[aã]o.*estrat[eé]gica/i.test(o.name) && !o.archived),
    ].filter(Boolean) as Origin[];
    const pick = candidates[0];
    if (pick) {
      // Make sure stages exist for that origin (10-stage v3 vs 2-stage v3)
      const stagesFor = stages.filter((s) => s.origin_id === pick.id).length;
      if (stagesFor >= 4) {
        setOriginId(pick.id);
        return;
      }
      // Fallback: pick any origin with same name + most stages
      const sameName = origins.filter((o) => o.name === pick.name);
      const best = sameName
        .map((o) => ({ o, count: stages.filter((s) => s.origin_id === o.id).length }))
        .sort((a, b) => b.count - a.count)[0];
      if (best) setOriginId(best.o.id);
    }
  }, [origins, stages, originId]);

  const currentStages = useMemo(
    () =>
      stages
        .filter((s) => s.origin_id === originId)
        .sort((a, b) => a.stage_order - b.stage_order),
    [stages, originId],
  );

  const stageOrderById = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of currentStages) m.set(s.id, s.stage_order);
    return m;
  }, [currentStages]);

  const filtered = useMemo(() => {
    const usingRange = !!dateRange?.from;
    const start = usingRange ? dateRange!.from! : periodStart(period);
    const end =
      usingRange && dateRange?.to
        ? new Date(dateRange.to.getTime() + 24 * 60 * 60 * 1000 - 1)
        : null;
    return deals.filter((d) => {
      if (originId && d.origin_id !== originId) return false;
      if (!d.created_at) return !usingRange && period === "all";
      const dt = new Date(d.created_at);
      if (start && dt < start) return false;
      if (end && dt > end) return false;
      return true;
    });
  }, [deals, period, dateRange, originId]);

  // KPIs + funnel
  const metrics = useMemo(() => {
    let won = 0;
    let lost = 0;
    let open = 0;
    let revenueDisplay = 0;
    const cycleMs: number[] = [];
    const stageReached = new Map<number, number>(); // order -> count reached
    let respondedBase = 0;
    let reuniaoAgendada = 0;
    let reuniaoRealizada = 0;

    // identify "reunião agendada/realizada" stage orders if they exist
    const reuniaoAgOrder = currentStages.find((s) =>
      /reuni[ãa]o\s*(1|agendada)/i.test(s.label),
    )?.stage_order;
    const reuniaoReOrder = currentStages.find((s) =>
      /reuni[ãa]o\s*(2|realizada)/i.test(s.label),
    )?.stage_order;
    const baseOrder = 1; // base is always order 1

    for (const d of filtered) {
      if (d.status === "WON") {
        won += 1;
        const v = d.value ?? 0;
        const dealCur = (d.currency ?? "BRL").toUpperCase();
        let display = v;
        if (dealCur !== currency) {
          if (dealCur === "EUR" && currency === "BRL") display = v * rate;
          else if (dealCur === "BRL" && currency === "EUR") display = v / rate;
        }
        revenueDisplay += display;
        if (d.won_at && d.created_at) {
          cycleMs.push(new Date(d.won_at).getTime() - new Date(d.created_at).getTime());
        }
      } else if (d.status === "LOST") {
        lost += 1;
      } else {
        open += 1;
      }

      const order = d.stage_id ? stageOrderById.get(d.stage_id) : undefined;
      if (order !== undefined) {
        // Reached this stage AND every previous one
        for (let i = 1; i <= order; i++) {
          stageReached.set(i, (stageReached.get(i) ?? 0) + 1);
        }
        if (order > baseOrder) respondedBase += 1;
        if (reuniaoAgOrder && order >= reuniaoAgOrder) reuniaoAgendada += 1;
        if (reuniaoReOrder && order >= reuniaoReOrder) reuniaoRealizada += 1;
      }
    }

    const total = filtered.length;
    const closed = won + lost;
    const convRate = closed > 0 ? won / closed : 0;
    const respRate = total > 0 ? respondedBase / total : 0;
    const noShow =
      reuniaoAgendada > 0 ? (reuniaoAgendada - reuniaoRealizada) / reuniaoAgendada : 0;
    const avgCycle = cycleMs.length
      ? cycleMs.reduce((a, b) => a + b, 0) / cycleMs.length
      : 0;

    return {
      total,
      won,
      lost,
      open,
      revenue: revenueDisplay,
      convRate,
      respRate,
      noShow,
      avgCycle,
      stageReached,
      reuniaoAgendada,
      reuniaoRealizada,
    };
  }, [filtered, currentStages, stageOrderById, currency, rate]);

  const funnelData = useMemo(() => {
    const max = metrics.stageReached.get(1) ?? 0;
    return currentStages.map((s) => {
      const count = metrics.stageReached.get(s.stage_order) ?? 0;
      const pct = max > 0 ? count / max : 0;
      return { label: s.label, count, pct, type: s.type };
    });
  }, [currentStages, metrics]);

  const lostLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of lostStatuses) if (l.label) m.set(l.id, l.label);
    return m;
  }, [lostStatuses]);

  const lostData = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of filtered) {
      if (d.status !== "LOST" || !d.lost_status_id) continue;
      m.set(d.lost_status_id, (m.get(d.lost_status_id) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([id, count]) => ({
        id,
        name: lostLabelById.get(id) ?? `Motivo ${id.slice(0, 6)}`,
        unnamed: !lostLabelById.has(id),
        value: count,
      }))
      .sort((a, b) => b.value - a.value);
  }, [filtered, lostLabelById]);

  const sellers = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        email: string;
        leads: number;
        won: number;
        lost: number;
        open: number;
        revenue: number;
      }
    >();
    for (const d of filtered) {
      if (!d.user_id) continue;
      const key = d.user_id;
      const cur = map.get(key) ?? {
        name: d.user_name ?? d.user_email ?? "—",
        email: d.user_email ?? "",
        leads: 0,
        won: 0,
        lost: 0,
        open: 0,
        revenue: 0,
      };
      cur.leads += 1;
      if (d.status === "WON") {
        cur.won += 1;
        const v = d.value ?? 0;
        const dealCur = (d.currency ?? "BRL").toUpperCase();
        let display = v;
        if (dealCur !== currency) {
          if (dealCur === "EUR" && currency === "BRL") display = v * rate;
          else if (dealCur === "BRL" && currency === "EUR") display = v / rate;
        }
        cur.revenue += display;
      } else if (d.status === "LOST") cur.lost += 1;
      else cur.open += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [filtered, currency, rate]);

  const setLabelFn = useServerFn(setLostStatusLabel);
  const renameMutation = useMutation({
    mutationFn: async (vars: { id: string; label: string | null }) =>
      setLabelFn({ data: vars }),
    onSuccess: () => {
      toast.success("Motivo atualizado");
      qc.invalidateQueries({ queryKey: ["clint_lost_statuses"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e?.message ?? e}`),
  });

  // Group origins for nicer dropdown
  const originsByGroup = useMemo(() => {
    const m = new Map<string, Origin[]>();
    for (const o of origins) {
      if (o.archived) continue;
      const g = o.group_name ?? "Outros";
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(o);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [origins]);

  const currentOrigin = origins.find((o) => o.id === originId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Performance Comercial</h2>
          <p className="text-sm text-muted-foreground">
            Dados reais da Clint por funil — funil de etapas, conversão, motivos de perda e
            performance por vendedor.
          </p>
          {lastSync && (
            <p className="text-xs text-muted-foreground mt-1">
              Última sincronização:{" "}
              {lastSync.finished_at
                ? formatDistanceToNow(new Date(lastSync.finished_at), {
                    addSuffix: true,
                    locale: ptBR,
                  })
                : "em andamento"}{" "}
              · {lastSync.rows_synced} negócios
              {lastSync.status === "error" && (
                <span className="text-destructive"> · erro: {lastSync.error}</span>
              )}
            </p>
          )}
        </div>
        <Button
          onClick={() => syncMutation.mutate(false)}
          disabled={syncMutation.isPending}
          size="sm"
        >
          <RefreshCw
            className={cn("h-4 w-4 mr-2", syncMutation.isPending && "animate-spin")}
          />
          {syncMutation.isPending ? "Sincronizando…" : "Sincronizar Clint"}
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Funil:</span>
          </div>
          <Select value={originId} onValueChange={setOriginId}>
            <SelectTrigger className="w-[320px]">
              <SelectValue placeholder="Selecione um funil" />
            </SelectTrigger>
            <SelectContent>
              {originsByGroup.map(([group, list]) => (
                <div key={group}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    {group}
                  </div>
                  {list.map((o) => {
                    const sc = stages.filter((s) => s.origin_id === o.id).length;
                    return (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}{" "}
                        <span className="text-muted-foreground ml-1">({sc} etapas)</span>
                      </SelectItem>
                    );
                  })}
                </div>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "justify-start text-left font-normal gap-2",
                    !dateRange?.from && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {formatDate(dateRange.from, "dd/MM/yy", { locale: ptBR })} –{" "}
                        {formatDate(dateRange.to, "dd/MM/yy", { locale: ptBR })}
                      </>
                    ) : (
                      formatDate(dateRange.from, "dd/MM/yy", { locale: ptBR })
                    )
                  ) : (
                    <span>Datas</span>
                  )}
                  {dateRange?.from && (
                    <X
                      className="h-3.5 w-3.5 ml-1 opacity-60 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDateRange(undefined);
                      }}
                    />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                  locale={ptBR}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <Tabs
              value={dateRange?.from ? "" : period}
              onValueChange={(v) => {
                setPeriod(v as Period);
                setDateRange(undefined);
              }}
            >
              <TabsList>
                <TabsTrigger value="week">Sem</TabsTrigger>
                <TabsTrigger value="month">Mês</TabsTrigger>
                <TabsTrigger value="quarter">Trim</TabsTrigger>
                <TabsTrigger value="semester">Sem.</TabsTrigger>
                <TabsTrigger value="year">Ano</TabsTrigger>
                <TabsTrigger value="all">Tudo</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-muted-foreground">Carregando…</div>
      ) : deals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <Users className="h-12 w-12 text-muted-foreground" />
            <div>
              <h2 className="text-lg font-semibold">Nenhum dado da Clint ainda</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Clique em <span className="font-medium text-foreground">Sincronizar Clint</span>{" "}
                para puxar os negócios.
              </p>
            </div>
            <Button onClick={() => syncMutation.mutate(false)} disabled={syncMutation.isPending}>
              <RefreshCw
                className={cn("h-4 w-4 mr-2", syncMutation.isPending && "animate-spin")}
              />
              Sincronizar agora
            </Button>
          </CardContent>
        </Card>
      ) : !originId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Selecione um funil acima para visualizar os indicadores. Se a lista estiver vazia,
            clique em <span className="font-medium text-foreground">Sincronizar Clint</span>.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs principais */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi
              title="Negócios recebidos"
              value={formatInt(metrics.total)}
              icon={<Users className="h-4 w-4 text-primary" />}
            />
            <Kpi
              title="Taxa de conversão"
              value={formatPct(metrics.convRate)}
              icon={<Target className="h-4 w-4 text-primary" />}
              subtitle="ganhos ÷ fechados"
            />
            <Kpi
              title="Vendas totais"
              value={formatInt(metrics.won)}
              icon={<Trophy className="h-4 w-4 text-success" />}
              accent="success"
            />
            <Kpi
              title="Faturamento ganho"
              value={money(metrics.revenue)}
              icon={<CircleDollarSign className="h-4 w-4 text-success" />}
              accent="success"
            />
            <Kpi
              title="Ciclo médio de venda"
              value={fmtDuration(metrics.avgCycle)}
              icon={<Clock className="h-4 w-4 text-primary" />}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              title="Taxa de resposta"
              value={formatPct(metrics.respRate)}
              icon={<TrendingUp className="h-4 w-4 text-primary" />}
              subtitle="passou da Base"
            />
            <Kpi
              title="% No Show"
              value={formatPct(metrics.noShow)}
              icon={<X className="h-4 w-4 text-destructive" />}
              subtitle={`${metrics.reuniaoAgendada - metrics.reuniaoRealizada} de ${metrics.reuniaoAgendada}`}
            />
            <Kpi
              title="Perdidos"
              value={formatInt(metrics.lost)}
              icon={<X className="h-4 w-4 text-destructive" />}
            />
            <Kpi
              title="Em aberto"
              value={formatInt(metrics.open)}
              icon={<Target className="h-4 w-4 text-muted-foreground" />}
            />
          </div>

          {/* Funil de etapas + Motivos de perda */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Mudança de etapa</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Negócios que alcançaram cada etapa (acumulado pela ordem)
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {funnelData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem etapas configuradas.</p>
                ) : (
                  funnelData.map((s, i) => (
                    <div key={s.label} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{s.label}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {formatInt(s.count)}{" "}
                          <span className="opacity-60">({formatPct(s.pct)})</span>
                        </span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${Math.max(2, s.pct * 100)}%`,
                            background: COLORS[i % COLORS.length],
                            opacity: s.type === "CLOSING" ? 1 : 0.85,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Motivo de perda</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Clique no lápis para renomear o motivo (a API da Clint não devolve o nome).
                </p>
              </CardHeader>
              <CardContent>
                {lostData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Nenhum negócio perdido no período.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[200px_1fr]">
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={lostData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={50}
                            outerRadius={90}
                            paddingAngle={2}
                          >
                            {lostData.map((_, i) => (
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
                    <div className="max-h-[220px] overflow-y-auto space-y-1">
                      {lostData.slice(0, 20).map((l, i) => (
                        <LostRow
                          key={l.id}
                          color={COLORS[i % COLORS.length]}
                          item={l}
                          onRename={(label) =>
                            renameMutation.mutate({ id: l.id, label: label || null })
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Ranking de faturamento */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ranking de faturamento ({currency})</CardTitle>
            </CardHeader>
            <CardContent className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sellers.map((s) => ({ name: s.name, value: s.revenue }))}
                  margin={{ left: 4, right: 8, top: 8, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    angle={-20}
                    textAnchor="end"
                    interval={0}
                    height={50}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickFormatter={(v) =>
                      `${currency === "EUR" ? "€" : "R$"}${Math.round(v / 1000)}k`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--foreground)",
                    }}
                    formatter={(v: number) =>
                      new Intl.NumberFormat(currency === "EUR" ? "de-DE" : "pt-BR", {
                        style: "currency",
                        currency,
                      }).format(v)
                    }
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {sellers.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Cards por vendedor */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold">Detalhe por vendedor</h3>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sellers.map((s, i) => {
                const closed = s.won + s.lost;
                const conv = closed > 0 ? s.won / closed : 0;
                return (
                  <Card key={s.email || s.name} className="overflow-hidden">
                    <div
                      className="h-1"
                      style={{ background: COLORS[i % COLORS.length] }}
                    />
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{s.name}</CardTitle>
                        <Badge variant="secondary" className="text-xs">
                          #{i + 1}
                        </Badge>
                      </div>
                      <p className="text-2xl font-semibold mt-2">{money(s.revenue)}</p>
                      <p className="text-xs text-muted-foreground">faturamento ganho</p>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-3 pt-0 text-sm">
                      <Stat label="Leads" value={formatInt(s.leads)} />
                      <Stat label="Convertidos" value={formatInt(s.won)} accent="success" />
                      <Stat label="Perdidos" value={formatInt(s.lost)} />
                      <Stat label="Em aberto" value={formatInt(s.open)} />
                      <div className="col-span-2 rounded-md border border-border bg-secondary/30 p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            Taxa de conversão
                          </span>
                          <span className="text-sm font-semibold">{formatPct(conv)}</span>
                        </div>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full transition-all"
                            style={{
                              width: `${Math.min(100, conv * 100)}%`,
                              background: COLORS[i % COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LostRow({
  color,
  item,
  onRename,
}: {
  color: string;
  item: { id: string; name: string; unnamed: boolean; value: number };
  onRename: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(item.unnamed ? "" : item.name);
  useEffect(() => {
    setVal(item.unnamed ? "" : item.name);
  }, [item.name, item.unnamed]);

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onRename(val.trim());
          setEditing(false);
        }}
        className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 p-2"
      >
        <span
          className="h-3 w-3 shrink-0 rounded-sm"
          style={{ background: color }}
        />
        <Input
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="Nome do motivo"
          className="h-8"
        />
        <Button type="submit" size="sm" variant="default" className="h-8">
          OK
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={() => setEditing(false)}
        >
          ✕
        </Button>
      </form>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="flex w-full items-center gap-2 rounded-md border border-border bg-secondary/30 p-2 text-left hover:bg-secondary/60 transition"
    >
      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: color }} />
      <span className={cn("flex-1 text-sm truncate", item.unnamed && "italic text-muted-foreground")}>
        {item.name}
      </span>
      <span className="text-sm font-semibold tabular-nums">{formatInt(item.value)}</span>
      <Pencil className="h-3.5 w-3.5 opacity-40" />
    </button>
  );
}

function Kpi({
  title,
  value,
  subtitle,
  icon,
  accent,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  accent?: "success" | "destructive";
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
          style={
            accent === "success"
              ? { color: "var(--success)" }
              : accent === "destructive"
                ? { color: "var(--destructive)" }
                : undefined
          }
        >
          {value}
        </p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "success";
}) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 p-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <p
        className="text-sm font-semibold mt-1"
        style={accent === "success" ? { color: "var(--success)" } : undefined}
      >
        {value}
      </p>
    </div>
  );
}
