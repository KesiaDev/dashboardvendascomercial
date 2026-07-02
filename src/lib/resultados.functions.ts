import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

// ── Contagem de leads (clint_deals.created_at) por mês/ano ──────────────────
export const fetchLeadsRealizadoFn = createServerFn({ method: "GET" })
  .inputValidator((d: { year: number }) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const from = `${data.year}-01-01T00:00:00Z`;
    const to = `${data.year}-12-31T23:59:59Z`;
    const pageSize = 1000;
    const { count } = await db
      .from("clint_deals")
      .select("*", { count: "exact", head: true })
      .gte("created_at", from)
      .lte("created_at", to);
    const total = count ?? 0;
    if (total === 0) return { total: 0, byMonth: {} as Record<number, number> };
    const pages = Math.ceil(total / pageSize);
    const results = await Promise.all(
      Array.from({ length: pages }, (_, i) => {
        const offset = i * pageSize;
        return db
          .from("clint_deals")
          .select("created_at")
          .gte("created_at", from)
          .lte("created_at", to)
          .range(offset, offset + pageSize - 1);
      }),
    );
    const byMonth: Record<number, number> = {};
    let totalCount = 0;
    for (const { data: rows, error } of results) {
      if (error) throw new Error(error.message);
      for (const r of rows ?? []) {
        if (!r.created_at) continue;
        const m = new Date(r.created_at).getUTCMonth();
        byMonth[m] = (byMonth[m] ?? 0) + 1;
        totalCount++;
      }
    }
    return { total: totalCount, byMonth };
  });

// ── Weekly manual results ────────────────────────────────────────────────────
export type WeeklyResult = {
  product_id: string;
  week_start: string;
  indicador: string;
  valor_brl: number;
};

export const fetchWeeklyResultsFn = createServerFn({ method: "GET" })
  .inputValidator((d: { year: number }) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const from = `${data.year}-01-01`;
    const to = `${data.year}-12-31`;
    const { data: rows, error } = await db
      .from("bi_weekly_results")
      .select("product_id,week_start,indicador,valor_brl")
      .gte("week_start", from)
      .lte("week_start", to);
    if (error) throw new Error(error.message);
    return (rows ?? []) as WeeklyResult[];
  });

export const saveWeeklyResultFn = createServerFn({ method: "POST" })
  .inputValidator((d: {
    product_id: string;
    week_start: string;
    indicador: string;
    valor_brl: number;
  }) => {
    if (!d.product_id || !d.week_start || !d.indicador) throw new Error("Campos obrigatórios");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.week_start)) throw new Error("Data inválida");
    return d;
  })
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db.from("bi_weekly_results").upsert(
      {
        product_id: data.product_id,
        week_start: data.week_start,
        indicador: data.indicador,
        valor_brl: data.valor_brl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "product_id,week_start,indicador" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Monthly overrides ───────────────────────────────────────────────────────
export type MonthlyOverride = {
  bloco: string;
  periodo: string;
  indicador: string;
  valor_brl: number;
};

export const fetchMonthlyOverridesFn = createServerFn({ method: "GET" })
  .inputValidator((d: { year: number }) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const from = `${data.year}-01-01`;
    const to = `${data.year}-12-31`;
    const { data: rows, error } = await db
      .from("bi_monthly_overrides")
      .select("bloco,periodo,indicador,valor_brl")
      .gte("periodo", from)
      .lte("periodo", to);
    if (error) throw new Error(error.message);
    return (rows ?? []) as MonthlyOverride[];
  });

export const saveMonthlyOverrideFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bloco: string; periodo: string; indicador: string; valor_brl: number }) => {
    if (!d.bloco || !d.periodo || !d.indicador) throw new Error("Campos obrigatórios");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("bi_monthly_overrides").upsert(
      {
        bloco: data.bloco,
        periodo: data.periodo,
        indicador: data.indicador,
        valor_brl: data.valor_brl,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "bloco,periodo,indicador" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Save target (meta or distribuicao_pct) ─────────────────────────────────
export const saveTargetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    periodo: string;
    channel_id: string | null;
    indicador: string;
    valor: number;
    granularidade?: string;
  }) => {
    if (!d.periodo || !d.indicador) throw new Error("Campos obrigatórios");
    return d;
  })
  .handler(async ({ data, context }) => {
    const db = await admin();
    // Delete existing (single row per key) then insert. Simpler than upsert with COALESCE.
    let q = db.from("bi_targets").delete()
      .eq("granularidade", data.granularidade ?? "mensal")
      .eq("periodo", data.periodo)
      .eq("indicador", data.indicador);
    if (data.channel_id === null) q = q.is("channel_id", null);
    else q = q.eq("channel_id", data.channel_id);
    await q.is("product_id", null);

    const { error } = await context.supabase.from("bi_targets").insert({
      granularidade: data.granularidade ?? "mensal",
      periodo: data.periodo,
      channel_id: data.channel_id,
      product_id: null,
      indicador: data.indicador,
      valor: data.valor,
      fonte: "planilha_2026",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
