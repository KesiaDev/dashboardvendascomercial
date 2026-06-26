import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_GROUPS, getGroupById, categorizeStatus, STATUS_LABELS, STATUS_COLORS, type StatusCategory } from "@/lib/product-groups";
import { formatBRL, formatInt, formatPct } from "@/lib/format";
import { useCurrency } from "@/lib/currency-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { CalendarDays, TrendingUp, TrendingDown, AlertTriangle, CircleDollarSign } from "lucide-react";

export const Route = createFileRoute("/_app/")({
  component: Dashboard,
});

type Sale = {
  transacao: string;
  produto_grupo: string;
  produto_original: string;
  status: string;
  data_venda: string | null;
  moeda_original: string | null;
  preco_oferta: number | null;
  faturamento_liquido_brl: number | null;
  valor_recebido_convertido: number | null;
  moeda_recebimento: string | null;
};

type Period = "week" | "month" | "year" | "all";

function periodStart(p: Period): Date | null {
  const now = new Date();
  if (p === "all") return null;
  if (p === "week") {
    const d = new Date(now);
    d.setDate(now.getDate() - 7);
    return d;
  }
  if (p === "month") {
    const d = new Date(now);
    d.setMonth(now.getMonth() - 1);
    return d;
  }
  const d = new Date(now);
  d.setFullYear(now.getFullYear() - 1);
  return d;
}

