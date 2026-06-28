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
  won_by_user_id: string | null;
  won_by_name: string | null;
  won_by_email: string | null;
  contact_email: string | null;
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

export type Period = "day" | "week" | "month" | "quarter" | "semester" | "year" | "all";

export function periodStart(p: Period): Date | null {
  if (p === "all") return null;
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === "day") return d;
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
        "id,user_id,user_name,user_email,won_by_user_id,won_by_name,won_by_email,contact_email,status,value,currency,created_at,won_at,lost_at,lost_status_id,stage,stage_id,origin_id,origin_name",
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

/**
 * Nomes excluídos de qualquer ranking/agregação por vendedor — pessoas que têm
 * negócios na Clint mas cujos resultados não devem ser expostos nos dashboards
 * (ex.: equipe interna, suporte). Comparação por nome normalizado (sem acento,
 * minúsculo, sem espaços duplicados) para resistir a variações de grafia.
 */
const EXCLUDED_SELLERS = new Set([
  "camila faria",
  "aline gonçalves",
  "késia nandi",
]);

export function isExcludedSeller(name: string | null | undefined): boolean {
  if (!name) return false;
  return EXCLUDED_SELLERS.has(name.toLowerCase().trim().replace(/\s+/g, " "));
}

/**
 * Quem deve levar o crédito pela venda: somente won_by (quem marcou o
 * negócio como ganho na Clint) — é o mesmo critério do relatório nativo
 * "Vendas por Vendedor" da Clint. Sem fallback para o responsável (user):
 * testamos e, sempre que won_by existe, ele já é idêntico ao responsável —
 * então um fallback nunca mudaria nada e só desalinharia do que aparece na
 * Clint. Negócios sem won_by (boa parte hoje) não são creditados a ninguém
 * aqui, mas continuam contando nos totais agregados (computeAreaKpis).
 */
export function effectiveWinner(d: Deal): { id: string; name: string; email: string } | null {
  if (!d.won_by_user_id) return null;
  return { id: d.won_by_user_id, name: d.won_by_name ?? d.won_by_email ?? "—", email: d.won_by_email ?? "" };
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
  phantomWonIds?: Set<string>,
): SellerStats[] {
  const map = new Map<string, SellerStats>();
  const ensure = (id: string, name: string, email: string): SellerStats => {
    let cur = map.get(id);
    if (!cur) {
      cur = { user_id: id, name, email, leads: 0, won: 0, lost: 0, open: 0, revenue: 0 };
      map.set(id, cur);
    }
    return cur;
  };

  // Leads recebidos: contam para quem o negócio está atribuído (user), não
  // para quem eventualmente vier a ganhá-lo.
  const createdInPeriod = filterByPeriodCreated(allDealsInArea, start, end);
  for (const d of createdInPeriod) {
    if (!d.user_id) continue;
    const cur = ensure(d.user_id, d.user_name ?? d.user_email ?? "—", d.user_email ?? "");
    cur.leads += 1;
    if (d.status === "OPEN") cur.open += 1;
    else if (d.status === "LOST") cur.lost += 1;
  }

  // Ganhos e faturamento: crédito para quem marcou como ganho (won_by),
  // com fallback para o responsável quando a Clint não registrou won_by.
  for (const d of allDealsInArea) {
    if (d.status !== "WON" || !d.won_at || !(d.value && d.value > 0)) continue;
    if (phantomWonIds?.has(d.id)) continue;
    const winner = effectiveWinner(d);
    if (!winner) continue;
    const wonDate = new Date(d.won_at);
    if (start && wonDate < start) continue;
    if (end && wonDate > end) continue;
    const cur = ensure(winner.id, winner.name, winner.email);
    cur.won += 1;
    cur.revenue += convertValue(d.value, d.currency, currency, rate);
  }

  return Array.from(map.values())
    .filter((s) => !isExcludedSeller(s.name))
    .sort((a, b) => b.revenue - a.revenue);
}

export type AreaKpis = {
  leads: number;
  won: number;
  lost: number;
  open: number;
  revenue: number;
  convRate: number;
};

/**
 * Totais da área: somam TODOS os negócios ganhos, mesmo os que não têm
 * won_by preenchido (diferente de rankSellers, que só credita quem tem
 * won_by). Isso evita que o faturamento total da empresa caia só porque
 * ninguém marcou explicitamente quem fechou aquele negócio na Clint.
 */
