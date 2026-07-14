import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchManualSalesForCommissionFn } from "@/lib/commission.functions";
import { fetchPipelineMetricsFn } from "@/lib/data.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getSellerPhoto } from "@/lib/seller-photos";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RTooltip, Cell,
} from "recharts";
import {
  ChevronLeft, ChevronRight, Trophy, TrendingUp, TrendingDown,
  CalendarDays, Flame, Star, ShoppingBag, ArrowRight, Users, Target, Clock, Inbox,
} from "lucide-react";

export const Route = createFileRoute("/_app/fechamento-semanal")({
  component: FechamentoSemanal,
});

// ─── Constantes ───────────────────────────────────────────────────────────────

const SEASON_START = "2026-06-01";
const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const COLORS: Record<string, string> = {
  "Gisele Pimentel": "#8b5cf6",
  "João Pessoa":     "#3b82f6",
  "Luana Guimarães": "#10b981",
  "Rita Bandeira":   "#f59e0b",
  "Fabio Nadal":     "#ef4444",
};
function sellerColor(name: string) {
  const key = Object.keys(COLORS).find((k) => name.toLowerCase().includes(k.split(" ")[0].toLowerCase()));
  return key ? COLORS[key] : "#64748b";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayBR(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso: string) { const [,m,d] = iso.split("-"); return `${d}/${m}`; }
function fmtEur(v: number) { return `€${v.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`; }
function weekRange(idx: number) {
  return { start: addDays(SEASON_START, idx*7), end: addDays(SEASON_START, idx*7+6) };
}
function currentWeekIdx() {
  const today = new Date(todayBR()+"T12:00:00Z");
  const season = new Date(SEASON_START+"T12:00:00Z");
  return Math.max(0, Math.floor((today.getTime()-season.getTime())/(7*86_400_000)));
}
function isoMonth(iso: string) { return iso.slice(0,7); } // "2026-07"

type Sale = Awaited<ReturnType<typeof fetchManualSalesForCommissionFn>>[number];
type SellerStat = { name: string; total: number; count: number };

// ─── Tooltip diário ──────────────────────────────────────────────────────────

function DayTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-border bg-card shadow-xl p-3 text-xs min-w-[160px]">
      <p className="font-semibold text-sm mb-2">{d.label}</p>
      {(d.sellers as [string,number][])?.map(([name,val]) => (
        <div key={name} className="flex items-center justify-between gap-3 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{background:sellerColor(name)}}/>
            <span className="text-muted-foreground">{name.split(" ")[0]}</span>
          </span>
          <span className="font-medium tabular-nums">{fmtEur(val)}</span>
        </div>
      ))}
      {!d.sellers?.length && <p className="text-muted-foreground">Sem vendas</p>}
      <div className="mt-2 pt-2 border-t border-border flex justify-between font-bold text-sm">
        <span>Total</span><span>{fmtEur(d.total)}</span>
      </div>
    </div>
  );
}

// ─── Tooltip semanal (para view mês) ─────────────────────────────────────────

function WeekTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-border bg-card shadow-xl p-3 text-xs min-w-[160px]">
      <p className="font-semibold text-sm mb-1">{d.label}</p>
      <p className="text-muted-foreground mb-2">{fmtDate(d.start)} – {fmtDate(d.end)}</p>
      <div className="flex justify-between font-bold text-sm">
        <span>Total</span><span>{fmtEur(d.total)}</span>
      </div>
      <p className="text-muted-foreground mt-1">{d.count} vendas</p>
    </div>
  );
}

// ─── Podium ───────────────────────────────────────────────────────────────────

const PODIUM_STYLES = [
  { card: "bg-slate-400/10 border border-slate-400/30",   ring: "ring-2 ring-slate-400/50",  size: "h-9 w-9"  }, // silver (left)
  { card: "bg-yellow-400/15 border border-yellow-400/40", ring: "ring-2 ring-yellow-400/70", size: "h-11 w-11" }, // gold (center)
  { card: "bg-orange-600/10 border border-orange-600/30", ring: "ring-1 ring-orange-600/50", size: "h-8 w-8"  }, // bronze (right)
];

