import { createServerFn } from "@tanstack/react-start";
import { cleanSellerName, isExcludedSeller } from "@/lib/bi";

export type PerfRange = "day" | "week" | "month";

export type SellerPerf = {
  key: string; // normalized email or name
  name: string;
  email: string;
  atendimentos: number; // conversas com msgs no período
  vendas: number;
  faturamento: number; // BRL bruto
  taxaConversao: number; // vendas / atendimentos
  notaMedia: number | null;
  analisesCount: number;
};

export type PerfResult = {
  range: PerfRange;
  periodStart: string;
  periodEnd: string;
  sellers: SellerPerf[];
  team: {
    atendimentos: number;
    vendas: number;
    faturamento: number;
    taxaConversao: number;
    notaMedia: number | null;
    analisesCount: number;
    vendedoresAtivos: number;
  };
  daily: { date: string; atendimentos: number; vendas: number }[];
};

function rangeBounds(range: PerfRange): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  if (range === "day") {
    start.setHours(0, 0, 0, 0);
  } else if (range === "week") {
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
  }
  return { start, end };
}

function normKey(email?: string | null, name?: string | null): string {
  if (email) return email.trim().toLowerCase();
  if (name) return cleanSellerName(name).toLowerCase();
  return "—";
}

export const fetchPerformanceFn = createServerFn({ method: "POST" })
  .inputValidator((d: { range: PerfRange }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { start, end } = rangeBounds(data.range);
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    // 1. Deals ganhos no período
    const { data: deals } = await supabaseAdmin
      .from("clint_deals")
      .select("id,user_name,user_email,won_by_user_name,won_by_user_email,status,won_at,value,currency")
      .eq("status", "WON")
      .gte("won_at", startISO)
      .lte("won_at", endISO)
      .limit(5000);

    // 2. Conversas com atividade no período
    const { data: convs } = await supabaseAdmin
      .from("coach_conversations")
      .select("id,seller_email,seller_name,last_message_at")
      .gte("last_message_at", startISO)
      .lte("last_message_at", endISO)
      .limit(5000);

    // 3. Análises Coach IA no período
    const convIds = (convs ?? []).map((c: any) => c.id);
    let analyses: any[] = [];
    if (convIds.length) {
      const { data: a } = await supabaseAdmin
        .from("coach_analyses")
        .select("conversation_id,score_geral,analyzed_at")
        .in("conversation_id", convIds)
        .eq("status", "ok");
      analyses = a ?? [];
    }
    const scoreByConv = new Map<string, number>();
    for (const a of analyses) if (a.score_geral != null) scoreByConv.set(a.conversation_id, a.score_geral);

    const sellerMap = new Map<string, SellerPerf & { _scoreSum: number; _scoreN: number }>();
    const ensure = (email: string | null, name: string | null): SellerPerf & { _scoreSum: number; _scoreN: number } => {
      const key = normKey(email, name);
      let cur = sellerMap.get(key);
      if (!cur) {
        const cleaned = cleanSellerName(name ?? email ?? "—");
        cur = {
          key, name: cleaned, email: email ?? "",
          atendimentos: 0, vendas: 0, faturamento: 0,
          taxaConversao: 0, notaMedia: null, analisesCount: 0,
          _scoreSum: 0, _scoreN: 0,
        };
        sellerMap.set(key, cur);
      }
      return cur;
    };

    // Atendimentos + análises
    for (const c of convs ?? []) {
      if (!c.seller_email && !c.seller_name) continue;
      if (isExcludedSeller(c.seller_name)) continue;
      const s = ensure(c.seller_email, c.seller_name);
      s.atendimentos += 1;
      const sc = scoreByConv.get(c.id);
      if (sc != null) { s._scoreSum += sc; s._scoreN += 1; s.analisesCount += 1; }
    }

    // Vendas ganhas
    for (const d of deals ?? []) {
      const email = d.won_by_user_email ?? d.user_email;
      const name = d.won_by_user_name ?? d.user_name;
      if (!email && !name) continue;
      if (isExcludedSeller(name)) continue;
      const s = ensure(email, name);
      s.vendas += 1;
      s.faturamento += Number(d.value ?? 0);
    }

    // Daily series (semana/mês)
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const daily = new Map<string, { atendimentos: number; vendas: number }>();
    const totalDays = data.range === "day" ? 1 : data.range === "week" ? 7 : 30;
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      daily.set(dayKey(d), { atendimentos: 0, vendas: 0 });
    }
    for (const c of convs ?? []) {
      if (!c.last_message_at) continue;
      const k = dayKey(new Date(c.last_message_at));
      const cur = daily.get(k); if (cur) cur.atendimentos += 1;
    }
    for (const d of deals ?? []) {
      if (!d.won_at) continue;
      const k = dayKey(new Date(d.won_at));
      const cur = daily.get(k); if (cur) cur.vendas += 1;
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
      periodStart: startISO,
      periodEnd: endISO,
      sellers,
      team: {
        atendimentos: teamAt, vendas: teamVd, faturamento: teamFat,
        taxaConversao: teamAt > 0 ? teamVd / teamAt : 0,
        notaMedia: scoreN > 0 ? scoreSum / scoreN : null,
        analisesCount: scoreN,
        vendedoresAtivos: sellers.filter((s) => s.atendimentos > 0 || s.vendas > 0).length,
      },
      daily: Array.from(daily.entries())
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
    const rangeLabel = data.range === "day" ? "hoje" : data.range === "week" ? "últimos 7 dias" : "últimos 30 dias";

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
              "Nunca invente números — só use os dados fornecidos. Se atendimentos=0 ou vendas=0, diga isso claramente.",
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