export function computeAreaKpis(
  allDealsInArea: Deal[],
  start: Date | null,
  end: Date | null,
  currency: "BRL" | "EUR",
  rate: number,
  phantomWonIds?: Set<string>,
): AreaKpis {
  let leads = 0;
  let lost = 0;
  let open = 0;
  for (const d of filterByPeriodCreated(allDealsInArea, start, end)) {
    if (!d.user_id || isExcludedSeller(d.user_name)) continue;
    leads += 1;
    if (d.status === "OPEN") open += 1;
    else if (d.status === "LOST") lost += 1;
  }

  let won = 0;
  let revenue = 0;
  for (const d of allDealsInArea) {
    if (d.status !== "WON" || !d.won_at || !(d.value && d.value > 0)) continue;
    if (phantomWonIds?.has(d.id)) continue;
    if (isExcludedSeller(d.user_name)) continue;
    const winner = effectiveWinner(d);
    if (winner && isExcludedSeller(winner.name)) continue;
    const wonDate = new Date(d.won_at);
    if (start && wonDate < start) continue;
    if (end && wonDate > end) continue;
    won += 1;
    revenue += convertValue(d.value, d.currency, currency, rate);
  }

  const closed = won + lost;
  return { leads, won, lost, open, revenue, convRate: closed > 0 ? won / closed : 0 };
}

// ── Cruzamento Clint x Hotmart (vendedor x produto) ─────────────────────────
// Não existe FK formal entre clint_deals e sales (Hotmart). O vínculo é feito
// por e-mail do cliente (contact_email <-> email_cliente) + data mais próxima
// entre won_at e data_venda, para o caso de o mesmo cliente ter mais de um
// negócio na Clint ao longo do tempo.

import { categorizeStatus } from "@/lib/product-groups";

export type SaleRecord = {
  transacao: string;
  produto_grupo: string;
  produto_original: string;
  status: string;
  data_venda: string | null;
  email_cliente: string | null;
  faturamento_liquido_brl: number | null;
  nome_afiliado: string | null;
};

/**
 * Vendedores conhecidos para casar com "Nome do Afiliado" da Hotmart — esse
 * campo vem do próprio link de afiliado de cada vendedor (ex.: "Gisele
 * Gagliano Pimentel", "FABIO NADAL GRIGOLO 08299996988"), então o nome bate
 * por tokens (primeiro+último nome), não por igualdade exata. É mais
 * confiável que o cruzamento por e-mail porque vem direto da Hotmart, sem
 * adivinhação de qual negócio da Clint corresponde à venda.
 */
const KNOWN_SELLERS = ["Gisele Pimentel", "Fabio Nadal", "João Pessoa", "Rita Bandeira", "Luana Guimarães"];

const ACCENT_MAP: Record<string, string> = {
  á: "a", à: "a", â: "a", ã: "a", ä: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  í: "i", ì: "i", î: "i", ï: "i",
  ó: "o", ò: "o", ô: "o", õ: "o", ö: "o",
  ú: "u", ù: "u", û: "u", ü: "u",
  ç: "c", ñ: "n",
};

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .split("")
    .map((ch) => ACCENT_MAP[ch] ?? ch)
    .join("");
}

function matchAffiliateToSeller(nomeAfiliado: string | null): string | null {
  if (!nomeAfiliado) return null;
  const normalized = normalizeName(nomeAfiliado);
  for (const seller of KNOWN_SELLERS) {
    const tokens = normalizeName(seller).split(/\s+/);
    if (tokens.every((t) => normalized.includes(t))) return seller;
  }
  return null;
}

function isResetRelacional(produtoOriginal: string): boolean {
  return produtoOriginal.toLowerCase().includes("reset relacional");
}

