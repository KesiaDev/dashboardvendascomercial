import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchFunisDataFn, type FunilDeal, type FunilStage, type FunilOrigin, type FunilLostStatus } from "@/lib/funis.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RTooltip, Cell, PieChart, Pie, Legend,
} from "recharts";
import { TrendingUp, Users, CheckCircle, XCircle, Clock, Trophy, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/_app/funis")({
  component: FunisPage,
});

// ─── Funis alvo ──────────────────────────────────────────────────────────────

type FunilKey = "retomada" | "pipeline_v3" | "sessao" | "palestras";

const TARGET_FUNNELS: { key: FunilKey; label: string; color: string; pattern: RegExp }[] = [
  { key: "retomada",    label: "Retomada Leads Perdidos",  color: "#f59e0b", pattern: /retomada/i },
  { key: "pipeline_v3", label: "PIPELINE_COMERCIAL-V3",    color: "#6366f1", pattern: /pipeline[_\s-]*comercial|pipeline.*v3/i },
  { key: "sessao",      label: "Funil - Sessão Estratégica", color: "#10b981", pattern: /sess[aã]o\s*estrat[eé]gica/i },
  { key: "palestras",   label: "Funil de Palestras (M&S)",  color: "#ec4899", pattern: /palestra/i },
];

const SELLER_COLORS: Record<string, string> = {
  "Gisele Pimentel": "#8b5cf6",
  "João Pessoa":     "#3b82f6",
  "Luana Guimarães": "#10b981",
  "Rita Bandeira":   "#f59e0b",
  "Fabio Nadal":     "#ef4444",
};
function sellerColor(name: string) {
  const k = Object.keys(SELLER_COLORS).find((k) => name?.toLowerCase().includes(k.split(" ")[0].toLowerCase()));
  return k ? SELLER_COLORS[k] : "#64748b";
}

// ─── Período ─────────────────────────────────────────────────────────────────

