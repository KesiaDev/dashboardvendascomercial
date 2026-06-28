/**
 * Business Intelligence Layer: agregação de dados desacoplada da interface.
 * Os dashboards consomem estas funções em vez de filtrar clint_deals
 * diretamente — assim, qualquer pipeline novo entra automaticamente em
 * uma área de negócio (via bi_pipeline_areas) sem precisar tocar em código
 * de dashboard nenhum.
 */
import { supabase } from "@/integrations/supabase/client";
import type { BusinessArea } from "@/lib/pipeline-areas";

export type Deal = {
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

export type Period = "week" | "month" | "quarter" | "semester" | "year" | "all";

export function periodStart(p: Period): Date | null {
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

export function periodRange(period: Period, dateRange?: { from?: Date; to?: Date }) {
  const usingRange = !!dateRange?.from;
  const start = usingRange ? dateRange!.from! : periodStart(period);
  const end =
    usingRange && dateRange?.to
      ? new Date(dateRange.to.getTime() + 24 * 60 * 60 * 1000 - 1)
      : null;
  return { start, end };
}

export async function fetchAllDeals(): Promise<Deal[]> {
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

export type PipelineArea = { pipeline_id: string; area: string; ativo: boolean };

export async function fetchPipelineAreas(): Promise<PipelineArea[]> {
  const { data, error } = await supabase.from("bi_pipeline_areas").select("pipeline_id,area,ativo");
  if (error) throw error;
  return (data ?? []) as PipelineArea[];
}

export function buildAreaMap(areas: PipelineArea[]): Map<string, BusinessArea> {
  const m = new Map<string, BusinessArea>();
  for (const a of areas) m.set(a.pipeline_id, a.area as BusinessArea);
  return m;
}

/** Filtra deals por área de negócio (via origin_id → bi_pipeline_areas), ignorando
 * pipeline específico. `area === null` retorna todos (exceto TESTES). */
export function filterDealsByArea(
  deals: Deal[],
  areaMap: Map<string, BusinessArea>,
  area: BusinessArea | null,
): Deal[] {
  return deals.filter((d) => {
    const dealArea = d.origin_id ? areaMap.get(d.origin_id) ?? "OUTROS" : "OUTROS";
    if (area) return dealArea === area;
    return dealArea !== "TESTES";
  });
}

export function filterByPeriodCreated(deals: Deal[], start: Date | null, end: Date | null): Deal[] {
  return deals.filter((d) => {
    if (!d.created_at) return !start;
    const dt = new Date(d.created_at);
    if (start && dt < start) return false;
    if (end && dt > end) return false;
    return true;
  });
}

export type SellerStats = {
  user_id: string;
  name: string;
  email: string;
  leads: number;
  won: number;
  lost: number;
  open: number;
  revenue: number;
};

function convertValue(value: number, dealCurrency: string | null, displayCurrency: "BRL" | "EUR", rate: number) {
  const dealCur = (dealCurrency ?? "BRL").toUpperCase();
  if (dealCur === displayCurrency) return value;
  if (dealCur === "EUR" && displayCurrency === "BRL") return value * rate;
  if (dealCur === "BRL" && displayCurrency === "EUR") return value / rate;
  return value;
}

/**
 * Ranking de vendedores: leads recebidos contam por created_at no período;
 * ganhos e faturamento contam por won_at no período (venda fechada naquele
 * mês, independente de quando o lead entrou). `allDeals` deve ser o
 * conjunto já filtrado por área (mas SEM filtro de período) para capturar
 * vendas fechadas de leads antigos.
 */
export function rankSellers(
  allDealsInArea: Deal[],
  start: Date | null,
  end: Date | null,
  currency: "BRL" | "EUR",
  rate: number,
): SellerStats[] {
  const map = new Map<string, SellerStats>();
  const ensure = (d: Deal): SellerStats => {
    const key = d.user_id!;
    let cur = map.get(key);
    if (!cur) {
      cur = {
        user_id: key,
        name: d.user_name ?? d.user_email ?? "—",
        email: d.user_email ?? "",
        leads: 0,
        won: 0,
        lost: 0,
        open: 0,
        revenue: 0,
      };
      map.set(key, cur);
    }
    return cur;
  };

  const createdInPeriod = filterByPeriodCreated(allDealsInArea, start, end);
  for (const d of createdInPeriod) {
    if (!d.user_id) continue;
    const cur = ensure(d);
    cur.leads += 1;
    if (d.status === "OPEN") cur.open += 1;
    else if (d.status === "LOST") cur.lost += 1;
  }

  for (const d of allDealsInArea) {
    if (!d.user_id || d.status !== "WON" || !d.won_at || !(d.value && d.value > 0)) continue;
    const wonDate = new Date(d.won_at);
    if (start && wonDate < start) continue;
    if (end && wonDate > end) continue;
    const cur = ensure(d);
    cur.won += 1;
    cur.revenue += convertValue(d.value, d.currency, currency, rate);
  }

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

export type AreaKpis = {
  leads: number;
  won: number;
  lost: number;
  open: number;
  revenue: number;
  convRate: number;
};

export function computeAreaKpis(
  allDealsInArea: Deal[],
  start: Date | null,
  end: Date | null,
  currency: "BRL" | "EUR",
  rate: number,
): AreaKpis {
  const sellers = rankSellers(allDealsInArea, start, end, currency, rate);
  const leads = sellers.reduce((s, x) => s + x.leads, 0);
  const won = sellers.reduce((s, x) => s + x.won, 0);
  const lost = sellers.reduce((s, x) => s + x.lost, 0);
  const open = sellers.reduce((s, x) => s + x.open, 0);
  const revenue = sellers.reduce((s, x) => s + x.revenue, 0);
  const closed = won + lost;
  return { leads, won, lost, open, revenue, convRate: closed > 0 ? won / closed : 0 };
}
