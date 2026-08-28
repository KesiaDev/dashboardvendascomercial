import { createServerFn } from "@tanstack/react-start";


export type ConversaoRow = {
  funnel: string;
  seller: string;
  leads: number;
  lost: number;
  /** Vendas do fechamento (manual_sales) — fonte de verdade de "ganho". */
  vendas: number;
  valor: number;
};

/**
 * Conversão por vendedor × funil.
 * - leads / perdidos: negócios da Clint no período
 * - vendas / valor: fechamento manual dos vendedores (manual_sales, 1ª parcela)
 */
export const fetchConversaoFunilFn = createServerFn({ method: "GET" })
  .inputValidator((d: { from: string; to: string }) => d)
  .handler(async ({ data }): Promise<ConversaoRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      pagedDeals,
      fetchManualSales,
      canonicalFunnel,
      canonicalSellerName,
      FUNIS_VENDEDOR,
      isVendedorExcluido,
      isComercialDeal,
      funnelVisibleInPeriod,
    } = await import("@/lib/conversao-funil.server");


    const [created, lostRows, sales] = await Promise.all([
      pagedDeals(supabaseAdmin, "created_at", data.from, data.to),
      pagedDeals(supabaseAdmin, "lost_at", data.from, data.to),
      fetchManualSales(supabaseAdmin, data.from, data.to),
    ]);

    const map = new Map<string, ConversaoRow>();
    const get = (funnelRaw: string | null, sellerRaw: string | null) => {
      const funnel = canonicalFunnel(funnelRaw);
      const seller = canonicalSellerName(sellerRaw);
      const k = `${funnel}||${seller}`;
      let row = map.get(k);
      if (!row) {
        row = { funnel, seller, leads: 0, lost: 0, vendas: 0, valor: 0 };
        map.set(k, row);
      }
      return row;
    };

    for (const d of created as any[]) {
      if (!isComercialDeal(d.origin_name, d.stage)) continue;
      get(d.origin_name, d.user_name).leads++;
    }
    for (const d of lostRows as any[]) {
      if (d.status !== "LOST") continue;
      if (!isComercialDeal(d.origin_name, d.stage)) continue;
      get(d.origin_name, d.user_name).lost++;
    }
    for (const s of sales as any[]) {
      const row = get(s.funnel, s.seller_name);
      row.vendas++;
      row.valor += Number(s.value_eur ?? 0);
    }


    return Array.from(map.values()).filter(
      (r) =>
        FUNIS_VENDEDOR.has(r.funnel) &&
        funnelVisibleInPeriod(r.funnel, data.to) &&
        !isVendedorExcluido(r.seller) &&
        r.leads + r.lost + r.vendas > 0,
    );
  });