type Period = "7d" | "30d" | "90d" | "all";
function periodLabel(p: Period) {
  return { "7d": "7 dias", "30d": "30 dias", "90d": "90 dias", all: "Tudo" }[p];
}
function periodStart(p: Period): string | null {
  if (p === "all") return null;
  const days = { "7d": 7, "30d": 30, "90d": 90 }[p];
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtEur(v: number) { return `€${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtPct(n: number, d: number) { return d === 0 ? "0%" : `${Math.round((n / d) * 100)}%`; }

function sellerName(d: FunilDeal): string {
  return d.won_by_name?.trim() || d.user_name?.trim() || "—";
}

// ─── Métricas de um funil ────────────────────────────────────────────────────

function computeMetrics(deals: FunilDeal[], stages: FunilStage[], lostStatuses: FunilLostStatus[], originId: string | null) {
  const funilStages = stages
    .filter((s) => s.origin_id === originId)
    .sort((a, b) => a.stage_order - b.stage_order);

  const lostMap = Object.fromEntries(lostStatuses.map((l) => [l.id, l.label ?? l.id]));

  const won   = deals.filter((d) => d.status === "WON");
  const lost  = deals.filter((d) => d.status === "LOST");
  const open  = deals.filter((d) => d.status === "OPEN");
  const total = deals.length;

  const totalRevenue = won.reduce((s, d) => s + (d.value ?? 0), 0);
  const avgTicket = won.length ? totalRevenue / won.length : 0;
  const convRate = (won.length + lost.length) > 0 ? won.length / (won.length + lost.length) : 0;

  // Distribuição por estágio (apenas deals abertos)
  const stageData = funilStages.map((s) => {
    const count = open.filter((d) => d.stage_id === s.id || d.stage === s.label).length;
    return { label: s.label, count, type: s.type };
  }).filter((s) => s.count > 0 || funilStages.length <= 8);

  // Ranking de vendedores
  const sellerMap: Record<string, { won: number; revenue: number; lost: number; open: number }> = {};
  for (const d of deals) {
    const name = sellerName(d);
    if (!sellerMap[name]) sellerMap[name] = { won: 0, revenue: 0, lost: 0, open: 0 };
    if (d.status === "WON") { sellerMap[name].won++; sellerMap[name].revenue += d.value ?? 0; }
    if (d.status === "LOST") sellerMap[name].lost++;
    if (d.status === "OPEN") sellerMap[name].open++;
  }
  const sellerRanking = Object.entries(sellerMap)
    .filter(([name]) => name !== "—")
    .map(([name, s]) => ({ name, ...s, conv: (s.won + s.lost) > 0 ? s.won / (s.won + s.lost) : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  // Motivos de perda
  const lostReasons: Record<string, number> = {};
  for (const d of lost) {
    const label = d.lost_status_id ? (lostMap[d.lost_status_id] ?? "Sem motivo") : "Sem motivo";
    lostReasons[label] = (lostReasons[label] ?? 0) + 1;
  }
  const lostReasonsArr = Object.entries(lostReasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }));

  return { total, won: won.length, lost: lost.length, open: open.length, totalRevenue, avgTicket, convRate, stageData, sellerRanking, lostReasonsArr };
}

// ─── Painel de um funil ──────────────────────────────────────────────────────

function FunnelPanel({
  funilKey, deals, stages, lostStatuses, origins,
}: {
  funilKey: FunilKey;
  deals: FunilDeal[];
  stages: FunilStage[];
  lostStatuses: FunilLostStatus[];
  origins: FunilOrigin[];
}) {
  const [period, setPeriod] = useState<Period>("30d");
  const [timeGrain, setTimeGrain] = useState<"day" | "week" | "month">("week");
  const cfg = TARGET_FUNNELS.find((f) => f.key === funilKey)!;

  // Encontra o origin em clint_origins (para stages)
  const origin = useMemo(
    () => origins.find((o) => cfg.pattern.test(o.name)) ?? null,
    [origins, cfg.pattern],
  );

  // Filtra deals deste funil por origin_name regex (não por origin_id, que pode divergir)
  const funilDeals = useMemo(() => {
    const since = periodStart(period);
    return deals.filter((d) => {
      const matchesName = cfg.pattern.test(d.origin_name ?? "");
      const matchesId = origin && d.origin_id === origin.id;
      if (!matchesName && !matchesId) return false;
      if (since && d.created_at && d.created_at.slice(0, 10) < since) return false;
      return true;
    });
  }, [deals, origin, period, cfg.pattern]);

  // Nome exibido: preferência pelo origin da tabela, senão pega do primeiro deal
  const displayName = origin?.name ?? funilDeals[0]?.origin_name ?? cfg.label;

  const m = useMemo(
    () => computeMetrics(funilDeals, stages, lostStatuses, origin?.id ?? null),
    [funilDeals, stages, lostStatuses, origin],
  );

  const leadsOverTime = useMemo(() => {
    function weekStartStr(dateStr: string): string {
      const d = new Date(dateStr + "T12:00:00Z");
      const dow = d.getUTCDay();
      const diff = dow === 0 ? -6 : 1 - dow;
      return new Date(d.getTime() + diff * 86_400_000).toISOString().slice(0, 10);
    }
    const buckets: Record<string, number> = {};
    for (const d of funilDeals) {
      if (!d.created_at) continue;
      const date = d.created_at.slice(0, 10);
      const key = timeGrain === "day" ? date : timeGrain === "week" ? weekStartStr(date) : date.slice(0, 7);
      buckets[key] = (buckets[key] ?? 0) + 1;
    }
    const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => {
        let label: string;
        if (timeGrain === "month") {
          const [y, mo] = key.split("-");
          label = `${MONTHS[+mo - 1]}/${y.slice(2)}`;
        } else {
          const [, mo, dy] = key.split("-");
          label = `${dy}/${mo}`;
        }
        return { key, label, count };
      });
  }, [funilDeals, timeGrain]);

  const pieData = [
    { name: "Ganhos",  value: m.won,  color: "#10b981" },
    { name: "Perdidos", value: m.lost, color: "#ef4444" },
    { name: "Ativos",  value: m.open, color: "#6366f1" },
  ].filter((d) => d.value > 0);

  if (!origin && funilDeals.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        Funil não encontrado. Verifique se o nome na Clint contém "{cfg.label}" ou se o sync está atualizado.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Período */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-muted-foreground">Funil: <span className="font-medium text-foreground">{displayName}</span></p>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["7d","30d","90d","all"] as Period[]).map((p) => (
              <SelectItem key={p} value={p} className="text-xs">{periodLabel(p)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <Card><CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Users className="h-3.5 w-3.5"/>Total leads</div>
          <p className="text-2xl font-bold">{m.total}</p>
        </CardContent></Card>

        <Card><CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Clock className="h-3.5 w-3.5 text-indigo-400"/>Ativos</div>
          <p className="text-2xl font-bold">{m.open}</p>
        </CardContent></Card>

        <Card><CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><CheckCircle className="h-3.5 w-3.5 text-emerald-400"/>Ganhos</div>
          <p className="text-2xl font-bold text-emerald-400">{m.won}</p>
          <p className="text-xs text-muted-foreground">{fmtEur(m.totalRevenue)}</p>
        </CardContent></Card>

        <Card><CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><XCircle className="h-3.5 w-3.5 text-red-400"/>Perdidos</div>
          <p className="text-2xl font-bold text-red-400">{m.lost}</p>
        </CardContent></Card>

        <Card><CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><TrendingUp className="h-3.5 w-3.5 text-yellow-400"/>Conversão</div>
          <p className="text-2xl font-bold" style={{ color: cfg.color }}>{fmtPct(m.won, m.won + m.lost)}</p>
          <p className="text-xs text-muted-foreground">ticket: {fmtEur(m.avgTicket)}</p>
        </CardContent></Card>
      </div>

      {/* Leads ao longo do tempo */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-muted-foreground"/> Leads novos ao longo do tempo
            </CardTitle>
            <div className="flex gap-1">
              {(["day","week","month"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setTimeGrain(g)}
                  className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                    timeGrain === g
                      ? "bg-secondary text-foreground border-border"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {g === "day" ? "Dia" : g === "week" ? "Semana" : "Mês"}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {leadsOverTime.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Sem leads no período selecionado.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={leadsOverTime} margin={{ top:4, right:8, bottom:0, left:-20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>
                <XAxis dataKey="label" tick={{ fontSize:11, fill:"hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                <YAxis tick={{ fontSize:11, fill:"hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false}/>
                <RTooltip
                  formatter={(v: number) => [v, "leads"]}
                  labelFormatter={(l) => timeGrain === "week" ? `Semana de ${l}` : l}
                  contentStyle={{ background:"hsl(var(--card))", border:"1px solid hsl(var(--border))", borderRadius:8, fontSize:12 }}
                />
                <Bar dataKey="count" fill={cfg.color} radius={[4,4,0,0]} maxBarSize={40}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Estágios + Distribuição */}
      <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
        {/* Leads por estágio */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Leads ativos por etapa</CardTitle>
          </CardHeader>
          <CardContent>
            {m.stageData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Nenhum lead ativo.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, m.stageData.length * 36)}>
                <BarChart data={m.stageData} layout="vertical" margin={{ top:0, right:40, bottom:0, left:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false}/>
                  <XAxis type="number" tick={{ fontSize:11, fill:"hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}/>
                  <YAxis dataKey="label" type="category" width={200} tick={{ fontSize:11, fill:"hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}/>
                  <RTooltip
                    formatter={(v: number) => [v, "leads"]}
                    contentStyle={{ background:"hsl(var(--card))", border:"1px solid hsl(var(--border))", borderRadius:8, fontSize:12 }}
                  />
                  <Bar dataKey="count" radius={[0,4,4,0]} maxBarSize={28} fill={cfg.color}/>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pizza won/lost/open */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Distribuição</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Sem dados.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70}>
                      {pieData.map((e, i) => <Cell key={i} fill={e.color}/>)}
                    </Pie>
                    <RTooltip formatter={(v: number) => [v, ""]} contentStyle={{ background:"hsl(var(--card))", border:"1px solid hsl(var(--border))", borderRadius:8, fontSize:12 }}/>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1 mt-1">
                  {pieData.map((d) => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }}/>
                        {d.name}
                      </span>
                      <span className="font-medium">{d.value} <span className="text-muted-foreground">({fmtPct(d.value, m.total)})</span></span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ranking vendedores */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Trophy className="h-4 w-4 text-yellow-400"/> Performance por Vendedor
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {m.sellerRanking.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-4">Sem dados de vendedor.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border bg-muted/40">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">#</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Vendedor</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Leads</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Ganhos</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Perdidos</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Ativos</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Conv.</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {m.sellerRanking.map((s, i) => (
                    <tr key={s.name} className="border-t border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2 text-muted-foreground text-xs">{i + 1}º</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: sellerColor(s.name) }}/>
                          {s.name}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.won + s.lost + s.open}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-400 font-medium">{s.won}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-400">{s.lost}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-indigo-400">{s.open}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <Badge variant="secondary" className="text-xs">{Math.round(s.conv * 100)}%</Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtEur(s.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Motivos de perda */}
      {m.lostReasonsArr.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <XCircle className="h-4 w-4 text-red-400"/> Motivos de Perda
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(120, m.lostReasonsArr.length * 36)}>
              <BarChart data={m.lostReasonsArr} layout="vertical" margin={{ top:0, right:40, bottom:0, left:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false}/>
                <XAxis type="number" tick={{ fontSize:11, fill:"hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}/>
                <YAxis dataKey="label" type="category" width={200} tick={{ fontSize:11, fill:"hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}/>
                <RTooltip
                  formatter={(v: number) => [v, "leads"]}
                  contentStyle={{ background:"hsl(var(--card))", border:"1px solid hsl(var(--border))", borderRadius:8, fontSize:12 }}
                />
                <Bar dataKey="count" radius={[0,4,4,0]} maxBarSize={24} fill="#ef4444"/>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

function FunisPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["funis-data"],
    queryFn: () => fetchFunisDataFn(),
    staleTime: 5 * 60_000,
  });

  if (isLoading || !data) {
    return <div className="flex items-center justify-center py-24 text-muted-foreground">Carregando dados da Clint…</div>;
  }

  const { deals, origins, stages, lostStatuses } = data;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-muted-foreground"/>
          Performance dos Funis
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">Leads, conversão e performance por vendedor em cada pipeline da Clint</p>
      </div>

      <Tabs defaultValue="retomada">
        <TabsList className="flex-wrap h-auto gap-1 mb-4">
          {TARGET_FUNNELS.map((f) => (
            <TabsTrigger key={f.key} value={f.key} className="text-xs">
              <span className="h-2 w-2 rounded-full mr-1.5 shrink-0" style={{ background: f.color }}/>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TARGET_FUNNELS.map((f) => (
          <TabsContent key={f.key} value={f.key}>
            <FunnelPanel
              funilKey={f.key}
              deals={deals}
              stages={stages}
              lostStatuses={lostStatuses}
              origins={origins}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
