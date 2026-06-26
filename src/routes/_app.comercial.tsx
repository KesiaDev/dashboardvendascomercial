import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { syncClintUsers, syncClintDeals } from "@/lib/clint.functions";
import { useCurrency } from "@/lib/currency-context";
import { formatInt, formatPct } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  lost_status_name: string | null;
  stage: string | null;
  origin_name: string | null;
};

type Period = "week" | "month" | "quarter" | "semester" | "year" | "all";

function periodStart(p: Period): Date | null {
  if (p === "all") return null;
  const d = new Date();
  if (p === "week") d.setDate(d.getDate() - 7);
  else if (p === "month") d.setMonth(d.getMonth() - 1);
  else if (p === "quarter") d.setMonth(d.getMonth() - 3);
  else if (p === "semester") d.setMonth(d.getMonth() - 6);
  else if (p === "year") d.setFullYear(d.getFullYear() - 1);
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
        "id,user_id,user_name,user_email,status,value,currency,created_at,won_at,lost_at,lost_status_name,stage,origin_name",
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

const SELLER_COLORS = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#06b6d4",
  "#ef4444",
  "#8b5cf6",
  "#84cc16",
];

function Comercial() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState<Period>("month");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const { format: money, convert } = useCurrency();

  const { data: deals = [], isLoading } = useQuery({
    queryKey: ["clint_deals"],
    queryFn: fetchDeals,
  });
  const { data: lastSync } = useQuery({ queryKey: ["clint_last_sync"], queryFn: fetchLastSync });

  const syncUsersFn = useServerFn(syncClintUsers);
  const syncDealsFn = useServerFn(syncClintDeals);

  const syncMutation = useMutation({
    mutationFn: async (full: boolean) => {
      await syncUsersFn({ data: undefined as any });
      const r = await syncDealsFn({ data: { full, sinceDays: 180 } });
      return r;
    },
    onSuccess: (r) => {
      toast.success(`Sincronizado: ${r.count} negócios atualizados`);
      qc.invalidateQueries({ queryKey: ["clint_deals"] });
      qc.invalidateQueries({ queryKey: ["clint_last_sync"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e?.message ?? e}`),
  });

  // Convert deal value to display currency. Clint values are in deal.currency (EUR/BRL).
  // Use the user's currency context: if BRL display, EUR deals *= rate; if EUR display, BRL deals /= rate.
  const { currency, rate } = useCurrency();

  const filtered = useMemo(() => {
    const usingRange = !!dateRange?.from;
    const start = usingRange ? dateRange!.from! : periodStart(period);
    const end =
      usingRange && dateRange?.to
        ? new Date(dateRange.to.getTime() + 24 * 60 * 60 * 1000 - 1)
        : null;
    return deals.filter((d) => {
      if (!d.created_at) return !usingRange && period === "all";
      const dt = new Date(d.created_at);
      if (start && dt < start) return false;
      if (end && dt > end) return false;
      return true;
    });
  }, [deals, period, dateRange]);

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
        revenue: number; // in display currency
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
        // Convert value to display currency
        const v = d.value ?? 0;
        const dealCur = (d.currency ?? "BRL").toUpperCase();
        let display = 0;
        if (dealCur === currency) display = v;
        else if (dealCur === "EUR" && currency === "BRL") display = v * rate;
        else if (dealCur === "BRL" && currency === "EUR") display = v / rate;
        else display = v;
        cur.revenue += display;
      } else if (d.status === "LOST") cur.lost += 1;
      else cur.open += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.won - a.won);
  }, [filtered, currency, rate]);

  const totals = useMemo(() => {
    const t = sellers.reduce(
      (acc, s) => {
        acc.leads += s.leads;
        acc.won += s.won;
        acc.lost += s.lost;
        acc.open += s.open;
        acc.revenue += s.revenue;
        return acc;
      },
      { leads: 0, won: 0, lost: 0, open: 0, revenue: 0 },
    );
    const closed = t.won + t.lost;
    return { ...t, convRate: closed > 0 ? t.won / closed : 0 };
  }, [sellers]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Performance Comercial</h2>
          <p className="text-sm text-muted-foreground">
            Negócios da Clint por vendedor — leads, conversão e faturamento ganho.
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
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => syncMutation.mutate(false)}
            disabled={syncMutation.isPending}
            variant="default"
            size="sm"
          >
            <RefreshCw
              className={cn("h-4 w-4 mr-2", syncMutation.isPending && "animate-spin")}
            />
            {syncMutation.isPending ? "Sincronizando…" : "Sincronizar Clint"}
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
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
                <span>Selecionar datas</span>
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
          <PopoverContent className="w-auto p-0" align="start">
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
            <TabsTrigger value="week">Semana</TabsTrigger>
            <TabsTrigger value="month">Mês</TabsTrigger>
            <TabsTrigger value="quarter">Trimestre</TabsTrigger>
            <TabsTrigger value="semester">Semestre</TabsTrigger>
            <TabsTrigger value="year">Ano</TabsTrigger>
            <TabsTrigger value="all">Tudo</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

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
                para puxar os negócios dos últimos 6 meses.
              </p>
            </div>
            <Button
              onClick={() => syncMutation.mutate(false)}
              disabled={syncMutation.isPending}
            >
              <RefreshCw
                className={cn("h-4 w-4 mr-2", syncMutation.isPending && "animate-spin")}
              />
              Sincronizar agora
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs globais */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Kpi
              title="Leads recebidos"
              value={formatInt(totals.leads)}
              icon={<Users className="h-4 w-4 text-primary" />}
            />
            <Kpi
              title="Convertidos"
              value={formatInt(totals.won)}
              icon={<Trophy className="h-4 w-4 text-success" />}
              accent="success"
            />
            <Kpi
              title="Perdidos"
              value={formatInt(totals.lost)}
              icon={<X className="h-4 w-4 text-destructive" />}
            />
            <Kpi
              title="Taxa conversão"
              value={formatPct(totals.convRate)}
              icon={<Target className="h-4 w-4 text-primary" />}
              subtitle="ganhos ÷ fechados"
            />
            <Kpi
              title="Faturamento ganho"
              value={money(totals.revenue)}
              icon={<CircleDollarSign className="h-4 w-4 text-success" />}
              accent="success"
            />
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
                      <Cell key={i} fill={SELLER_COLORS[i % SELLER_COLORS.length]} />
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
                      style={{ background: SELLER_COLORS[i % SELLER_COLORS.length] }}
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
                              background: SELLER_COLORS[i % SELLER_COLORS.length],
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
