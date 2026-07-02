import { createServerFn } from "@tanstack/react-start";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type SaleResultado = {
  produto_grupo: string;
  produto_original: string | null;
  status: string;
  data_venda: string | null;
  faturamento_liquido_brl: number | null;
  nome_afiliado: string | null;
  origem_checkout: string | null;
};

export const fetchSalesResultadosFn = createServerFn({ method: "GET" })
  .inputValidator((d: { year: number }) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const from = `${data.year}-01-01`;
    const to = `${data.year}-12-31`;
    const pageSize = 1000;
    const { count, error: countError } = await db
      .from("sales")
      .select("*", { count: "exact", head: true })
      .gte("data_venda", from)
      .lte("data_venda", to);
    if (countError) throw new Error(countError.message);
    const total = count ?? 0;
    if (total === 0) return [] as SaleResultado[];
    const pages = Math.ceil(total / pageSize);
    const results = await Promise.all(
      Array.from({ length: pages }, (_, i) => {
        const offset = i * pageSize;
        return db
          .from("sales")
          .select(
            "produto_grupo,produto_original,status,data_venda,faturamento_liquido_brl,nome_afiliado,origem_checkout",
          )
          .gte("data_venda", from)
          .lte("data_venda", to)
          .range(offset, offset + pageSize - 1);
      }),
    );
    const all: SaleResultado[] = [];
    for (const { data: rows, error } of results) {
      if (error) throw new Error(error.message);
      all.push(...(rows as SaleResultado[]));
    }
    return all;
  });