async function fetchSales(): Promise<Sale[]> {
  const all: Sale[] = [];
  let from = 0;
  const pageSize = 1000;
  // paginar para evitar limite de 1000
  while (true) {
    const { data, error } = await supabase
      .from("sales")
      .select("transacao,produto_grupo,produto_original,status,data_venda,moeda_original,preco_oferta,faturamento_liquido_brl,valor_recebido_convertido,moeda_recebimento")
      .order("data_venda", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as Sale[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function Dashboard() {
  const [period, setPeriod] = useState<Period>("week");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const { format: money, currency, convert } = useCurrency();

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: fetchSales,
  });

  const filtered = useMemo(() => {
    const start = periodStart(period);
    return sales.filter((s) => {
      if (!s.data_venda) return period === "all";
      if (start && new Date(s.data_venda) < start) return false;
      if (groupFilter !== "all" && s.produto_grupo !== groupFilter) return false;
      return true;
    });
  }, [sales, period, groupFilter]);

  const totals = useMemo(() => computeTotals(filtered), [filtered]);

  const byGroup = useMemo(() => {
    const map = new Map<string, Sale[]>();
    for (const g of PRODUCT_GROUPS) map.set(g.id, []);
    for (const s of filtered) {
      const arr = map.get(s.produto_grupo) ?? [];
      arr.push(s);
      map.set(s.produto_grupo, arr);
    }
    return PRODUCT_GROUPS.map((g) => ({
      group: g,
      sales: map.get(g.id) ?? [],
      totals: computeTotals(map.get(g.id) ?? []),
    })).filter((x) => x.sales.length > 0);
  }, [filtered]);

  if (isLoading) {
    return <div className="text-muted-foreground">Carregando dados…</div>;
  }

  if (sales.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <CircleDollarSign className="h-12 w-12 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold">Nenhuma venda importada ainda</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Vá em <span className="text-foreground font-medium">Importar</span> para subir seu primeiro CSV semanal.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Filtros */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Visão geral</h2>
          <p className="text-sm text-muted-foreground">
            Resultado consolidado com cancelamentos, chargebacks e reembolsos.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Todos os produtos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os produtos</SelectItem>
              {PRODUCT_GROUPS.map((g) => (
                <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList>
              <TabsTrigger value="week">Semana</TabsTrigger>
              <TabsTrigger value="month">Mês</TabsTrigger>
              <TabsTrigger value="year">Ano</TabsTrigger>
              <TabsTrigger value="all">Tudo</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={`Faturamento líquido (${currency})`}
          value={money(totals.netBRL)}
          subtitle={`${formatInt(totals.aprovadoCount)} vendas aprovadas`}
          icon={<TrendingUp className="h-4 w-4 text-success" />}
          accent="success"
        />
        <KpiCard
          title="Total bruto aprovado"
          value={money(totals.grossApprovedBRL)}
          subtitle="Somando valor recebido convertido"
          icon={<CircleDollarSign className="h-4 w-4 text-primary" />}
        />
        <KpiCard
          title="Cancelados"
          value={formatInt(totals.byStatus.cancelado.count)}
          subtitle={`${formatPct(totals.cancelRate)} das transações`}
          icon={<TrendingDown className="h-4 w-4 text-muted-foreground" />}
        />
        <KpiCard
          title="Chargeback + Reembolso"
          value={formatInt(totals.byStatus.chargeback.count + totals.byStatus.reembolso.count)}
          subtitle={money(totals.byStatus.chargeback.brl + totals.byStatus.reembolso.brl)}
          icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
          accent="destructive"
        />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Faturamento líquido por produto ({currency})</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byGroup.map((g) => ({ name: g.group.label, value: convert(g.totals.netBRL) }))} margin={{ left: 4, right: 8, top: 8, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} angle={-25} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `${currency === "EUR" ? "€" : "R$"}${Math.round(v / 1000)}k`} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }}
                  formatter={(v: number) => new Intl.NumberFormat(currency === "EUR" ? "de-DE" : "pt-BR", { style: "currency", currency }).format(v)}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {byGroup.map((g) => (
                    <Cell key={g.group.id} fill={g.group.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuição por status</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={(Object.keys(totals.byStatus) as StatusCategory[])
                    .filter((k) => totals.byStatus[k].count > 0)
                    .map((k) => ({ name: STATUS_LABELS[k], value: totals.byStatus[k].count, key: k }))}
                  dataKey="value"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {(Object.keys(totals.byStatus) as StatusCategory[])
                    .filter((k) => totals.byStatus[k].count > 0)
                    .map((k) => (
                      <Cell key={k} fill={STATUS_COLORS[k]} />
                    ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Cards por produto */}
      <div>
        <div className="mb-4 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Detalhe por produto</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {byGroup.map(({ group, totals: t }) => (
            <Card key={group.id} className="overflow-hidden">
              <div className="h-1" style={{ background: group.color }} />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{group.label}</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {formatInt(t.total)} transações
                  </Badge>
                </div>
                <p className="text-2xl font-semibold mt-2">{money(t.netBRL)}</p>
                <p className="text-xs text-muted-foreground">faturamento líquido em {currency}</p>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 pt-0 text-sm">
                <StatusBox label="Aprovado" cat="aprovado" data={t.byStatus.aprovado} money={money} />
                <StatusBox label="Cancelado" cat="cancelado" data={t.byStatus.cancelado} money={money} />
                <StatusBox label="Chargeback" cat="chargeback" data={t.byStatus.chargeback} money={money} />
                <StatusBox label="Reembolso" cat="reembolso" data={t.byStatus.reembolso} money={money} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Por moeda */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Total bruto por moeda (somente aprovadas)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Object.entries(totals.byCurrency)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([cur, v]) => (
                <div key={cur} className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">{cur}</p>
                  <p className="text-lg font-semibold mt-1">
                    {new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v.total)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{formatInt(v.count)} vendas</p>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  accent,
}: {
  title: string;
  value: string;
  subtitle: string;
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
          style={accent === "success" ? { color: "var(--success)" } : accent === "destructive" ? { color: "var(--destructive)" } : undefined}
        >
          {value}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function StatusBox({ label, cat, data, money }: { label: string; cat: StatusCategory; data: { count: number; brl: number }; money: (v: number) => string }) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 p-2.5">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[cat] }} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-sm font-semibold mt-1">{formatInt(data.count)}</p>
      <p className="text-xs text-muted-foreground">{money(data.brl)}</p>
    </div>
  );
}

interface Totals {
  total: number;
  netBRL: number;
  grossApprovedBRL: number;
  aprovadoCount: number;
  cancelRate: number;
  byStatus: Record<StatusCategory, { count: number; brl: number }>;
  byCurrency: Record<string, { count: number; total: number }>;
}

function computeTotals(sales: Sale[]): Totals {
  const byStatus: Totals["byStatus"] = {
    aprovado: { count: 0, brl: 0 },
    cancelado: { count: 0, brl: 0 },
    chargeback: { count: 0, brl: 0 },
    reembolso: { count: 0, brl: 0 },
    outro: { count: 0, brl: 0 },
  };
  const byCurrency: Totals["byCurrency"] = {};
  let netBRL = 0;
  let grossApprovedBRL = 0;
  let aprovadoCount = 0;

  for (const s of sales) {
    const cat = categorizeStatus(s.status);
    const brl = s.faturamento_liquido_brl ?? 0;
    byStatus[cat].count += 1;
    byStatus[cat].brl += brl;
    if (cat === "aprovado") {
      netBRL += brl;
      grossApprovedBRL += s.valor_recebido_convertido ?? brl;
      aprovadoCount += 1;
      const cur = s.moeda_original || "—";
      if (!byCurrency[cur]) byCurrency[cur] = { count: 0, total: 0 };
      byCurrency[cur].count += 1;
      byCurrency[cur].total += s.preco_oferta ?? 0;
    }
  }

  const total = sales.length;
  const cancelRate = total > 0 ? (byStatus.cancelado.count + byStatus.chargeback.count + byStatus.reembolso.count) / total : 0;

  return { total, netBRL, grossApprovedBRL, aprovadoCount, cancelRate, byStatus, byCurrency };
}
