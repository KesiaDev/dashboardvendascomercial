import { createServerFn } from "@tanstack/react-start";
import { cleanSellerName, isExcludedSeller } from "@/lib/bi";

export type PerfRange = "day" | "week" | "month";

export type SellerPerf = {
  key: string;
  name: string;
  email: string;
  atendimentos: number;
  vendas: number;
  faturamento: number; // EUR (fonte de verdade: manual_sales.value_eur)
  taxaConversao: number;
  notaMedia: number | null;
  analisesCount: number;
};

export type PerfResult = {
  range: PerfRange;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  sellers: SellerPerf[];
  team: {
    atendimentos: number;
    vendas: number;
    faturamento: number;
    taxaConversao: number;
    notaMedia: number | null;
    analisesCount: number;
    vendedoresAtivos: number;
    leadsNovos: number;
    leadPorVenda: number | null;
    conversaoLead: number;
  };
  daily: { date: string; atendimentos: number; vendas: number; faturamento: number; leads: number }[];
};

// ─── Datas (referência: SEASON_START da planilha de fechamento) ─────────────
const SEASON_START = "2026-06-01"; // Segunda-feira, início da temporada
const MONTHS_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function todayBR(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function eachDay(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  let cur = startISO;
  while (cur <= endISO) { out.push(cur); cur = addDays(cur, 1); }
  return out;
}

/**
 * Calcula limites do período alinhados ao Fechamento Semanal:
 *  - day: dia corrente (fuso BR)
 *  - week: semana comercial (S{n}) baseada em SEASON_START, 7 dias
 *  - month: mês calendário corrente
 */
function rangeBounds(range: PerfRange): { startDate: string; endDate: string; label: string } {
  const today = todayBR();
  if (range === "day") {
    return { startDate: today, endDate: today, label: `Hoje (${today.slice(8)}/${today.slice(5,7)})` };
  }
  if (range === "week") {
    const season = new Date(SEASON_START + "T12:00:00Z");
    const now = new Date(today + "T12:00:00Z");
    const idx = Math.max(0, Math.floor((now.getTime() - season.getTime()) / (7 * 86_400_000)));
    const startDate = addDays(SEASON_START, idx * 7);
    const endDate = addDays(startDate, 6);
    return { startDate, endDate, label: `Semana S${idx + 1} (${startDate.slice(8)}/${startDate.slice(5,7)}–${endDate.slice(8)}/${endDate.slice(5,7)})` };
  }
  // month = calendário
  const [y, m] = today.split("-").map(Number);
  const startDate = `${y}-${String(m).padStart(2,"0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const endDate = `${y}-${String(m).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;
  return { startDate, endDate, label: `${MONTHS_PT[m-1]} ${y}` };
}

// Mapeia emails corporativos e variantes para o nome canônico — evita
// duplicar linhas do mesmo vendedor no ranking (ex.: "Gisele Gagliano" vs
// "giselegagliano@..." vs "Gisele Pimentel").
// Aliases → nome canônico. Cobre variantes de e-mail (com/sem ponto), locais
// (joaopessoa, gisele, gagliano, pimentel...) e o próprio nome escrito.
const SELLER_ALIASES: { match: string[]; name: string }[] = [
  { name: "João Pessoa",     match: ["joaopessoa", "joao pessoa", "joão pessoa"] },
  { name: "Gisele Pimentel", match: ["giselegagliano", "gisele gagliano", "gisele pimentel", "gisele"] },
  { name: "Fabio Nadal",     match: ["fabionadal", "fabio nadal", "nadal"] },
  { name: "Rita Bandeira",   match: ["ritabandeira", "rita bandeira", "rita"] },
  { name: "Luana Guimarães", match: ["luanaguimaraes", "luana.guimaraes", "luana guimaraes", "luana guimarães", "luana"] },
];

function canonicalFrom(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (!lower) return null;
  for (const { match, name } of SELLER_ALIASES) {
    for (const m of match) {
      if (lower === m || lower.includes(m)) return name;
    }
  }
  return null;
}

function normalizeSeller(raw: string | null | undefined): string {
  return canonicalFrom(raw) ?? (raw?.trim() || "—");
}

export const fetchPerformanceFn = createServerFn({ method: "POST" })
  .inputValidator((d: { range: PerfRange }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { startDate, endDate, label } = rangeBounds(data.range);

    // Timestamps para tabelas com coluna timestamptz
    const startTS = `${startDate}T00:00:00.000Z`;
    const endTS   = `${endDate}T23:59:59.999Z`;

    // 1. Vendas reais (fonte de verdade: manual_sales, EUR)
    const { data: sales } = await supabaseAdmin
      .from("manual_sales")
      .select("id,seller_name,value_eur,sale_date,created_by_email")
      .gte("sale_date", startDate)
      .lte("sale_date", endDate)
      .limit(10000);

    // 2. Conversas com atividade no período
    const { data: convs } = await supabaseAdmin
      .from("coach_conversations")
      .select("id,seller_email,seller_name,last_message_at")
      .gte("last_message_at", startTS)
      .lte("last_message_at", endTS)
      .limit(5000);

    // 3. Análises Coach IA (somente para conversas do período)
    const convIds = (convs ?? []).map((c: any) => c.id);
    let analyses: any[] = [];
    if (convIds.length) {
      const { data: a } = await supabaseAdmin
        .from("coach_analyses")
        .select("conversation_id,score_geral")
        .in("conversation_id", convIds)
        .eq("status", "ok");
      analyses = a ?? [];
    }
    const scoreByConv = new Map<string, number>();
    for (const a of analyses) if (a.score_geral != null) scoreByConv.set(a.conversation_id, a.score_geral);

    // Acumulador — chaveado por nome limpo do vendedor (manual_sales só tem name)
    type Acc = SellerPerf & { _scoreSum: number; _scoreN: number };
    const sellerMap = new Map<string, Acc>();
    const ensure = (email: string | null, name: string | null): Acc => {
      const canonical = canonicalFrom(email) ?? canonicalFrom(name);
      const cleaned = canonical ?? cleanSellerName(name ?? email ?? "—");
      const key = cleaned.toLowerCase();
      let cur = sellerMap.get(key);
      if (!cur) {
        cur = {
          key, name: cleaned, email: email ?? "",
          atendimentos: 0, vendas: 0, faturamento: 0,
          taxaConversao: 0, notaMedia: null, analisesCount: 0,
          _scoreSum: 0, _scoreN: 0,
        };
        sellerMap.set(key, cur);
      } else if (!cur.email && email) {
        cur.email = email;
      }
      return cur;
    };

    // Vendas (manual_sales)
    for (const s of sales ?? []) {
      if (!s.seller_name || isExcludedSeller(s.seller_name)) continue;
      const acc = ensure(null, s.seller_name);
      acc.vendas += 1;
      acc.faturamento += Number(s.value_eur ?? 0);
    }

    // Atendimentos + notas IA
    for (const c of convs ?? []) {
      if (!c.seller_email && !c.seller_name) continue;
      if (isExcludedSeller(c.seller_name)) continue;
      const acc = ensure(c.seller_email, c.seller_name);
      acc.atendimentos += 1;
      const sc = scoreByConv.get(c.id);
      if (sc != null) { acc._scoreSum += sc; acc._scoreN += 1; acc.analisesCount += 1; }
    }

    // Série diária (todos os dias do período — sem gaps)
    const dailyMap = new Map<string, { atendimentos: number; vendas: number; faturamento: number; leads: number }>();
    for (const day of eachDay(startDate, endDate)) {
      dailyMap.set(day, { atendimentos: 0, vendas: 0, faturamento: 0, leads: 0 });
    }
    for (const c of convs ?? []) {
      if (!c.last_message_at) continue;
      const k = new Date(c.last_message_at).toISOString().slice(0, 10);
      const cur = dailyMap.get(k); if (cur) cur.atendimentos += 1;
    }
    for (const s of sales ?? []) {
      if (!s.sale_date) continue;
      const cur = dailyMap.get(s.sale_date);
      if (cur) { cur.vendas += 1; cur.faturamento += Number(s.value_eur ?? 0); }
    }

    // Leads novos — Pipeline Comercial V3 (origin_name = PIPELINE_COMERCIAL-V3)
    const { data: leads } = await supabaseAdmin
      .from("clint_deals")
      .select("id,created_at")
      .eq("origin_name", "PIPELINE_COMERCIAL-V3")
      .gte("created_at", startTS)
      .lte("created_at", endTS)
      .limit(20000);
    let leadsNovos = 0;
    for (const l of leads ?? []) {
      if (!l.created_at) continue;
      leadsNovos += 1;
      const k = new Date(l.created_at).toISOString().slice(0, 10);
      const cur = dailyMap.get(k); if (cur) cur.leads += 1;
    }

    const sellers: SellerPerf[] = Array.from(sellerMap.values())
      .map((s) => ({
        key: s.key, name: s.name, email: s.email,
        atendimentos: s.atendimentos, vendas: s.vendas,
        faturamento: s.faturamento,
        taxaConversao: s.atendimentos > 0 ? s.vendas / s.atendimentos : 0,
        notaMedia: s._scoreN > 0 ? s._scoreSum / s._scoreN : null,
        analisesCount: s.analisesCount,
      }))
      .sort((a, b) => b.faturamento - a.faturamento || b.vendas - a.vendas);

    const teamAt = sellers.reduce((a, s) => a + s.atendimentos, 0);
    const teamVd = sellers.reduce((a, s) => a + s.vendas, 0);
    const teamFat = sellers.reduce((a, s) => a + s.faturamento, 0);
    const scoreN = sellers.reduce((a, s) => a + s.analisesCount, 0);
    const scoreSum = sellers.reduce((a, s) => a + (s.notaMedia != null ? s.notaMedia * s.analisesCount : 0), 0);

    const result: PerfResult = {
      range: data.range,
      periodStart: startDate,
      periodEnd: endDate,
      periodLabel: label,
      sellers,
      team: {
        atendimentos: teamAt, vendas: teamVd, faturamento: teamFat,
        taxaConversao: teamAt > 0 ? teamVd / teamAt : 0,
        notaMedia: scoreN > 0 ? scoreSum / scoreN : null,
        analisesCount: scoreN,
        vendedoresAtivos: sellers.filter((s) => s.atendimentos > 0 || s.vendas > 0).length,
        leadsNovos,
        leadPorVenda: teamVd > 0 ? leadsNovos / teamVd : null,
        conversaoLead: leadsNovos > 0 ? teamVd / leadsNovos : 0,
      },
      daily: Array.from(dailyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v })),
    };
    return result;
  });