function Podium({ top }: { top: SellerStat[] }) {
  if (!top.length) return <p className="text-sm text-muted-foreground text-center py-4">Nenhuma venda</p>;
  const [gold, silver, bronze] = top;
  const order = [silver, gold, bronze].filter(Boolean);
  const heights = ["mt-6","mt-0","mt-10"];
  const medals = ["🥈","🥇","🥉"];
  return (
    <div className="flex items-end justify-center gap-2 py-3">
      {order.map((s,i) => {
        const st = PODIUM_STYLES[i];
        return (
          <div key={s.name} className={`flex flex-col items-center gap-1.5 flex-1 min-w-0 ${heights[i]}`}>
            <div className={`${st.size} rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${st.ring}`}
              style={{background:sellerColor(s.name)}}>{s.name.charAt(0)}</div>
            <div className={`w-full rounded-lg px-2 py-2 text-center ${st.card}`}>
              <div className="text-xl leading-none">{medals[i]}</div>
              <div className="text-xs font-semibold mt-1 truncate">{s.name.split(" ")[0]}</div>
              <div className="text-xs font-bold tabular-nums mt-0.5">{fmtEur(s.total)}</div>
              <div className="text-xs text-muted-foreground">{s.count}v</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── View Semana ─────────────────────────────────────────────────────────────

function WeekView({ allSales, maxWeek }: { allSales: Sale[]; maxWeek: number }) {
  const today = todayBR();
  const [weekIdx, setWeekIdx] = useState(maxWeek);
  const { start, end } = weekRange(weekIdx);
  const prevRange = weekIdx > 0 ? weekRange(weekIdx-1) : null;

  const weekSales = useMemo(() => allSales.filter(s => s.sale_date>=start && s.sale_date<=end), [allSales,start,end]);
  const prevSales = useMemo(() => prevRange ? allSales.filter(s => s.sale_date>=prevRange.start && s.sale_date<=prevRange.end) : [], [allSales,prevRange]);

  const weekTotal = weekSales.reduce((s,x)=>s+Number(x.value_eur),0);
  const prevTotal = prevSales.reduce((s,x)=>s+Number(x.value_eur),0);
  const pctVsPrev = prevTotal>0 ? Math.round(((weekTotal-prevTotal)/prevTotal)*100) : null;

  const dailyData = useMemo(() => Array.from({length:7},(_,i)=>{
    const date = addDays(start,i);
    const daySales = weekSales.filter(s=>s.sale_date===date);
    const total = daySales.reduce((s,x)=>s+Number(x.value_eur),0);
    const dow = new Date(date+"T12:00:00Z").getUTCDay();
    const map: Record<string,number> = {};
    for (const s of daySales) map[s.seller_name]=(map[s.seller_name]??0)+Number(s.value_eur);
    const sellers = Object.entries(map).sort((a,b)=>b[1]-a[1]) as [string,number][];
    return {date, label:`${DAYS_PT[dow]} ${fmtDate(date)}`, total, count:daySales.length, isFuture:date>today, sellers};
  }), [weekSales,start,today]);

  const bestDay = dailyData.reduce<typeof dailyData[0]|null>((b,d)=>(!d.isFuture&&d.total>(b?.total??-1)?d:b),null);

  const sellerRanking: SellerStat[] = useMemo(()=>{
    const map: Record<string,SellerStat>={};
    for (const s of weekSales){
      if(!map[s.seller_name]) map[s.seller_name]={name:s.seller_name,total:0,count:0};
      map[s.seller_name].total+=Number(s.value_eur); map[s.seller_name].count++;
    }
    return Object.values(map).sort((a,b)=>b.total-a.total);
  },[weekSales]);

  const topProduct = useMemo(()=>{
    const map: Record<string,{count:number;total:number}>={};
    for (const s of weekSales){if(!map[s.product])map[s.product]={count:0,total:0};map[s.product].count++;map[s.product].total+=Number(s.value_eur);}
    const sorted=Object.entries(map).sort((a,b)=>b[1].count-a[1].count);
    return sorted[0]?{name:sorted[0][0],...sorted[0][1]}:null;
  },[weekSales]);

  const history = useMemo(()=>Array.from({length:maxWeek+1},(_,i)=>{
    const {start:ws,end:we}=weekRange(i);
    const sales=allSales.filter(s=>s.sale_date>=ws&&s.sale_date<=we);
    const total=sales.reduce((s,x)=>s+Number(x.value_eur),0);
    const map: Record<string,number>={};
    for (const s of sales) map[s.seller_name]=(map[s.seller_name]??0)+Number(s.value_eur);
    const top=Object.entries(map).sort((a,b)=>b[1]-a[1])[0];
    return {idx:i,start:ws,end:we,total,count:sales.length,topSeller:top?.[0]??null};
  }).reverse(),[allSales,maxWeek]);

  const bestWeek=history.reduce<typeof history[0]|null>((b,w)=>(!b||w.total>b.total?w:b),null);
  const topByWeeks:[string,number][]=useMemo(()=>{
    const c:Record<string,number>={};
    for (const w of history) if(w.topSeller) c[w.topSeller]=(c[w.topSeller]??0)+1;
    return Object.entries(c).sort((a,b)=>b[1]-a[1]);
  },[history]);

  return (
    <div className="space-y-5">
      {/* Navegador */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" size="icon" disabled={weekIdx===0} onClick={()=>setWeekIdx(i=>i-1)}><ChevronLeft className="h-4 w-4"/></Button>
        <div className="text-center min-w-[170px] px-3 py-2 rounded-lg border border-border bg-card">
          <div className="text-sm font-semibold">Semana {weekIdx+1}</div>
          <div className="text-xs text-muted-foreground">{fmtDate(start)} – {fmtDate(end)}</div>
        </div>
        <Button variant="outline" size="icon" disabled={weekIdx>=maxWeek} onClick={()=>setWeekIdx(i=>i+1)}><ChevronRight className="h-4 w-4"/></Button>
        {weekIdx!==maxWeek&&<Button variant="ghost" size="sm" className="text-xs" onClick={()=>setWeekIdx(maxWeek)}>Semana atual</Button>}
      </div>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-violet-500"><CardContent className="pt-5 pb-4">
          <p className="text-xs text-muted-foreground">Total da semana</p>
          <p className="text-2xl font-bold tabular-nums mt-1 text-violet-500">{fmtEur(weekTotal)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{weekSales.length} venda{weekSales.length!==1?"s":""}</p>
        </CardContent></Card>

        <Card style={{borderLeftWidth:4,borderLeftStyle:"solid",borderLeftColor:pctVsPrev===null?"#64748b":pctVsPrev>=0?"#10b981":"#ef4444"}}><CardContent className="pt-5 pb-4">
          <p className="text-xs text-muted-foreground">vs. Semana anterior</p>
          {pctVsPrev!==null?(
            <div className="flex items-center gap-2 mt-1">
              <p className={`text-2xl font-bold ${pctVsPrev>=0?"text-emerald-500":"text-red-500"}`}>{pctVsPrev>=0?"+":""}{pctVsPrev}%</p>
              {pctVsPrev>=0?<TrendingUp className="h-5 w-5 text-emerald-500"/>:<TrendingDown className="h-5 w-5 text-red-500"/>}
            </div>
          ):<p className="text-2xl font-bold text-muted-foreground mt-1">—</p>}
          <p className="text-xs text-muted-foreground mt-0.5">anterior: {fmtEur(prevTotal)}</p>
        </CardContent></Card>

        <Card className="border-l-4 border-emerald-500"><CardContent className="pt-5 pb-4">
          <p className="text-xs text-muted-foreground">Melhor dia</p>
          {bestDay&&bestDay.total>0?(<>
            <p className="text-xl font-bold mt-1 text-emerald-500">{bestDay.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{fmtEur(bestDay.total)} · {bestDay.count} vendas</p>
          </>):<p className="text-2xl font-bold text-muted-foreground mt-1">—</p>}
        </CardContent></Card>

        <Card className="border-l-4 border-amber-500"><CardContent className="pt-5 pb-4">
          <p className="text-xs text-muted-foreground">Produto top</p>
          {topProduct?(<>
            <p className="text-base font-bold mt-1 leading-tight line-clamp-2">{topProduct.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5"><span className="text-amber-500 font-semibold">{topProduct.count}x</span> · {fmtEur(topProduct.total)}</p>
          </>):<p className="text-2xl font-bold text-muted-foreground mt-1">—</p>}
        </CardContent></Card>
      </div>

      {/* Gráfico + Podium */}
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Evolução diária — Semana {weekIdx+1}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={dailyData} margin={{top:4,right:4,bottom:0,left:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>
                <XAxis dataKey="label" tick={{fontSize:11,fill:"hsl(var(--muted-foreground))"}} axisLine={false} tickLine={false}/>
                <YAxis tickFormatter={v=>`€${(v/1000).toFixed(0)}k`} tick={{fontSize:11,fill:"hsl(var(--muted-foreground))"}} axisLine={false} tickLine={false} width={44}/>
                <RTooltip content={<DayTooltip/>} cursor={{fill:"hsl(var(--muted))",opacity:0.4}}/>
                <Bar dataKey="total" radius={[6,6,0,0]} maxBarSize={60}>
                  {dailyData.map((d,i)=>(
                    <Cell key={i} fill={d.isFuture?"hsl(var(--muted))":d.date===today?"#6366f1":d.total===(bestDay?.total??-1)&&d.total>0?"#10b981":"#6366f160"}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-2">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500"/>Melhor dia</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-indigo-500"/>Hoje</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-muted-foreground/30"/>Futuro</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-semibold flex items-center gap-1.5"><Trophy className="h-4 w-4 text-yellow-400"/>Ranking da Semana</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <Podium top={sellerRanking.slice(0,3)}/>
            {sellerRanking.slice(3).map((s,i)=>(
              <div key={s.name} className="flex items-center gap-2 py-1.5 border-t border-border/50 text-sm">
                <span className="text-muted-foreground w-5 text-right text-xs">{i+4}º</span>
                <span className="h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{background:sellerColor(s.name)}}>{s.name.charAt(0)}</span>
                <span className="flex-1 truncate">{s.name.split(" ")[0]}</span>
                <span className="tabular-nums text-xs font-medium">{fmtEur(s.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Tabela de vendas */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-1.5"><ShoppingBag className="h-4 w-4 text-muted-foreground"/>Vendas — Semana {weekIdx+1} · {fmtDate(start)} a {fmtDate(end)}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {weekSales.length===0?(<p className="text-sm text-muted-foreground px-4 py-6">Nenhuma venda registrada nesta semana.</p>):(
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-t border-border bg-muted/40">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Data</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Produto</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Vendedor</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Valor</th>
                </tr></thead>
                <tbody>
                  {[...weekSales].sort((a,b)=>a.sale_date.localeCompare(b.sale_date)).map(s=>(
                    <tr key={s.id} className="border-t border-border/40 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2 text-muted-foreground tabular-nums">{fmtDate(s.sale_date)}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate font-medium">{s.product}</td>
                      <td className="px-3 py-2"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full shrink-0" style={{background:sellerColor(s.seller_name)}}/>{s.seller_name.split(" ")[0]}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtEur(Number(s.value_eur))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className="px-4 py-2" colSpan={2}>Total</td>
                  <td className="px-3 py-2 text-muted-foreground text-sm">{weekSales.length} vendas</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtEur(weekTotal)}</td>
                </tr></tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Histórico + destaques */}
      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-muted-foreground"/>Todas as Semanas da Temporada</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-t border-border bg-muted/40">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Semana</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Período</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Vendas</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Líder</th>
                </tr></thead>
                <tbody>
                  {history.map(w=>{
                    const isCurrent=w.idx===weekIdx;
                    const isBest=w.idx===bestWeek?.idx;
                    return (
                      <tr key={w.idx} onClick={()=>setWeekIdx(w.idx)}
                        className={`border-t cursor-pointer transition-colors hover:bg-muted/30
                          ${isBest?"border-l-2 border-l-orange-500 border-border/50 bg-orange-500/5":
                            isCurrent?"border-l-2 border-l-violet-500 border-border/50 bg-violet-500/5":
                            "border-border/40"}`}>
                        <td className="px-4 py-2 font-medium"><span className="flex items-center gap-1.5">S{w.idx+1}{isBest&&<Flame className="h-3.5 w-3.5 text-orange-500"/>}{isCurrent&&<Badge className="text-[10px] h-4 px-1 bg-violet-500/20 text-violet-500 border-violet-500/30">atual</Badge>}</span></td>
                        <td className="px-3 py-2 text-muted-foreground tabular-nums">{fmtDate(w.start)} – {fmtDate(w.end)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{w.count}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-medium ${isBest?"text-orange-500":""}`}>{fmtEur(w.total)}</td>
                        <td className="px-3 py-2">{w.topSeller?(<span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{background:sellerColor(w.topSeller)}}/>{w.topSeller.split(" ")[0]}</span>):(<span className="text-muted-foreground">—</span>)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {bestWeek&&(
            <Card className="border-l-4 border-orange-500 bg-orange-500/5"><CardContent className="pt-4 pb-4">
              <p className="text-xs font-semibold text-orange-500 flex items-center gap-1 mb-2"><Flame className="h-3.5 w-3.5"/>Semana recorde</p>
              <p className="text-xl font-bold tabular-nums text-orange-500">{fmtEur(bestWeek.total)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">S{bestWeek.idx+1} · {fmtDate(bestWeek.start)}–{fmtDate(bestWeek.end)}</p>
            </CardContent></Card>
          )}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-1.5"><Star className="h-4 w-4 text-yellow-400"/>Semanas no topo</CardTitle></CardHeader>
            <CardContent className="space-y-2 pb-4">
              {topByWeeks.length===0?(<p className="text-xs text-muted-foreground">Sem dados ainda.</p>):topByWeeks.map(([name,count],i)=>(
                <div key={name} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4">{i+1}º</span>
                  <span className="h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{background:sellerColor(name)}}>{name.charAt(0)}</span>
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

// ─── Pipeline Aproveitamento ─────────────────────────────────────────────────

function PipelineAproveitamento({ month, monthTotal, monthSalesCount }: {
  month: string;
  monthTotal: number;
  monthSalesCount: number;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["pipeline-metrics", month],
    queryFn: () => fetchPipelineMetricsFn({ data: { month } }),
    staleTime: 5 * 60_000,
  });

  function fmtCiclo(days: number | null) {
    if (days === null) return "—";
    const d = Math.floor(days);
    const h = Math.floor((days - d) * 24);
    if (d === 0) return `${h}h`;
    return h > 0 ? `${d}d ${h}h` : `${d}d`;
  }

  const skeleton = "h-6 w-16 bg-muted/50 animate-pulse rounded";

  return (
    <Card className="border border-violet-500/30 bg-violet-500/5">
      <CardContent className="pt-4 pb-4">
        <p className="text-xs font-semibold text-violet-400 mb-3 flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5" />
          Pipeline Comercial-V3 + Sessão Estratégica — aproveitamento do mês
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {/* Recebidos */}
          <div className="flex flex-col items-center rounded-lg border border-border/60 bg-card/60 px-4 py-2.5 min-w-[80px]">
            <Inbox className="h-4 w-4 text-muted-foreground mb-1" />
            {isLoading ? <div className={skeleton} /> : (
              <span className="text-xl font-bold tabular-nums">{data?.recebidos ?? "—"}</span>
            )}
            <span className="text-[11px] text-muted-foreground mt-0.5">Recebidos</span>
          </div>

          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

          {/* Em aberto */}
          <div className="flex flex-col items-center rounded-lg border border-border/60 bg-card/60 px-4 py-2.5 min-w-[80px]">
            <Users className="h-4 w-4 text-blue-400 mb-1" />
            {isLoading ? <div className={skeleton} /> : (
              <span className="text-xl font-bold tabular-nums text-blue-400">{data?.emAberto ?? "—"}</span>
            )}
            <span className="text-[11px] text-muted-foreground mt-0.5">Em aberto</span>
          </div>

          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

          {/* Fechados (Clint WON) */}
          <div className="flex flex-col items-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 min-w-[80px]">
            <Trophy className="h-4 w-4 text-emerald-400 mb-1" />
            {isLoading ? <div className={skeleton} /> : (
              <span className="text-xl font-bold tabular-nums text-emerald-400">{data?.fechados ?? "—"}</span>
            )}
            <span className="text-[11px] text-muted-foreground mt-0.5">Ganhos</span>
          </div>

          {/* Separador */}
          <div className="hidden sm:flex items-center self-stretch mx-2">
            <div className="w-px h-full bg-border/50" />
          </div>

          {/* Conversão */}
          <div className="flex flex-col items-center rounded-lg border border-border/60 bg-card/60 px-4 py-2.5 min-w-[80px]">
            <Target className="h-4 w-4 text-amber-400 mb-1" />
            {isLoading ? <div className={skeleton} /> : (
              <span className="text-xl font-bold tabular-nums text-amber-400">
                {data ? `${data.conversao.toFixed(1)}%` : "—"}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground mt-0.5">Conversão</span>
          </div>

          {/* Ciclo médio */}
          <div className="flex flex-col items-center rounded-lg border border-border/60 bg-card/60 px-4 py-2.5 min-w-[80px]">
            <Clock className="h-4 w-4 text-muted-foreground mb-1" />
            {isLoading ? <div className={skeleton} /> : (
              <span className="text-xl font-bold tabular-nums">{fmtCiclo(data?.cicloMedioDias ?? null)}</span>
            )}
            <span className="text-[11px] text-muted-foreground mt-0.5">Ciclo médio</span>
          </div>

          {/* Seta para receita */}
          <div className="hidden sm:flex items-center self-stretch mx-1">
            <ArrowRight className="h-5 w-5 text-violet-400" />
          </div>

          {/* Total fechado (manual_sales) */}
          <div className="flex flex-col items-center rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 py-2.5 min-w-[100px]">
            <span className="text-[10px] font-semibold text-violet-400 mb-1">RECEITA</span>
            <span className="text-xl font-bold tabular-nums text-violet-400">{fmtEur(monthTotal)}</span>
            <span className="text-[11px] text-muted-foreground mt-0.5">{monthSalesCount} vendas registradas</span>
          </div>
        </div>

        {!isLoading && data && (
          <p className="text-[11px] text-muted-foreground mt-2.5">
            Dados de entrada: Clint CRM · Receita: fechamento manual · Conversão = ganhos Clint / recebidos no mês
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── View Mês ─────────────────────────────────────────────────────────────────

function MonthView({ allSales, maxWeek }: { allSales: Sale[]; maxWeek: number }) {
  const today = todayBR();
  const [yearMonth, setYearMonth] = useState(() => todayBR().slice(0,7));

  // Navegar meses disponíveis (desde SEASON_START até mês atual)
  const months = useMemo(()=>{
    const result: string[] = [];
    const cur = new Date(SEASON_START+"T12:00:00Z");
    const end = new Date(today+"T12:00:00Z");
    while (cur<=end){
      result.push(cur.toISOString().slice(0,7));
      cur.setUTCMonth(cur.getUTCMonth()+1);
    }
    return result;
  },[today]);

  const monthIdx = months.indexOf(yearMonth);
  const canPrev = monthIdx>0;
  const canNext = monthIdx<months.length-1;

  const [y,m] = yearMonth.split("-").map(Number);
  const monthLabel = `${MONTHS_PT[m-1]} ${y}`;

  // Vendas do mês
  const monthSales = useMemo(()=>allSales.filter(s=>isoMonth(s.sale_date)===yearMonth),[allSales,yearMonth]);

  // Semanas que têm vendas neste mês (ou começam neste mês)
  const weekData = useMemo(()=>{
    return Array.from({length:maxWeek+1},(_,i)=>{
      const {start,end}=weekRange(i);
      // inclui semana se algum dia dela cai no mês
      if (isoMonth(start)!==yearMonth && isoMonth(end)!==yearMonth) return null;
      const sales=allSales.filter(s=>s.sale_date>=start&&s.sale_date<=end&&isoMonth(s.sale_date)===yearMonth);
      if (sales.length===0 && isoMonth(start)!==yearMonth) return null;
      const total=sales.reduce((s,x)=>s+Number(x.value_eur),0);
      const map: Record<string,number>={};
      for (const s of sales) map[s.seller_name]=(map[s.seller_name]??0)+Number(s.value_eur);
      const top=Object.entries(map).sort((a,b)=>b[1]-a[1])[0];
      return {idx:i,start,end,total,count:sales.length,topSeller:top?.[0]??null,label:`S${i+1}`};
    }).filter(Boolean) as NonNullable<ReturnType<typeof weekRange>&{idx:number;total:number;count:number;topSeller:string|null;label:string}>[];
  },[allSales,yearMonth,maxWeek]);

  const monthTotal = monthSales.reduce((s,x)=>s+Number(x.value_eur),0);

  const sellerRanking: SellerStat[] = useMemo(()=>{
    const map: Record<string,SellerStat>={};
    for (const s of monthSales){
      if(!map[s.seller_name]) map[s.seller_name]={name:s.seller_name,total:0,count:0};
      map[s.seller_name].total+=Number(s.value_eur); map[s.seller_name].count++;
    }
    return Object.values(map).sort((a,b)=>b.total-a.total);
  },[monthSales]);

  const topProduct = useMemo(()=>{
    const map: Record<string,{count:number;total:number}>={};
    for (const s of monthSales){if(!map[s.product])map[s.product]={count:0,total:0};map[s.product].count++;map[s.product].total+=Number(s.value_eur);}
    const sorted=Object.entries(map).sort((a,b)=>b[1].count-a[1].count);
    return sorted[0]?{name:sorted[0][0],...sorted[0][1]}:null;
  },[monthSales]);

  const bestWeek = weekData.reduce<typeof weekData[0]|null>((b,w)=>(!b||w.total>b.total?w:b),null);

  return (
    <div className="space-y-5">
      {/* Navegador mês */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" size="icon" disabled={!canPrev} onClick={()=>setYearMonth(months[monthIdx-1])}><ChevronLeft className="h-4 w-4"/></Button>
        <div className="text-center min-w-[170px] px-3 py-2 rounded-lg border border-border bg-card">
          <div className="text-sm font-semibold">{monthLabel}</div>
          <div className="text-xs text-muted-foreground">{weekData.length} semana{weekData.length!==1?"s":""} · {monthSales.length} vendas</div>
        </div>
        <Button variant="outline" size="icon" disabled={!canNext} onClick={()=>setYearMonth(months[monthIdx+1])}><ChevronRight className="h-4 w-4"/></Button>
      </div>

      {/* Pipeline Aproveitamento */}
      <PipelineAproveitamento month={yearMonth} monthTotal={monthTotal} monthSalesCount={monthSales.length} />

      {/* KPIs do mês */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-violet-500"><CardContent className="pt-5 pb-4">
          <p className="text-xs text-muted-foreground">Total do mês</p>
          <p className="text-2xl font-bold tabular-nums mt-1 text-violet-500">{fmtEur(monthTotal)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{monthSales.length} vendas</p>
        </CardContent></Card>

        <Card className="border-l-4 border-orange-500"><CardContent className="pt-5 pb-4">
          <p className="text-xs text-muted-foreground">Melhor semana</p>
          {bestWeek&&bestWeek.total>0?(<>
            <p className="text-2xl font-bold mt-1 text-orange-500">S{bestWeek.idx+1}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{fmtEur(bestWeek.total)} · {bestWeek.count} vendas</p>
          </>):<p className="text-2xl font-bold text-muted-foreground mt-1">—</p>}
        </CardContent></Card>

        <Card style={{borderLeftWidth:4,borderLeftStyle:"solid",borderLeftColor:sellerRanking[0]?sellerColor(sellerRanking[0].name):"#64748b"}}><CardContent className="pt-5 pb-4">
          <p className="text-xs text-muted-foreground">Líder do mês</p>
          {sellerRanking[0]?(<>
            <div className="flex items-center gap-2 mt-1">
              <span className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ring-2" style={{background:sellerColor(sellerRanking[0].name),["--tw-ring-color" as any]:sellerColor(sellerRanking[0].name)}}>{sellerRanking[0].name.charAt(0)}</span>
              <p className="text-lg font-bold truncate" style={{color:sellerColor(sellerRanking[0].name)}}>{sellerRanking[0].name.split(" ")[0]}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{fmtEur(sellerRanking[0].total)} · {sellerRanking[0].count} vendas</p>
          </>):<p className="text-2xl font-bold text-muted-foreground mt-1">—</p>}
        </CardContent></Card>

        <Card className="border-l-4 border-amber-500"><CardContent className="pt-5 pb-4">
          <p className="text-xs text-muted-foreground">Produto top</p>
          {topProduct?(<>
            <p className="text-base font-bold mt-1 leading-tight line-clamp-2">{topProduct.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5"><span className="text-amber-500 font-semibold">{topProduct.count}x</span> · {fmtEur(topProduct.total)}</p>
          </>):<p className="text-2xl font-bold text-muted-foreground mt-1">—</p>}
        </CardContent></Card>
      </div>

      {/* Gráfico por semana + Podium */}
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Evolução por semana — {monthLabel}</CardTitle></CardHeader>
          <CardContent>
            {weekData.length===0?(<p className="text-sm text-muted-foreground py-8 text-center">Nenhuma venda neste mês.</p>):(
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={weekData} margin={{top:4,right:4,bottom:0,left:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>
                  <XAxis dataKey="label" tick={{fontSize:12,fill:"hsl(var(--muted-foreground))"}} axisLine={false} tickLine={false}/>
                  <YAxis tickFormatter={v=>`€${(v/1000).toFixed(0)}k`} tick={{fontSize:11,fill:"hsl(var(--muted-foreground))"}} axisLine={false} tickLine={false} width={44}/>
                  <RTooltip content={<WeekTooltip/>} cursor={{fill:"hsl(var(--muted))",opacity:0.4}}/>
                  <Bar dataKey="total" radius={[6,6,0,0]} maxBarSize={80}>
                    {weekData.map((w,i)=>{
                      if (w.idx===bestWeek?.idx) return <Cell key={i} fill="#10b981"/>;
                      const c = w.topSeller ? sellerColor(w.topSeller) : "#6366f1";
                      return <Cell key={i} fill={c} fillOpacity={w.end>=today?0.9:0.55}/>;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-2">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500"/>Melhor semana</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-muted-foreground/40"/>Cor = vendedor líder da semana</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-semibold flex items-center gap-1.5"><Trophy className="h-4 w-4 text-yellow-400"/>Ranking do Mês</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <Podium top={sellerRanking.slice(0,3)}/>
            {sellerRanking.slice(3).map((s,i)=>(
              <div key={s.name} className="flex items-center gap-2 py-1.5 border-t border-border/50 text-sm">
                <span className="text-muted-foreground w-5 text-right text-xs">{i+4}º</span>
                <span className="h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{background:sellerColor(s.name)}}>{s.name.charAt(0)}</span>
                <span className="flex-1 truncate">{s.name.split(" ")[0]}</span>
                <span className="tabular-nums text-xs font-medium">{fmtEur(s.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Tabela de semanas do mês */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Semanas de {monthLabel}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {weekData.length===0?(<p className="text-sm text-muted-foreground px-4 py-6">Nenhuma venda neste mês.</p>):(
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-t border-border bg-muted/40">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Semana</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Período</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Vendas</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Líder</th>
                </tr></thead>
                <tbody>
                  {weekData.map(w=>{
                    const isBest=w.idx===bestWeek?.idx;
                    return (
                      <tr key={w.idx} className={`border-t transition-colors
                        ${isBest?"border-l-2 border-l-orange-500 border-border/50 bg-orange-500/5":"border-border/40"}`}>
                        <td className="px-4 py-2 font-medium"><span className="flex items-center gap-1.5">S{w.idx+1}{isBest&&<Flame className="h-3.5 w-3.5 text-orange-500"/>}</span></td>
                        <td className="px-3 py-2 text-muted-foreground tabular-nums">{fmtDate(w.start)} – {fmtDate(w.end)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{w.count}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-medium ${isBest?"text-orange-500":""}`}>{fmtEur(w.total)}</td>
                        <td className="px-3 py-2">{w.topSeller?(<span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{background:sellerColor(w.topSeller)}}/>{w.topSeller.split(" ")[0]}</span>):(<span className="text-muted-foreground">—</span>)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className="px-4 py-2" colSpan={2}>Total do mês</td>
                  <td className="px-3 py-2 text-right tabular-nums">{monthSales.length}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtEur(monthTotal)}</td>
                  <td/>
                </tr></tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Componente raiz ──────────────────────────────────────────────────────────

function FechamentoSemanal() {
  const today = todayBR();
  const maxWeek = currentWeekIdx();

  const { data: allSales = [], isLoading } = useQuery({
    queryKey: ["fechamento-semanal"],
    queryFn: () => fetchManualSalesForCommissionFn({ data: { from: SEASON_START, to: today } }),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-24 text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-violet-500"/>
        <div>
          <h2 className="text-xl font-semibold leading-none">Fechamento Semanal</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Temporada desde {fmtDate(SEASON_START)}</p>
        </div>
      </div>

      <Tabs defaultValue="semana">
        <TabsList className="mb-4">
          <TabsTrigger value="semana">📅 Semana</TabsTrigger>
          <TabsTrigger value="mes">📆 Mês</TabsTrigger>
        </TabsList>
        <TabsContent value="semana">
          <WeekView allSales={allSales} maxWeek={maxWeek}/>
        </TabsContent>
        <TabsContent value="mes">
          <MonthView allSales={allSales} maxWeek={maxWeek}/>
        </TabsContent>
      </Tabs>
    </div>
  );
}
