import { createServerFn } from "@tanstack/react-start";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type ConversaoRow = {
  funnel: string;
  seller: string;
  leads: number;
  won: number;
  lost: number;
  open: number;
  valueWon: number;
};

const PAGE = 1000;

async function pagedDeals(db: any, column: string, from: string, to: string) {
  const rows: any[] = [];
  for (let page = 0; page < 30; page++) {
    const { data, error } = await db
      .from("clint_deals")
      .select("id,origin_name,user_name,won_by_name,status,value,currency,created_at,won_at,lost_at")
      .gte(column, `${from}T00:00:00Z`)
      .lte(column, `${to}T23:59:59Z`)
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

/**
 * Conversão por vendedor × funil (pipeline da Clint) dentro de um período.
 * - leads: negócios criados no período
 * - won/lost: negócios ganhos/perdidos no período (data do evento)
 * - conversão: won / (won + lost)
 */
export const fetchConversaoFunilFn = createServerFn({ method: "GET" })
  .inputValidator((d: { from: string; to: string }) => d)
  .handler(async ({ data }): Promise<ConversaoRow[]> => {
    const db = await admin();
    const [created, wonRows, lostRows] = await Promise.all([
      pagedDeals(db, "created_at", data.from, data.to),
      pagedDeals(db, "won_at", data.from, data.to),
      pagedDeals(db, "lost_at", data.from, data.to),
    ]);

    const map = new Map<string, ConversaoRow>();
    const key = (funnel: string, seller: string) => `${funnel}||${seller}`;
    const get = (funnelRaw: string | null, sellerRaw: string | null) => {
      const funnel = (funnelRaw || "").trim() || "— sem funil —";
      const seller = (sellerRaw || "").trim() || "— sem vendedor —";
      const k = key(funnel, seller);
      let row = map.get(k);
      if (!row) {
        row = { funnel, seller, leads: 0, won: 0, lost: 0, open: 0, valueWon: 0 };
        map.set(k, row);
      }
      return row;
    };

    for (const d of created) {
      const row = get(d.origin_name, d.user_name);
      row.leads++;
      if (d.status === "OPEN") row.open++;
    }
    for (const d of wonRows) {
      if (d.status !== "WON") continue;
      const row = get(d.origin_name, d.won_by_name || d.user_name);
      row.won++;
      row.valueWon += Number(d.value ?? 0);
    }
    for (const d of lostRows) {
      if (d.status !== "LOST") continue;
      const row = get(d.origin_name, d.user_name);
      row.lost++;
    }

    return Array.from(map.values()).filter((r) => r.leads + r.won + r.lost > 0);
  });
