import { createServerFn } from "@tanstack/react-start";
import { fetchProductConfigFn } from "@/lib/data.functions";

export type ProductConfig = {
  product_id: string;
  label: string;
  ativo: boolean;
  categoria: string;
  produto_pai_id: string | null;
};

// RLS de bi_product_config é restrita a service_role (mesma política aplicada
// a todas as outras tabelas) — leitura precisa passar por server function.
export async function fetchProductConfig(): Promise<ProductConfig[]> {
  return (await fetchProductConfigFn()) as ProductConfig[];
}

/**
 * Garante que todo produto conhecido em PRODUCT_GROUPS tenha uma linha em
 * bi_product_config. label/categoria/produto_pai_id sempre refletem o código
 * (fonte da verdade da taxonomia) — só o "ativo" já definido manualmente na
 * tela /areas é preservado entre syncs.
 */
export const syncProductConfig = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { PRODUCT_GROUPS } = await import("@/lib/product-groups");

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from("bi_product_config")
    .select("product_id,ativo");
  if (fetchErr) throw fetchErr;
  const ativoById = new Map((existing ?? []).map((r) => [r.product_id, r.ativo]));

  const rows = PRODUCT_GROUPS.map((g) => ({
    product_id: g.id,
    label: g.label,
    categoria: g.categoria,
    produto_pai_id: g.parentId,
    ativo: ativoById.get(g.id) ?? true,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin.from("bi_product_config").upsert(rows, { onConflict: "product_id" });
  if (error) throw error;
  return { synced: rows.length };
});

export const setProductActive = createServerFn({ method: "POST" })
  .inputValidator((d: { productId: string; ativo: boolean }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("bi_product_config")
      .update({ ativo: data.ativo, updated_at: new Date().toISOString() })
      .eq("product_id", data.productId);
    if (error) throw error;
    return { ok: true };
  });
