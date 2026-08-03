import { createServerFn } from "@tanstack/react-start";

export const TAG_FILTER_OPTIONS = [
  { value: "", label: "Todas as origens" },
  { value: "ebook", label: "Ebook" },
  { value: "minicurso", label: "Minicurso" },
  { value: "wgt", label: "WGT Perpétuo" },
  { value: "igt", label: "IGT" },
  { value: "palavras", label: "Palavras" },
] as const;

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
 * - leads / perdidos: negócios da Clint no período (filtráveis por tag de contato)
 * - vendas / valor: fechamento manual dos vendedores (manual_sales, 1ª parcela)
 */
export const fetchConversaoFunilFn = createServerFn({ method: "GET" })
  .inputValidator((d: { from: string; to: string; tagFilter?: string }) => d)
  .handler(async ({ data }): Promise<ConversaoRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      pagedDeals,
      fetchManualSales,
      canonicalFunnel,
      canonicalSellerName,
      FUNIS_VENDEDOR,
      isVendedorExcluido,
      dealMatchesTagFilter,
    } = await import("@/lib/conversao-funil.server");

    const tagFilter = data.tagFilter ?? "";

    const [created, lostRows, sales] = await Promise.all([
      pagedDeals(supabaseAdmin, "created_at", data.from, data.to),
      pagedDeals(supabaseAdmin, "lost_at", data.from, data.to),
      fetchManualSales(supabaseAdmin, data.from, data.to),
    ]);

    const filteredCreated = tagFilter
      ? (created as any[]).filter((d) => dealMatchesTagFilter(d.contact_tags ?? [], tagFilter))
      : (created as any[]);
    const filteredLost = tagFilter
      ? (lostRows as any[]).filter((d) => dealMatchesTagFilter(d.contact_tags ?? [], tagFilter))
      : (lostRows as any[]);

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

    for (const d of filteredCreated) get(d.origin_name, d.user_name).leads++;
    for (const d of filteredLost) {
      if (d.status !== "LOST") continue;
      get(d.origin_name, d.user_name).lost++;
    }
    // vendas/valor não são filtráveis por tag (manual_sales não tem contact_tags)
    if (!tagFilter) {
      for (const s of sales as any[]) {
        const row = get(s.funnel, s.seller_name);
        row.vendas++;
        row.valor += Number(s.value_eur ?? 0);
      }
    }

    return Array.from(map.values()).filter(
      (r) =>
        FUNIS_VENDEDOR.has(r.funnel) &&
        !isVendedorExcluido(r.seller) &&
        r.leads + r.lost + r.vendas > 0,
    );
  });
