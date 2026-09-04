import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/authz.server";
import { parseWiseTab, type WiseSheetRow } from "@/lib/wise-sheet";
import { fetchAllRows } from "@/lib/supabase-paging";

// Planilha "Wise recebimentos" (Google Sheets) — fonte oficial dos recebimentos em EUR.
const SPREADSHEET_ID = "1tpjc0UiXhmQKzZPP58hep9EqLCKfDXIl4gjRkB7qI5E";
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function gatewayHeaders() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!lovableKey || !connKey) {
    throw new Error("Conexão com o Google Sheets não configurada no projeto.");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connKey,
  };
}

async function gatewayGet(path: string) {
  const res = await fetch(`${GATEWAY}${path}`, { headers: gatewayHeaders() });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Google Sheets gateway ${res.status}: ${body}`);
    throw new Error(`Falha ao ler a planilha [${res.status}]: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<any>;
}

/** Lista as abas da planilha Wise (uma por mês). */
export const listWiseSheetTabsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context.claims);
    const meta = await gatewayGet(
      `/spreadsheets/${SPREADSHEET_ID}?fields=properties.title,sheets.properties.title`,
    );
    const tabs: string[] = (meta.sheets ?? [])
      .map((s: any) => s?.properties?.title as string)
      .filter(Boolean);
    return { title: meta?.properties?.title ?? "Wise", tabs };
  });

/**
 * Sincroniza a planilha Wise para bi_wise_payments.
 * Idempotente: reescreve as linhas de origem "google_sheets" de cada aba,
 * preservando vendedor e período já atribuídos manualmente.
 */
export const syncWiseSheetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tabs?: string[] } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    assertAdmin(context.claims);
    const db = await admin();

    let tabs = data.tabs;
    if (!tabs || tabs.length === 0) {
      const meta = await gatewayGet(
        `/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties.title`,
      );
      tabs = (meta.sheets ?? [])
        .map((s: any) => s?.properties?.title as string)
        .filter((t: string) => !!t && !/hotmart/i.test(t));
    }

    const rangeParams = tabs!.map((t) => `ranges=${encodeURIComponent(`${t}!A1:F1000`)}`).join("&");
    const batch = await gatewayGet(
      `/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${rangeParams}`,
    );

    const parsed: WiseSheetRow[] = [];
    (batch.valueRanges ?? []).forEach((vr: any, i: number) => {
      const tabName = tabs![i];
      parsed.push(...parseWiseTab(tabName, (vr.values ?? []) as string[][]));
    });

    if (parsed.length === 0) return { imported: 0, tabs: tabs!.length, inadimplentes: 0 };

    // Preserva atribuições manuais (vendedor / período) já feitas no dashboard.
    // Truncar AQUI é destrutivo: o que não vier nesta leitura é tratado como
    // "não existia", e a atribuição manual de vendedor/período feita no
    // dashboard é sobrescrita na reimportação.
    const existing = await fetchAllRows<{
      data_pagamento: string;
      cliente: string;
      valor_eur: number;
      seller_name: string | null;
      period_id: number | null;
    }>(
      ({ from, to }) =>
        db
          .from("bi_wise_payments")
          .select("data_pagamento,cliente,valor_eur,seller_name,period_id")
          .range(from, to),
      () => db.from("bi_wise_payments").select("*", { count: "exact", head: true }),
    );
    const keep = new Map<string, { seller_name: string | null; period_id: number | null }>();
    for (const e of existing) {
      keep.set(`${e.data_pagamento}|${e.cliente}|${e.valor_eur}`, {
        seller_name: e.seller_name ?? null,
        period_id: e.period_id ?? null,
      });
    }

    const { error: delErr } = await db
      .from("bi_wise_payments")
      .delete()
      .eq("source", "google_sheets")
      .in("sheet_tab", tabs!);
    if (delErr) throw new Error(delErr.message);

    const now = new Date().toISOString();
    const rows = parsed.map((r) => {
      const prev = keep.get(`${r.data_pagamento}|${r.cliente}|${r.valor_eur}`);
      return {
        ...r,
        seller_name: prev?.seller_name ?? null,
        period_id: prev?.period_id ?? null,
        source: "google_sheets",
        synced_at: now,
      };
    });

    // Deduplica dentro da própria planilha (índice único usa data+cliente+valor+descrição)
    const seen = new Set<string>();
    const unique = rows.filter((r) => {
      const k = `${r.data_pagamento}|${r.cliente}|${r.valor_eur}|${r.descricao ?? ""}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const { error } = await db.from("bi_wise_payments").insert(unique);
    if (error) throw new Error(error.message);

    return {
      imported: unique.length,
      tabs: tabs!.length,
      inadimplentes: unique.filter((r) => r.inadimplente).length,
    };
  });
