import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MetaKey = "meta_comercial_frontend" | "meta_comercial_ht_renov" | "meta_comercial_mas";

const YEAR = 2026;
const PERIODO = `${YEAR}-01-01`;

// Categoria mapping:
// - Frontend Comercial  = Mentoria (Gestor de Tráfego) + Formação Redes Sociais
// - HT + Renovações     = Accelerator + Renovações
// - MAS                 = Master and Scale
const CAT_FRONTEND = ["GESTOR_TRAFEGO", "REDES_SOCIAIS"];
const CAT_HT = ["ACCELERATOR", "RENOVACAO"];
const CAT_MAS = ["MASTER_SCALE"];

function bucketOf(cat: string | null): "frontend" | "ht" | "mas" | null {
  if (!cat) return null;
  if (CAT_FRONTEND.includes(cat)) return "frontend";
  if (CAT_HT.includes(cat)) return "ht";
  if (CAT_MAS.includes(cat)) return "mas";
  return null;
}

function normalizeFunnel(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toUpperCase();
  if (!s) return "SEM FUNIL";
  if (s.includes("SESSÃO ESTRAT") || s.includes("SESSAO ESTRAT")) return "Sessão Estratégica";
  if (s.startsWith("PIPELINE_COMERCIAL") || s.includes("COMERCIAL-V3") || s.includes("COMERCIAL V3")) return "Pipeline Comercial V3";
  if (s.startsWith("WGT")) return "WGT";
  if (s.startsWith("IGT")) return "IGT";
  if (s.startsWith("FGRS")) return "FGRS";
  if (s.startsWith("MINICURSO")) return "Minicurso";
  if (s.includes("MASTER AND SCALE") || s.includes("MAS_")) return "Master and Scale";
  if (s.includes("RENOVA")) return "Renovação";
  if (s.includes("PALESTRA")) return "Palestras";
  if (s.includes("FOLLOW")) return "Follow-up";
  if (s.includes("LISTA DE ESPERA")) return "Lista de Espera";
  return raw ?? "SEM FUNIL";
}

export type MetasComercialData = {
  year: number;
  metas: { frontend: number; ht: number; mas: number };
  realizado: { frontend: number; ht: number; mas: number };
  funnelBreakdown: Array<{
    funnel: string;
    frontend: number;
    ht: number;
    mas: number;
    total: number;
  }>;
};

export const getMetasComercialFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MetasComercialData> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Metas
    const { data: targets } = await supabaseAdmin
      .from("bi_targets")
      .select("indicador,valor")
      .eq("granularidade", "anual")
      .eq("periodo", PERIODO)
      .in("indicador", ["meta_comercial_frontend", "meta_comercial_ht_renov", "meta_comercial_mas"]);

    const metaMap = new Map<string, number>();
    (targets ?? []).forEach((t: any) => metaMap.set(t.indicador, Number(t.valor)));

    // Vendas do ano — contamos cada VENDA uma vez (installment_number = 1)
    const { data: sales } = await supabaseAdmin
      .from("manual_sales")
      .select("id,categoria_produto,funnel,installment_number,sale_date")
      .gte("sale_date", `${YEAR}-01-01`)
      .lte("sale_date", `${YEAR}-12-31`)
      .eq("installment_number", 1)
      .limit(20000);

    const rows = sales ?? [];
    const realizado = { frontend: 0, ht: 0, mas: 0 };
    const funnelMap = new Map<string, { frontend: number; ht: number; mas: number; total: number }>();

    for (const s of rows as any[]) {
      const bucket = bucketOf(s.categoria_produto);
      if (!bucket) continue;
      realizado[bucket] += 1;
      const fn = normalizeFunnel(s.funnel);
      const cur = funnelMap.get(fn) ?? { frontend: 0, ht: 0, mas: 0, total: 0 };
      cur[bucket] += 1;
      cur.total += 1;
      funnelMap.set(fn, cur);
    }

    const funnelBreakdown = Array.from(funnelMap.entries())
      .map(([funnel, v]) => ({ funnel, ...v }))
      .sort((a, b) => b.total - a.total);

    return {
      year: YEAR,
      metas: {
        frontend: metaMap.get("meta_comercial_frontend") ?? 1200,
        ht: metaMap.get("meta_comercial_ht_renov") ?? 360,
        mas: metaMap.get("meta_comercial_mas") ?? 180,
      },
      realizado,
      funnelBreakdown,
    };
  });

export const updateMetaComercialFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key: MetaKey; valor: number }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("bi_targets")
      .select("id")
      .eq("granularidade", "anual")
      .eq("periodo", PERIODO)
      .eq("indicador", data.key)
      .is("channel_id", null)
      .is("product_id", null)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from("bi_targets")
        .update({ valor: data.valor, fonte: "manual" })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("bi_targets").insert({
        granularidade: "anual",
        periodo: PERIODO,
        indicador: data.key,
        valor: data.valor,
        fonte: "manual",
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
