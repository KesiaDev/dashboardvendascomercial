import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

export type ProductConfig = { product_id: string; label: string; ativo: boolean };

export async function fetchProductConfig(): Promise<ProductConfig[]> {
  const { data, error } = await supabase
    .from("bi_product_config")
    .select("product_id,label,ativo")
    .order("label");
  if (error) throw error;
  return (data ?? []) as ProductConfig[];
}

/**
 * Garante que todo produto conhecido em PRODUCT_GROUPS tenha uma linha em
 * bi_product_config. Usa ignoreDuplicates para nunca sobrescrever um "ativo"
 * já definido manualmente na tela /areas — só preenche produtos novos.
 */
export const syncProductConfig = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { PRODUCT_GROUPS } = await import("@/lib/product-groups");

  const rows = PRODUCT_GROUPS.map((g) => ({
    product_id: g.id,
    label: g.label,
    ativo: true,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from("bi_product_config")
    .upsert(rows, { onConflict: "product_id", ignoreDuplicates: true });
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
