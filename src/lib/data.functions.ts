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

/**
 * Busca todas as páginas de uma tabela em paralelo (1 round-trip pro count +
 * N round-trips simultâneos), em vez de sequencial — corta o tempo de
 * carregamento de páginas que leem clint_deals/sales inteiro de ~N*latência
 * pra ~1*latência.
 */
async function fetchAllPaged<T>(supabase: any, table: string, select: string, orderBy: string): Promise<T[]> {
  const pageSize = 1000;
  const { count, error: countError } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (countError) throw new Error(countError.message);
  const total = count ?? 0;
  if (total === 0) return [];

  const pages = Math.ceil(total / pageSize);
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) => {
      const from = i * pageSize;
      return supabase
        .from(table)
        .select(select)
        .order(orderBy, { ascending: false })
        .range(from, from + pageSize - 1);
    }),
  );
  const all: T[] = [];
  for (const { data, error } of results) {
    if (error) throw new Error(error.message);
    all.push(...((data ?? []) as T[]));
  }
  return all;
}

// ───── clint_deals ─────
export const fetchAllDealsFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  return fetchAllPaged<any>(
    supabase,
    "clint_deals",
    "id,user_id,user_name,user_email,won_by_user_id,won_by_name,won_by_email,contact_email,contact_name,status,value,currency,created_at,won_at,lost_at,lost_status_id,stage,stage_id,origin_id,origin_name",
    "created_at",
  );
});

// ───── sales (full read for BI) ─────
export const fetchAllSalesFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  return fetchAllPaged<any>(
    supabase,
    "sales",
    "transacao,produto_grupo,produto_original,status,data_venda,email_cliente,faturamento_liquido_brl,nome_afiliado",
    "transacao",
  );
});

// ───── sales (dashboard projection) ─────
export const fetchSalesDashboardFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  return fetchAllPaged<any>(
    supabase,
    "sales",
    "transacao,produto_grupo,produto_original,status,data_venda,moeda_original,preco_oferta,faturamento_liquido_brl,valor_recebido_convertido,moeda_recebimento,nome_afiliado,origem_checkout",
    "data_venda",
  );
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

// ───── campanha: leads novos + retomada cadência ─────
export const fetchCampanhaDataFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();

  const { data: origins } = await supabase
    .from("clint_origins")
    .select("id,name")
    .eq("group_name", "FUNIS PERPETUOS");

  const perpetuosIds: string[] = (origins ?? []).map((o: any) => o.id);

  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  monday.setHours(0, 0, 0, 0);

  const PALESTRAS_ID = "7c07456e-d803-497d-8595-c0e181f7d4db";
  const RETOMADA_ID  = "af41b952-e69a-4a9b-a39b-6b40f0334a08";

  const { data: leadsNovos, error: e1 } = await supabase
    .from("clint_deals")
    .select("id,origin_id,origin_name,user_id,user_name,stage,stage_id,created_at,contact_name,status")
    .gte("created_at", monday.toISOString())
    .in("origin_id", [...perpetuosIds, PALESTRAS_ID])
    .order("created_at", { ascending: false })
    .limit(1000);

  if (e1) throw new Error(e1.message);

  const { data: retomadaDeals, error: e2 } = await supabase
    .from("clint_deals")
    .select("id,user_id,user_name,stage,updated_stage_at,contact_name,contact_phone,status")
    .eq("origin_id", RETOMADA_ID)
    .eq("status", "OPEN")
    .in("stage", ["Base", "Mensagem 1"])
    .not("updated_stage_at", "is", null)
    .order("updated_stage_at", { ascending: false })
    .limit(2000);

  if (e2) throw new Error(e2.message);

  return {
    leadsNovos: leadsNovos ?? [],
    retomadaDeals: retomadaDeals ?? [],
    perpetuosIds,
    PALESTRAS_ID,
    weekStart: monday.toISOString(),
  };
});

// ───── pipeline metrics (PIPELINE_COMERCIAL-V3 + Sessão Estratégica) ─────
const pipelineMetricsInput = z.object({ month: z.string() }); // "YYYY-MM"

export const fetchPipelineMetricsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => pipelineMetricsInput.parse(data))
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { month } = data;
    const monthStart = `${month}-01`;
    const nextM = new Date(`${month}-01T12:00:00Z`);
    nextM.setUTCMonth(nextM.getUTCMonth() + 1);
    const monthEnd = nextM.toISOString().slice(0, 10);

    const PIPELINE_ORIGINS = [
      "8c159581-ba93-4fad-a909-f4e204d6faaf", // PIPELINE_COMERCIAL-V3
      "07fc7c4b-82d2-427d-b09e-04a7f90f16f1", // PIPELINE_COMERCIAL-V3 (v2)
      "f8b0fa1a-5f7b-4402-bb47-b0c4cbdf9090", // Sessão Estratégica (Funil)
      "dfbc12ac-9f79-404a-82d5-83cd579e683b", // Sessão Estratégica
    ];

    // Leads recebidos no mês nesses funis
    const { data: recebidos, error: e1 } = await supabase
      .from("clint_deals")
      .select("id,status,created_at,won_at")
      .in("origin_id", PIPELINE_ORIGINS)
      .gte("created_at", monthStart)
      .lt("created_at", monthEnd);
    if (e1) throw new Error(e1.message);

    // Deals fechados (won_at) no mês nesses funis (independente de quando entraram)
    const { data: fechados, error: e2 } = await supabase
      .from("clint_deals")
      .select("id,created_at,won_at")
      .in("origin_id", PIPELINE_ORIGINS)
      .eq("status", "WON")
      .gte("won_at", monthStart)
      .lt("won_at", monthEnd);
    if (e2) throw new Error(e2.message);

    const allRecebidos = recebidos ?? [];
    const allFechados = fechados ?? [];

    const cicloMedioDias =
      allFechados.length > 0
        ? allFechados.reduce((sum, d) => {
            if (!d.won_at || !d.created_at) return sum;
            return sum + (new Date(d.won_at).getTime() - new Date(d.created_at).getTime()) / 86_400_000;
          }, 0) / allFechados.length
        : null;

    return {
      recebidos: allRecebidos.length,
      emAberto: allRecebidos.filter((d) => d.status === "OPEN").length,
      perdidos: allRecebidos.filter((d) => d.status === "LOST").length,
      fechados: allFechados.length,
      cicloMedioDias,
      conversao: allRecebidos.length > 0 ? (allFechados.length / allRecebidos.length) * 100 : 0,
    };
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

// ───── bi_team_activity / bi_followup_activities ─────
export const fetchTeamActivityFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  const { data, error } = await supabase
    .from("bi_team_activity")
    .select("periodo_inicio,periodo_fim,user_name,ligacoes,emails,tarefas,reunioes_agendadas,whatsapp,negocios_trabalhados")
    .order("periodo_inicio", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const fetchFollowupActivitiesFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  const { data, error } = await supabase
    .from("bi_followup_activities")
    .select("periodo_inicio,periodo_fim,titulo_atividade,quantidade")
    .order("periodo_inicio", { ascending: false });
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
