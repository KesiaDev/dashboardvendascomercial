import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/supabase-paging";
import { matchSellerProduct, type Deal, type SaleRecord, type SellerProductResult } from "@/lib/bi";

/**
 * Cruzamento vendedor × produto, agregado NO SERVIDOR.
 *
 * A tela tem 161 linhas de interface e baixava DUAS tabelas inteiras —
 * `clint_deals` e `sales` — para cruzá-las no navegador.
 *
 * O cruzamento é dirigido pelas VENDAS do período: para cada venda aprovada,
 * procura-se o negócio ganho do mesmo e-mail com `won_at` mais próximo. Logo o
 * conjunto exato de que se precisa é:
 *
 *   • as vendas aprovadas do período  (o que dirige o laço)
 *   • os negócios ganhos dos e-mails dessas vendas  (a tabela de consulta)
 *
 * Nem uma linha a mais. O resultado é idêntico ao de carregar tudo, porque a
 * função de cruzamento é a mesma de `bi.ts` — só mudou de lado.
 *
 * Os negócios NÃO são filtrados por período de propósito: uma venda de setembro
 * pode corresponder a um negócio ganho em agosto, e é justamente o `won_at`
 * mais próximo que decide o vínculo.
 */

const DEAL_COLS =
  "id,user_id,user_name,user_email,won_by_user_id,won_by_name,won_by_email,contact_email,status,value,currency,created_at,won_at,lost_at,lost_status_id,stage,stage_id,origin_id,origin_name";

const SALE_COLS =
  "transacao,produto_grupo,produto_original,status,data_venda,email_cliente,faturamento_liquido_brl,nome_afiliado";

export const fetchVendedorProdutoFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from: string | null; to: string | null }) => d)
  .handler(async ({ data }): Promise<SellerProductResult & { inactiveProducts: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const start = data.from ? new Date(data.from) : null;
    const end = data.to ? new Date(data.to) : null;

    const inPeriod = <Q>(q: Q) => {
      let out = q as any;
      if (data.from) out = out.gte("data_venda", data.from);
      if (data.to) out = out.lte("data_venda", data.to);
      return out;
    };

    // Produtos desativados são filtrados aqui, não no cliente — a tabela pode
    // não existir ainda (migration pendente), e nesse caso nada é filtrado,
    // que é o comportamento de hoje.
    const [sales, productConfig] = await Promise.all([
      fetchAllRows<SaleRecord>(
        ({ from, to }) => inPeriod(db.from("sales").select(SALE_COLS)).range(from, to),
        () => inPeriod(db.from("sales").select("*", { count: "exact", head: true })),
      ),
      db
        .from("bi_product_config")
        .select("product_id,ativo")
        .limit(2000)
        .then((r: any) => r)
        .catch(() => ({ data: [] })),
    ]);

    const inactive = new Set(
      ((productConfig?.data ?? []) as { product_id: string; ativo: boolean }[])
        .filter((p) => !p.ativo)
        .map((p) => p.product_id),
    );
    const activeSales =
      inactive.size === 0 ? sales : sales.filter((s) => !inactive.has(s.produto_grupo));

    // Só os negócios ganhos dos e-mails que aparecem nessas vendas.
    const emails = Array.from(
      new Set(
        activeSales
          .map((s) => s.email_cliente?.trim().toLowerCase())
          .filter((e): e is string => !!e),
      ),
    );
    const chunks: string[][] = [];
    for (let i = 0; i < emails.length; i += 200) chunks.push(emails.slice(i, i + 200));
    const dealPages = await Promise.all(
      chunks.map((c) =>
        db
          .from("clint_deals")
          .select(DEAL_COLS)
          .eq("status", "WON")
          .in("contact_email", c)
          // Um cliente pode ter vários negócios ganhos ao longo do tempo.
          .limit(c.length * 20),
      ),
    );
    const deals: Deal[] = [];
    for (const { data: rows } of dealPages) deals.push(...((rows ?? []) as Deal[]));

    return {
      ...matchSellerProduct(deals, activeSales, start, end),
      inactiveProducts: inactive.size,
    };
  });