export async function fetchAllSales(): Promise<SaleRecord[]> {
  const all: SaleRecord[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("sales")
      .select("transacao,produto_grupo,produto_original,status,data_venda,email_cliente,faturamento_liquido_brl,nome_afiliado")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as SaleRecord[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/**
 * Identifica negócios WON na Clint cuja venda Hotmart correspondente foi
 * cancelada/reembolsada/reclamada depois — "ganho fantasma": a Clint nunca
 * foi atualizada manualmente, então o dashboard continua contando esse
 * faturamento. Casa por e-mail, escolhendo a venda com data_venda mais
 * próxima de won_at (mesmo critério de matchSellerProduct). Usado para
 * descontar visualmente sem alterar nada na Clint.
 */
export function findPhantomWonDeals(allDeals: Deal[], allSales: SaleRecord[]): Set<string> {
  const salesByEmail = new Map<string, SaleRecord[]>();
  for (const s of allSales) {
    if (isResetRelacional(s.produto_original)) continue;
    const email = s.email_cliente?.trim().toLowerCase();
    if (!email || !s.data_venda) continue;
    if (!salesByEmail.has(email)) salesByEmail.set(email, []);
    salesByEmail.get(email)!.push(s);
  }

  const phantoms = new Set<string>();
  for (const d of allDeals) {
    if (d.status !== "WON" || !d.won_at || !d.contact_email) continue;
    const email = d.contact_email.trim().toLowerCase();
    const candidates = salesByEmail.get(email);
    if (!candidates || candidates.length === 0) continue;

    const wonTime = new Date(d.won_at).getTime();
    const closest = candidates.reduce((best, cur) => {
      const bestDelta = Math.abs(new Date(best.data_venda!).getTime() - wonTime);
      const curDelta = Math.abs(new Date(cur.data_venda!).getTime() - wonTime);
      return curDelta < bestDelta ? cur : best;
    });

    if (categorizeStatus(closest.status) !== "aprovado") {
      phantoms.add(d.id);
    }
  }
  return phantoms;
}

export type SellerProductRow = {
  seller: string;
  produto_grupo: string;
  vendas: number;
  faturamento: number;
};

export type SellerProductResult = {
  rows: SellerProductRow[];
  matched: number;
  unmatched: number;
  unmatchedRevenue: number;
};

/**
 * Atribui cada venda da Hotmart a um vendedor. Prioriza o "Nome do Afiliado"
 * do próprio export Hotmart — é o link de afiliado de cada vendedor, dado
 * direto pela Hotmart, sem nenhuma adivinhação. Só recorre ao cruzamento por
 * e-mail com negócio ganho na Clint (com mesmo critério de tie-break:
 * won_at mais próximo de data_venda) quando o afiliado é a empresa/vazio.
 * Exclui linhas "Reset Relacional" (não é produto vendido, é evento de CRM).
 */
export function matchSellerProduct(
  allDeals: Deal[],
  allSales: SaleRecord[],
  start: Date | null = null,
  end: Date | null = null,
): SellerProductResult {
  const dealsByEmail = new Map<string, Deal[]>();
  for (const d of allDeals) {
    if (d.status !== "WON" || !effectiveWinner(d)) continue;
    const email = d.contact_email?.trim().toLowerCase();
    if (!email) continue;
    if (!dealsByEmail.has(email)) dealsByEmail.set(email, []);
    dealsByEmail.get(email)!.push(d);
  }

  const agg = new Map<string, SellerProductRow>();
  let matched = 0;
  let unmatched = 0;
  let unmatchedRevenue = 0;

  for (const s of allSales) {
    if (isResetRelacional(s.produto_original)) continue;
    // sales.status guarda o valor bruto do export Hotmart ("Completo",
    // "Aprovado", "Cancelado"...) — normaliza com a mesma função usada no
    // dashboard financeiro (/) em vez de comparar string literal.
    if (categorizeStatus(s.status) !== "aprovado") continue;
    if (s.data_venda) {
      const saleDate = new Date(s.data_venda);
      if (start && saleDate < start) continue;
      if (end && saleDate > end) continue;
    } else if (start) {
      continue;
    }

    const affiliateSeller = matchAffiliateToSeller(s.nome_afiliado);
    if (affiliateSeller) {
      const key = `${affiliateSeller}::${s.produto_grupo}`;
      const cur = agg.get(key) ?? { seller: affiliateSeller, produto_grupo: s.produto_grupo, vendas: 0, faturamento: 0 };
      cur.vendas += 1;
      cur.faturamento += s.faturamento_liquido_brl ?? 0;
      agg.set(key, cur);
      matched += 1;
      continue;
    }

    const email = s.email_cliente?.trim().toLowerCase();
    const candidates = email ? dealsByEmail.get(email) : undefined;
    if (!candidates || candidates.length === 0) {
      unmatched += 1;
      unmatchedRevenue += s.faturamento_liquido_brl ?? 0;
      continue;
    }
    let best = candidates[0];
    if (candidates.length > 1 && s.data_venda) {
      const saleTime = new Date(s.data_venda).getTime();
      best = candidates.reduce((closest, cur) => {
        const closestDelta = closest.won_at ? Math.abs(new Date(closest.won_at).getTime() - saleTime) : Infinity;
        const curDelta = cur.won_at ? Math.abs(new Date(cur.won_at).getTime() - saleTime) : Infinity;
        return curDelta < closestDelta ? cur : closest;
      }, best);
    }

    const seller = effectiveWinner(best)!.name.trim();
    const key = `${seller}::${s.produto_grupo}`;
    const cur = agg.get(key) ?? { seller, produto_grupo: s.produto_grupo, vendas: 0, faturamento: 0 };
    cur.vendas += 1;
    cur.faturamento += s.faturamento_liquido_brl ?? 0;
    agg.set(key, cur);
    matched += 1;
  }

  return {
    rows: Array.from(agg.values())
      .filter((r) => !isExcludedSeller(r.seller))
      .sort((a, b) => b.faturamento - a.faturamento),
    matched,
    unmatched,
    unmatchedRevenue,
  };
}
