import { createServerFn } from "@tanstack/react-start";

function monthBounds(monthsAgo: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 1);
  return { start, end };
}

function aggregate(
  deals: { user_name: string | null; user_email: string | null; status: string | null; value: number | null; won_at: string | null; lost_at: string | null }[],
  start: Date,
  end: Date,
) {
  const bySeller = new Map<string, { won: number; lost: number; revenue: number }>();
  let won = 0;
  let lost = 0;
  let revenue = 0;
  for (const d of deals) {
    const status = (d.status ?? "").toUpperCase();
    if (status === "WON" && d.won_at) {
      const wonAt = new Date(d.won_at);
      if (wonAt < start || wonAt >= end) continue;
      if (!(d.value && d.value > 0)) continue;
      const name = d.user_name?.trim() ?? d.user_email ?? "Sem vendedor";
      const cur = bySeller.get(name) ?? { won: 0, lost: 0, revenue: 0 };
      cur.won += 1;
      cur.revenue += Number(d.value ?? 0);
      bySeller.set(name, cur);
      won += 1;
      revenue += Number(d.value ?? 0);
    } else if (status === "LOST" && d.lost_at) {
      const lostAt = new Date(d.lost_at);
      if (lostAt < start || lostAt >= end) continue;
      const name = d.user_name?.trim() ?? d.user_email ?? "Sem vendedor";
      const cur = bySeller.get(name) ?? { won: 0, lost: 0, revenue: 0 };
      cur.lost += 1;
      bySeller.set(name, cur);
      lost += 1;
    }
  }
  const sellers = Array.from(bySeller.entries())
    .map(([name, s]) => ({
      name,
      ganhos: s.won,
      perdidos: s.lost,
      faturamento: Number(s.revenue.toFixed(2)),
      taxa_conversao_pct: s.won + s.lost > 0 ? Number(((s.won / (s.won + s.lost)) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.faturamento - a.faturamento);
  return {
    ganhos: won,
    perdidos: lost,
    faturamento: Number(revenue.toFixed(2)),
    taxa_conversao_pct: won + lost > 0 ? Number(((won / (won + lost)) * 100).toFixed(1)) : 0,
    vendedores: sellers,
  };
}

export const askAgent = createServerFn({ method: "POST" })
  .inputValidator((d: { messages: { role: "user" | "assistant"; content: string }[] }) => d)
  .handler(async ({ data }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Restringe à área COMERCIAL (via dicionário de pipelines) para não
    // misturar com automações de marketing/implantação/financeiro.
    const { data: areaRows } = await supabaseAdmin
      .from("bi_pipeline_areas")
      .select("pipeline_id")
      .eq("area", "COMERCIAL")
      .eq("ativo", true);
    const comercialIds = (areaRows ?? []).map((r) => r.pipeline_id);

    const sinceCurrent = monthBounds(0).start;
    const sincePrev = monthBounds(1).start;

    let query = supabaseAdmin
      .from("clint_deals")
      .select("user_name, user_email, status, value, origin_name, won_at, lost_at, created_at, origin_id")
      .gte("created_at", sincePrev.toISOString())
      .limit(20000);
    if (comercialIds.length) query = query.in("origin_id", comercialIds);
    const { data: deals, error } = await query;
    if (error) throw error;

    const { start: curStart, end: curEnd } = monthBounds(0);
    const { start: prevStart, end: prevEnd } = monthBounds(1);
    const current = aggregate(deals ?? [], curStart, curEnd);
    const previous = aggregate(deals ?? [], prevStart, prevEnd);

    const deltaConv = current.taxa_conversao_pct - previous.taxa_conversao_pct;
    const deltaFaturamento =
      previous.faturamento > 0
        ? Number((((current.faturamento - previous.faturamento) / previous.faturamento) * 100).toFixed(1))
        : null;

    const context = {
      area: "COMERCIAL",
      mes_atual: current,
      mes_anterior: previous,
      variacao_conversao_pontos: Number(deltaConv.toFixed(1)),
      variacao_faturamento_pct: deltaFaturamento,
    };

    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });

    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system:
        "Você é o Agente Comercial da LLMídia, um analista de inteligência comercial — não um leitor de planilha.\n\n" +
        "REGRAS:\n" +
        "1. Nunca apenas liste números. Interprete: compare com o mês anterior, aponte quem está se destacando ou caindo, e diga ONDE agir.\n" +
        '2. Em vez de "conversão 18%", diga algo como "a conversão caiu 6 pontos em relação ao mês anterior" — sempre cite a variação quando ela existir nos dados.\n' +
        "3. Destaque o vendedor com melhor e pior desempenho, e formule uma hipótese sobre o porquê quando possível.\n" +
        "4. Seja direto, em português, sem rodeios nem disclaimers. Frases curtas e factuais.\n" +
        "5. Os números vêm exclusivamente da área COMERCIAL (pipelines reais de vendas — automações de marketing já foram excluídas).\n\n" +
        "Dados (mês atual vs mês anterior):\n" +
        JSON.stringify(context, null, 2),
      messages: data.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const text = resp.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    return { reply: text, context_summary: { vendedores: current.vendedores.length, ganhos_mes: current.ganhos } };
  });