export const generatePerformanceFeedbackFn = createServerFn({ method: "POST" })
  .inputValidator((d: { range: PerfRange; scope: "team" | "seller"; sellerKey?: string }) => d)
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");

    const perf = await fetchPerformanceFn({ data: { range: data.range } });
    const rangeLabel = perf.periodLabel;

    let ctx: any;
    let subject: string;
    if (data.scope === "seller" && data.sellerKey) {
      const s = perf.sellers.find((x) => x.key === data.sellerKey);
      if (!s) throw new Error("Vendedor não encontrado");
      subject = `vendedor ${s.name}`;
      ctx = { periodo: rangeLabel, vendedor: s, media_equipe: perf.team };
    } else {
      subject = "equipe comercial";
      ctx = { periodo: rangeLabel, equipe: perf.team, ranking: perf.sellers.slice(0, 10) };
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você é o Coach Comercial da LLMídia. Analise a performance abaixo e escreva um feedback em PT-BR, curto (máx 6 linhas), específico e acionável. " +
              "Use markdown com bullets. Destaque: (1) o que está funcionando, (2) o principal problema, (3) 1-2 ações concretas para os próximos dias. " +
              "Faturamento está em EUR (€). Nunca invente números — só use os dados fornecidos. Se atendimentos=0 ou vendas=0, diga isso claramente.",
          },
          { role: "user", content: `Feedback para ${subject} (${rangeLabel}):\n\n${JSON.stringify(ctx, null, 2)}` },
        ],
      }),
    });
    if (!resp.ok) {
      const b = await resp.text();
      throw new Error(`Lovable AI ${resp.status}: ${b}`);
    }
    const json = (await resp.json()) as any;
    const text = json?.choices?.[0]?.message?.content ?? "";
    return { text, perf };
  });
