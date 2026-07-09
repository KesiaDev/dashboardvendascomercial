import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchManualSalesForCommissionFn } from "@/lib/commission.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RTooltip, Cell,
} from "recharts";
import {
  ChevronLeft, ChevronRight, Trophy, TrendingUp, TrendingDown,
  CalendarDays, Flame, Star, ShoppingBag,
} from "lucide-react";

export const Route = createFileRoute("/_app/fechamento-semanal")({
  component: FechamentoSemanal,
});

// ─── Constantes ───────────────────────────────────────────────────────────────

const SEASON_START = "2026-06-01";
const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const COLORS: Record<string, string> = {
  "Gisele Pimentel": "#8b5cf6",
  "João Pessoa":     "#3b82f6",
  "Luana Guimarães": "#10b981",
  "Rita Bandeira":   "#f59e0b",
  "Fabio Nadal":     "#ef4444",
};

function sellerColor(name: string) {
  const key = Object.keys(COLORS).find((k) =>
    name.toLowerCase().includes(k.split(" ")[0].toLowerCase()),
  );
  return key ? COLORS[key] : "#64748b";
}

// ─── Helpers de data ──────────────────────────────────────────────────────────

function todayBR(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
function fmtEur(v: number) {
  return `€${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function weekRange(idx: number) {
  return { start: addDays(SEASON_START, idx * 7), end: addDays(SEASON_START, idx * 7 + 6) };
}
function currentWeekIdx() {
  const today = new Date(todayBR() + "T12:00:00Z");
  const season = new Date(SEASON_START + "T12:00:00Z");
  return Math.max(0, Math.floor((today.getTime() - season.getTime()) / (7 * 86_400_000)));
}

// ─── Tooltip do gráfico ───────────────────────────────────────────────────────

function DayTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-border bg-card shadow-xl p-3 text-xs min-w-[160px]">
      <p className="font-semibold text-sm mb-2">{d.label}</p>
      {(d.sellers as [string, number][])?.map(([name, val]) => (
        <div key={name} className="flex items-center justify-between gap-3 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: sellerColor(name) }} />
            <span className="text-muted-foreground">{name.split(" ")[0]}</span>
          </span>
          <span className="font-medium tabular-nums">{fmtEur(val)}</span>
        </div>
      ))}
      {!d.sellers?.length && <p className="text-muted-foreground">Sem vendas</p>}
      <div className="mt-2 pt-2 border-t border-border flex justify-between font-bold text-sm">
        <span>Total</span>
        <span>{fmtEur(d.total)}</span>
      </div>
    </div>
  );
}

// ─── Podium ───────────────────────────────────────────────────────────────────

type SellerStat = { name: string; total: number; count: number };

function Podium({ top }: { top: SellerStat[] }) {
  if (!top.length) return <p className="text-sm text-muted-foreground text-center py-4">Nenhuma venda</p>;
  const [gold, silver, bronze] = top;
  const order = [silver, gold, bronze].filter(Boolean);
  const heights = ["mt-6", "mt-0", "mt-10"];
  const medals = ["🥈", "🥇", "🥉"];

  return (
    <div className="flex items-end justify-center gap-2 py-3">
      {order.map((s, i) => (
        <div key={s.name} className={`flex flex-col items-center gap-1 flex-1 min-w-0 ${heights[i]}`}>
          <div
            className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ background: sellerColor(s.name) }}
          >
            {s.name.charAt(0)}
          </div>
          <div className={`w-full rounded-lg px-2 py-2 text-center ${i === 1 ? "bg-primary/10 border border-primary/30" : "bg-muted/50"}`}>
            <div className="text-xl leading-none">{medals[i]}</div>
            <div className="text-xs font-semibold mt-1 truncate">{s.name.split(" ")[0]}</div>
            <div className="text-xs font-bold tabular-nums mt-0.5">{fmtEur(s.total)}</div>
            <div className="text-xs text-muted-foreground">{s.count}v</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

function FechamentoSemanal() {
  const today = todayBR();
  const maxWeek = currentWeekIdx();
  const [weekIdx, setWeekIdx] = useState(maxWeek);
  const { start, end } = weekRange(weekIdx);
  const prevRange = weekIdx > 0 ? weekRange(weekIdx - 1) : null;

  const { data: allSales = [], isLoading } = useQuery({
    queryKey: ["fechamento-semanal"],
    queryFn: () => fetchManualSalesForCommissionFn({ data: { from: SEASON_START, to: today } }),
    staleTime: 60_000,
  });

  // Vendas da semana atual e anterior
  const weekSales = useMemo(
    () => allSales.filter((s) => s.sale_date >= start && s.sale_date <= end),
    [allSales, start, end],
  );
  const prevSales = useMemo(
    () => (prevRange ? allSales.filter((s) => s.sale_date >= prevRange.start && s.sale_date <= prevRange.end) : []),
    [allSales, prevRange],
  );

  const weekTotal = weekSales.reduce((s, x) => s + Number(x.value_eur), 0);
  const prevTotal = prevSales.reduce((s, x) => s + Number(x.value_eur), 0);
  const pctVsPrev = prevTotal > 0 ? Math.round(((weekTotal - prevTotal) / prevTotal) * 100) : null;

  // Evolução diária — 7 dias
  const dailyData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      const daySales = weekSales.filter((s) => s.sale_date === date);
      const total = daySales.reduce((s, x) => s + Number(x.value_eur), 0);
      const dow = new Date(date + "T12:00:00Z").getUTCDay();
      const sellerMap: Record<string, number> = {};
      for (const s of daySales) sellerMap[s.seller_name] = (sellerMap[s.seller_name] ?? 0) + Number(s.value_eur);
      const sellers = Object.entries(sellerMap).sort((a, b) => b[1] - a[1]) as [string, number][];
      return { date, label: `${DAYS_PT[dow]} ${fmtDate(date)}`, total, count: daySales.length, isFuture: date > today, sellers };
    });
  }, [weekSales, start, today]);

  const bestDay = dailyData.reduce<typeof dailyData[0] | null>(
    (best, d) => (!d.isFuture && d.total > (best?.total ?? -1) ? d : best), null,
  );

  // Ranking de vendedores
  const sellerRanking: SellerStat[] = useMemo(() => {
    const map: Record<string, SellerStat> = {};
    for (const s of weekSales) {
      if (!map[s.seller_name]) map[s.seller_name] = { name: s.seller_name, total: 0, count: 0 };
      map[s.seller_name].total += Number(s.value_eur);
      map[s.seller_name].count++;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [weekSales]);

  // Produto mais vendido
  const topProduct = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    for (const s of weekSales) {
      if (!map[s.product]) map[s.product] = { count: 0, total: 0 };
      map[s.product].count++;
      map[s.product].total += Number(s.value_eur);
    }
    const sorted = Object.entries(map).sort((a, b) => b[1].count - a[1].count);
    return sorted[0] ? { name: sorted[0][0], ...sorted[0][1] } : null;
  }, [weekSales]);

  // Histórico de semanas
  const history = useMemo(() => {
    return Array.from({ length: maxWeek + 1 }, (_, i) => {
      const { start: ws, end: we } = weekRange(i);
      const sales = allSales.filter((s) => s.sale_date >= ws && s.sale_date <= we);
      const total = sales.reduce((s, x) => s + Number(x.value_eur), 0);
      const map: Record<string, number> = {};
      for (const s of sales) map[s.seller_name] = (map[s.seller_name] ?? 0) + Number(s.value_eur);
      const top = Object.entries(map).sort((a, b) => b[1] - a[1])[0];
      return { idx: i, start: ws, end: we, total, count: sales.length, topSeller: top?.[0] ?? null, topTotal: top?.[1] ?? 0 };
    }).reverse();
  }, [allSales, maxWeek]);

  const bestWeek = history.reduce<typeof history[0] | null>((b, w) => (!b || w.total > b.total ? w : b), null);

  const topByWeeks: [string, number][] = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const w of history) if (w.topSeller) counts[w.topSeller] = (counts[w.topSeller] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [history]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-24 text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="space-y-6">

      {/* ── Cabeçalho + navegação ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            Fechamento Semanal
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Temporada desde {fmtDate(SEASON_START)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" disabled={weekIdx === 0} onClick={() => setWeekIdx((i) => i - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center min-w-[170px] px-3 py-2 rounded-lg border border-border bg-card">
            <div className="text-sm font-semibold">Semana {weekIdx + 1}</div>
            <div className="text-xs text-muted-foreground">{fmtDate(start)} – {fmtDate(end)}</div>
          </div>
          <Button variant="outline" size="icon" disabled={weekIdx >= maxWeek} onClick={() => setWeekIdx((i) => i + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {weekIdx !== maxWeek && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setWeekIdx(maxWeek)}>
              Semana atual
            </Button>
          )}
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Total da semana</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{fmtEur(weekTotal)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{weekSales.length} venda{weekSales.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">vs. Semana anterior</p>
            {pctVsPrev !== null ? (
              <div className="flex items-center gap-2 mt-1">
                <p className={`text-2xl font-bold ${pctVsPrev >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {pctVsPrev >= 0 ? "+" : ""}{pctVsPrev}%
                </p>
                {pctVsPrev >= 0
                  ? <TrendingUp className="h-5 w-5 text-emerald-400" />
                  : <TrendingDown className="h-5 w-5 text-red-400" />}
              </div>
            ) : (
              <p className="text-2xl font-bold text-muted-foreground mt-1">—</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">anterior: {fmtEur(prevTotal)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Melhor dia</p>
            {bestDay && bestDay.total > 0 ? (
              <>
                <p className="text-2xl font-bold mt-1">{bestDay.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{fmtEur(bestDay.total)} · {bestDay.count} vendas</p>
              </>
            ) : (
              <p className="text-2xl font-bold text-muted-foreground mt-1">—</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Produto top</p>
            {topProduct ? (
              <>
                <p className="text-base font-bold mt-1 leading-tight line-clamp-2">{topProduct.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{topProduct.count}x · {fmtEur(topProduct.total)}</p>
              </>
            ) : (
              <p className="text-2xl font-bold text-muted-foreground mt-1">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Gráfico diário + Podium ── */}
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Evolução diária — Semana {weekIdx + 1}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={dailyData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false} tickLine={false} width={44}
                />
                <RTooltip content={<DayTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={60}>
                  {dailyData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={
                        d.isFuture ? "hsl(var(--muted))"
                        : d.date === today ? "#6366f1"
                        : d.total === (bestDay?.total ?? -1) && d.total > 0 ? "#10b981"
                        : "#6366f160"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-2">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Melhor dia</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-indigo-500" />Hoje</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-muted-foreground/30" />Futuro</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-yellow-400" /> Ranking da Semana
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Podium top={sellerRanking.slice(0, 3)} />
            {sellerRanking.slice(3).map((s, i) => (
              <div key={s.name} className="flex items-center gap-2 py-1.5 border-t border-border/50 text-sm">
                <span className="text-muted-foreground w-5 text-right text-xs">{i + 4}º</span>
                <span className="h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ background: sellerColor(s.name) }}>
                  {s.name.charAt(0)}
                </span>
                <span className="flex-1 truncate">{s.name.split(" ")[0]}</span>
                <span className="tabular-nums text-xs font-medium">{fmtEur(s.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Tabela de vendas da semana ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            Vendas — Semana {weekIdx + 1} · {fmtDate(start)} a {fmtDate(end)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {weekSales.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-6">Nenhuma venda registrada nesta semana.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border bg-muted/40">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Data</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Produto</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Vendedor</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {[...weekSales].sort((a, b) => a.sale_date.localeCompare(b.sale_date)).map((s) => (
                    <tr key={s.id} className="border-t border-border/40 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2 text-muted-foreground tabular-nums">{fmtDate(s.sale_date)}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate font-medium">{s.product}</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: sellerColor(s.seller_name) }} />
                          {s.seller_name.split(" ")[0]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtEur(Number(s.value_eur))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                    <td className="px-4 py-2" colSpan={2}>Total</td>
                    <td className="px-3 py-2 text-muted-foreground text-sm">{weekSales.length} vendas</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtEur(weekTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Histórico + Destaques ── */}
      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-muted-foreground" /> Todas as Semanas da Temporada
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border bg-muted/40">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Semana</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Período</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Vendas</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Líder</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((w) => {
                    const isCurrent = w.idx === weekIdx;
                    const isBest = w.idx === bestWeek?.idx;
                    return (
                      <tr
                        key={w.idx}
                        onClick={() => setWeekIdx(w.idx)}
                        className={`border-t border-border/50 cursor-pointer hover:bg-muted/30 transition-colors ${isCurrent ? "bg-primary/5" : ""}`}
                      >
                        <td className="px-4 py-2 font-medium">
                          <span className="flex items-center gap-1.5">
                            S{w.idx + 1}
                            {isBest && <Flame className="h-3.5 w-3.5 text-orange-400" />}
                            {isCurrent && <Badge className="text-[10px] h-4 px-1 bg-primary/20 text-primary border-primary/30">atual</Badge>}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground tabular-nums">{fmtDate(w.start)} – {fmtDate(w.end)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{w.count}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtEur(w.total)}</td>
                        <td className="px-3 py-2">
                          {w.topSeller ? (
                            <span className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: sellerColor(w.topSeller) }} />
                              {w.topSeller.split(" ")[0]}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {bestWeek && (
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs font-semibold text-orange-300 flex items-center gap-1 mb-2">
                  <Flame className="h-3.5 w-3.5" /> Semana recorde
                </p>
                <p className="text-xl font-bold tabular-nums">{fmtEur(bestWeek.total)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  S{bestWeek.idx + 1} · {fmtDate(bestWeek.start)}–{fmtDate(bestWeek.end)}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Star className="h-4 w-4 text-yellow-400" /> Semanas no topo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pb-4">
              {topByWeeks.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem dados ainda.</p>
              ) : topByWeeks.map(([name, count], i) => (
                <div key={name} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4">{i + 1}º</span>
                  <span className="h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ background: sellerColor(name) }}>
                    {name.charAt(0)}
                  </span>
                  <span className="flex-1 text-sm truncate">{name.split(" ")[0]}</span>
                  <Badge variant="secondary" className="text-xs">{count}x</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
