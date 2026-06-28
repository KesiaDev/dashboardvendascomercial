import { createServerFn } from "@tanstack/react-start";

export const askAgent = createServerFn({ method: "POST" })
  .inputValidator((d: { messages: { role: "user" | "assistant"; content: string }[] }) => d)
  .handler(async ({ data }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Agrega últimos 30 dias da clint_deals
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: deals, error } = await supabaseAdmin
      .from("clint_deals")
      .select("user_name, user_email, status, value, origin_name, stage, won_at, lost_at, created_at")
      .gte("created_at", since)
      .limit(5000);
    if (error) throw error;

    const bySeller = new Map<string, { won: number; lost: number; open: number; wonValue: number; total: number }>();
    let totalDeals = 0,
      wonDeals = 0,
      lostDeals = 0,
      totalWonValue = 0;
    for (const d of deals ?? []) {
      const name = d.user_name ?? d.user_email ?? "Sem vendedor";
      const cur = bySeller.get(name) ?? { won: 0, lost: 0, open: 0, wonValue: 0, total: 0 };
      cur.total += 1;
      totalDeals += 1;
      const status = (d.status ?? "").toUpperCase();
      if (status === "WON") {
        cur.won += 1;
        wonDeals += 1;
        cur.wonValue += Number(d.value ?? 0);
        totalWonValue += Number(d.value ?? 0);
      } else if (status === "LOST") {
        cur.lost += 1;
        lostDeals += 1;
      } else {
        cur.open += 1;
      }
      bySeller.set(name, cur);
    }
    const sellers = Array.from(bySeller.entries())
      .map(([name, s]) => ({
        name,
        ...s,
        conversao: s.total > 0 ? Number(((s.won / s.total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.wonValue - a.wonValue);

    const context = {
      periodo_dias: 30,
      total_deals: totalDeals,
      ganhos: wonDeals,
      perdidos: lostDeals,
      faturamento_ganho: Number(totalWonValue.toFixed(2)),
      taxa_conversao_geral: totalDeals > 0 ? Number(((wonDeals / totalDeals) * 100).toFixed(1)) : 0,
      vendedores: sellers,
    };

    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });

    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system:
        "Você é o Agente Comercial da LLMídia. Analise os dados de vendas da Clint CRM e responda perguntas sobre performance por vendedor, tendências de conversão e oportunidades de melhoria. Seja direto e use os números reais dos dados.\n\nDados (últimos 30 dias):\n" +
        JSON.stringify(context, null, 2),
      messages: data.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const text = resp.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    return { reply: text, context_summary: { vendedores: sellers.length, deals: totalDeals } };
  });
