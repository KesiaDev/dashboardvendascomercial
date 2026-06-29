/**
 * Server functions for all direct table reads/writes that were previously
 * done via the browser supabase client. RLS on these tables is locked to
 * service_role only, so every access must go through here.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// ───── clint_deals ─────
export const fetchAllDealsFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  const all: any[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("clint_deals")
      .select(
        "id,user_id,user_name,user_email,won_by_user_id,won_by_name,won_by_email,contact_email,status,value,currency,created_at,won_at,lost_at,lost_status_id,stage,stage_id,origin_id,origin_name",
      )
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
});

// ───── sales (full read for BI) ─────
export const fetchAllSalesFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  const all: any[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("sales")
      .select(
        "transacao,produto_grupo,produto_original,status,data_venda,email_cliente,faturamento_liquido_brl,nome_afiliado",
      )
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
});

// ───── sales (dashboard projection) ─────
export const fetchSalesDashboardFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  const all: any[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("sales")
      .select(
        "transacao,produto_grupo,produto_original,status,data_venda,moeda_original,preco_oferta,faturamento_liquido_brl,valor_recebido_convertido,moeda_recebimento",
      )
      .order("data_venda", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
});

// ───── clint_origins / stages / lost_statuses / sync log ─────
export const fetchOriginsFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  const { data, error } = await supabase
    .from("clint_origins")
    .select("id,name,group_name,archived")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const fetchStagesFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  const { data, error } = await supabase
    .from("clint_origin_stages")
    .select("id,origin_id,label,stage_order,type")
    .order("stage_order");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const fetchLostStatusesFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  const { data, error } = await supabase.from("clint_lost_statuses").select("id,label");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const fetchLastSyncFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  const { data } = await supabase
    .from("clint_sync_log")
    .select("*")
    .eq("kind", "deals")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
});

// ───── bi_pipeline_areas ─────
export const fetchPipelineAreasFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  const { data, error } = await supabase
    .from("bi_pipeline_areas")
    .select("pipeline_id,area,ativo,auto_classified");
  if (error) throw new Error(error.message);
  return data ?? [];
});

// ───── bi_product_config ─────
export const fetchProductConfigFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  const { data, error } = await supabase
    .from("bi_product_config")
    .select("product_id,label,ativo,categoria,produto_pai_id")
    .order("label");
  if (error) throw new Error(error.message);
  return data ?? [];
});

// ───── bi_channels ─────
export const fetchChannelsFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  const { data, error } = await supabase
    .from("bi_channels")
    .select("id,label,tipo,clint_group_names,sck_prefixes")
    .order("label");
  if (error) throw new Error(error.message);
  return data ?? [];
});

// ───── bi_targets ─────
export const fetchTargetsFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  const { data, error } = await supabase
    .from("bi_targets")
    .select("granularidade,periodo,channel_id,product_id,indicador,valor,fonte")
    .order("periodo");
  if (error) throw new Error(error.message);
  return data ?? [];
});

// ───── weekly_imports ─────
export const fetchImportsFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  const { data, error } = await supabase
    .from("weekly_imports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const fetchGroupCountsFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  const { data, error } = await supabase.from("sales").select("produto_grupo");
  if (error) throw new Error(error.message);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const g = (row as { produto_grupo: string }).produto_grupo;
    counts[g] = (counts[g] ?? 0) + 1;
  }
  return counts;
});

// ───── import write path ─────
const importPayload = z.object({
  rows: z.array(z.record(z.string(), z.any())),
  filename: z.string(),
});

export const importSalesFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => importPayload.parse(data))
  .handler(async ({ data }) => {
    const supabase = await admin();
    const rows = data.rows as any[];
    const txs = rows.map((r) => r.transacao).filter(Boolean);
    const existing = new Set<string>();
    const batchSize = 500;
    for (let i = 0; i < txs.length; i += batchSize) {
      const chunk = txs.slice(i, i + batchSize);
      const { data: ex, error } = await supabase
        .from("sales")
        .select("transacao")
        .in("transacao", chunk);
      if (error) throw new Error(error.message);
      for (const r of ex ?? []) existing.add((r as { transacao: string }).transacao);
    }

    const upBatch = 500;
    for (let i = 0; i < rows.length; i += upBatch) {
      const chunk = rows.slice(i, i + upBatch).map((r) => ({
        ...r,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from("sales")
        .upsert(chunk, { onConflict: "transacao" });
      if (error) throw new Error(error.message);
    }

    const newRows = rows.filter((r) => !existing.has(r.transacao)).length;
    const updatedRows = rows.length - newRows;
    const dates = rows
      .map((r) => r.data_venda as string | null)
      .filter((d): d is string => !!d)
      .sort();

    await supabase.from("weekly_imports").insert({
      filename: data.filename,
      total_rows: rows.length,
      new_rows: newRows,
      updated_rows: updatedRows,
      period_start: dates[0] ?? null,
      period_end: dates[dates.length - 1] ?? null,
    });

    return { newRows, updatedRows, total: rows.length };
  });
