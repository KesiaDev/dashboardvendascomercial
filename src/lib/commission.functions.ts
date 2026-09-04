import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, commissionScope } from "@/lib/authz.server";
import { fetchAllRows } from "@/lib/supabase-paging";
import { calculateCommissions } from "@/lib/commission";
import type { CommissionPeriod, ManualSaleRow } from "@/lib/commission";
import { eurBrlRate } from "@/lib/eur-rate";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const fetchCommissionPeriodsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context.claims);
    const db = await admin();
    const { data, error } = await db
      .from("bi_commission_periods")
      .select("id,nome,data_inicio,data_fim,roleta_pool_brl,roleta_pool_eur,cotacao_eur")
      .order("data_inicio", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const fetchSellerConfigFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context.claims);
    const db = await admin();
    const { data, error } = await db
      .from("bi_seller_config")
      .select("seller_name,hotmart_affiliate_name,clint_user_name,moeda_padrao,is_active")
      .order("seller_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const fetchCommissionRatesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context.claims);
    const db = await admin();
    const { data, error } = await db
      .from("bi_commission_rates")
      .select("seller_name,produto_grupo,rate_pct,manager_rate_pct,effective_from")
      .order("seller_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const fetchWisePaymentsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context.claims);
    const db = await admin();
    // Sem filtro e sem limite: o PostgREST truncava em 1000 linhas sem erro, e
    // os pagamentos mais antigos simplesmente sumiam do cálculo.
    return await fetchAllRows(
      ({ from, to }) =>
        db
          .from("bi_wise_payments")
          .select(
            "id,data_pagamento,cliente,valor_eur,cotacao_eur,valor_brl,descricao,seller_name,produto_grupo,period_id,email_cliente,situacao,inadimplente,sheet_tab,source,synced_at",
          )
          .order("data_pagamento", { ascending: false })
          .range(from, to),
      () => db.from("bi_wise_payments").select("*", { count: "exact", head: true }),
    );
  });

export const fetchCommissionBonusesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context.claims);
    const db = await admin();
    const { data, error } = await db
      .from("bi_commission_bonuses")
      .select("id,period_id,seller_name,tipo,valor,moeda,notas,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

type UpsertRateInput = {
  seller_name: string;
  produto_grupo: string;
  rate_pct: number;
  manager_rate_pct: number;
};

export const upsertCommissionRateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: UpsertRateInput) => d)
  .handler(async ({ data, context }) => {
    assertAdmin(context.claims);
    const db = await admin();
    const { error } = await db
      .from("bi_commission_rates")
      .upsert(
        { ...data, effective_from: "2026-01-01" },
        { onConflict: "seller_name,produto_grupo,effective_from" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

type UpsertPeriodInput = {
  id?: number;
  nome: string;
  data_inicio: string;
  data_fim: string;
  roleta_pool_brl: number;
  roleta_pool_eur: number;
  cotacao_eur?: number;
};

export const upsertCommissionPeriodFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: UpsertPeriodInput) => d)
  .handler(async ({ data, context }) => {
    assertAdmin(context.claims);
    const db = await admin();
    const { id, ...rest } = data;
    if (id) {
      const { error } = await db.from("bi_commission_periods").update(rest).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("bi_commission_periods").insert(rest);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

type AddBonusInput = {
  period_id: number;
  seller_name: string;
  tipo: string;
  valor: number;
  moeda: string;
  notas?: string | null;
};

export const addCommissionBonusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: AddBonusInput) => d)
  .handler(async ({ data, context }) => {
    assertAdmin(context.claims);
    const db = await admin();
    const { error } = await db.from("bi_commission_bonuses").insert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCommissionBonusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data, context }) => {
    assertAdmin(context.claims);
    const db = await admin();
    const { error } = await db.from("bi_commission_bonuses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

type ImportWiseInput = {
  period_id: number;
  rows: {
    data_pagamento: string;
    cliente: string;
    valor_eur: number;
    cotacao_eur: number;
    valor_brl: number;
    descricao: string | null;
    seller_name: string | null;
    produto_grupo: string | null;
  }[];
};

// Busca manual_sales (Fechamento) para uso no cálculo de comissão
// Retorna apenas os campos necessários para o engine de comissão
export const fetchManualSalesForCommissionFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from: string; to: string }) => {
    if (!d.from || !d.to) throw new Error("Datas obrigatórias");
    return d;
  })
  .handler(async ({ data, context }) => {
    const db = await admin();
    // Alimenta /fechamento-semanal e o cálculo de comissão. Sem paginação,
    // um período com mais de 1000 lançamentos era truncado em silêncio e a
    // comissão saía menor do que o devido.
    const inPeriod = <Q extends { eq: any }>(q: Q) =>
      (q as any).eq("installment_paid", true).gte("sale_date", data.from).lte("sale_date", data.to);
    // Espelha exatamente as colunas do select abaixo.
    type Row = ManualSaleRow & {
      funnel: string;
      installment_number: number | null;
      installment_total: number | null;
      installment_paid: boolean | null;
    };
    return await fetchAllRows<Row>(
      ({ from, to }) =>
        inPeriod(
          db
            .from("manual_sales")
            .select(
              "id,seller_name,product,funnel,value_eur,sale_date,confirmation_status,confirmed_hotmart_valor_brl,client_email,client_name,installment_number,installment_total,installment_paid",
            ),
        )
          .order("sale_date", { ascending: false })
          .range(from, to),
      () => inPeriod(db.from("manual_sales").select("*", { count: "exact", head: true })),
    );
  });

// ── Vendas Hotmart do período (para cálculo e conferência) ───────────────────
export const fetchSalesForCommissionFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from: string; to: string }) => {
    if (!d.from || !d.to) throw new Error("Datas obrigatórias");
    return d;
  })
  .handler(async ({ data, context }) => {
    assertAdmin(context.claims);
    const db = await admin();
    const cols =
      "transacao,produto_grupo,produto_original,status,data_venda,nome_cliente,email_cliente,nome_afiliado,origem_checkout,faturamento_liquido_brl,preco_total,moeda_original,numero_parcela";
    // Eram até 40 páginas em série, ~40 x latência, no caminho crítico de
    // /comissionamento. O padrão paralelo já existia em data.functions.ts.
    const f = <Q>(q: Q) =>
      (q as any)
        .gte("data_venda", `${data.from}T00:00:00Z`)
        .lte("data_venda", `${data.to}T23:59:59Z`);
    return await fetchAllRows<Record<string, any>>(
      ({ from, to }) =>
        f(db.from("sales").select(cols)).order("data_venda", { ascending: false }).range(from, to),
      () => f(db.from("sales").select("*", { count: "exact", head: true })),
    );
  });

// ── Ajustes manuais em vendas (observação / trocar vendedor / excluir) ───────
export const fetchSaleOverridesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context.claims);
    const db = await admin();
    // Cada override é uma exceção manual aplicada a uma venda. Perder um por
    // truncamento significa recolocar no cálculo uma venda que foi
    // deliberadamente excluída.
    return await fetchAllRows(
      ({ from, to }) =>
        db
          .from("bi_sale_overrides")
          .select("transacao,seller_name,produto_grupo,excluir,observacao")
          .range(from, to),
      () => db.from("bi_sale_overrides").select("*", { count: "exact", head: true }),
    );
  });

type OverrideInput = {
  transacao: string;
  seller_name?: string | null;
  produto_grupo?: string | null;
  excluir?: boolean;
  observacao?: string | null;
};

export const upsertSaleOverrideFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: OverrideInput) => {
    if (!d.transacao) throw new Error("Transação obrigatória");
    return d;
  })
  .handler(async ({ data, context }) => {
    assertAdmin(context.claims);
    const db = await admin();
    const row = {
      transacao: data.transacao,
      seller_name: data.seller_name ?? null,
      produto_grupo: data.produto_grupo ?? null,
      excluir: data.excluir ?? false,
      observacao: data.observacao ?? null,
    };
    const vazio = !row.seller_name && !row.produto_grupo && !row.excluir && !row.observacao;
    if (vazio) {
      const { error } = await db.from("bi_sale_overrides").delete().eq("transacao", row.transacao);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await db.from("bi_sale_overrides").upsert(row, { onConflict: "transacao" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const importWisePaymentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: ImportWiseInput) => d)
  .handler(async ({ data, context }) => {
    assertAdmin(context.claims);
    const db = await admin();
    const rows = data.rows.map((r) => ({ ...r, period_id: data.period_id }));
    const { error } = await db.from("bi_wise_payments").insert(rows);
    if (error) throw new Error(error.message);
    return { imported: rows.length };
  });

// ── Roleta: giros por venda ──────────────────────────────────────────────────
// Regra: cada venda nova gera 1 giro. Renovação NÃO gera giro.
// Mentoria e Accelerator são roletas diferentes (prêmios diferentes).
// Vendas "por fora" (Wise / outro link) podem ser lançadas manualmente.

export type RoletaSpinRow = {
  id: string;
  period_id: number | null;
  seller_name: string;
  spin_date: string;
  wheel: string;
  source: string;
  source_sale_id: string | null;
  client_name: string | null;
  product: string | null;
  prize_label: string | null;
  prize_value_eur: number;
  prize_value_brl: number;
  status: string;
  notes: string | null;
};

const SPIN_COLS =
  "id,period_id,seller_name,spin_date,wheel,source,source_sale_id,client_name,product,prize_label,prize_value_eur,prize_value_brl,status,notes";

export const fetchRoletaSpinsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context.claims);
    const db = await admin();
    const { data, error } = await db
      .from("bi_roleta_spins")
      .select(SPIN_COLS)
      .order("spin_date", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as RoletaSpinRow[];
  });

type SpinInput = {
  id?: string;
  period_id: number | null;
  seller_name: string;
  spin_date: string;
  wheel: string;
  source?: string;
  client_name?: string | null;
  product?: string | null;
  prize_label?: string | null;
  prize_value_eur?: number;
  prize_value_brl?: number;
  status?: string;
  notes?: string | null;
};

export const upsertRoletaSpinFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: SpinInput) => {
    if (!d.seller_name?.trim()) throw new Error("Vendedor obrigatório");
    if (!d.spin_date) throw new Error("Data obrigatória");
    if (d.wheel !== "mentoria" && d.wheel !== "accelerator") throw new Error("Roleta inválida");
    return d;
  })
  .handler(async ({ data, context }) => {
    assertAdmin(context.claims);
    const db = await admin();
    const { id, ...rest } = data;
    const row = {
      ...rest,
      source: rest.source ?? "manual",
      prize_value_eur: rest.prize_value_eur ?? 0,
      prize_value_brl: rest.prize_value_brl ?? 0,
      status: rest.status ?? "pendente",
    };
    if (id) {
      const { error } = await db.from("bi_roleta_spins").update(row).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("bi_roleta_spins").insert(row);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteRoletaSpinFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    assertAdmin(context.claims);
    const db = await admin();
    const { error } = await db.from("bi_roleta_spins").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Gera os giros pendentes a partir das vendas do Fechamento marcadas com roleta
// (1ª parcela apenas, sem renovações), sem duplicar o que já existe.
export const generateRoletaSpinsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { period_id: number; from: string; to: string }) => d)
  .handler(async ({ data, context }) => {
    assertAdmin(context.claims);
    const db = await admin();
    const roletaFilter = <Q>(q: Q) =>
      (q as any)
        .not("roleta_type", "is", null)
        .eq("installment_number", 1)
        .gte("sale_date", data.from)
        .lte("sale_date", data.to);
    type RoletaSale = {
      id: string;
      seller_name: string;
      product: string;
      client_name: string | null;
      sale_date: string;
      roleta_type: string | null;
      installment_number: number | null;
      categoria_produto: string | null;
    };
    const sales = await fetchAllRows<RoletaSale>(
      ({ from, to }) =>
        roletaFilter(
          db
            .from("manual_sales")
            .select(
              "id,seller_name,product,client_name,sale_date,roleta_type,installment_number,categoria_produto",
            ),
        ).range(from, to),
      () => roletaFilter(db.from("manual_sales").select("*", { count: "exact", head: true })),
    );

    const elegiveis = sales.filter((s) => s.categoria_produto !== "RENOVACAO");
    if (elegiveis.length === 0) return { created: 0 };

    const { data: existing, error: e2 } = await db
      .from("bi_roleta_spins")
      .select("source_sale_id")
      .in(
        "source_sale_id",
        elegiveis.map((s) => s.id),
      );
    if (e2) throw new Error(e2.message);
    const jaTem = new Set((existing ?? []).map((r) => r.source_sale_id));

    const novos = elegiveis
      .filter((s) => !jaTem.has(s.id))
      .map((s) => ({
        period_id: data.period_id,
        seller_name: s.seller_name,
        spin_date: s.sale_date,
        wheel: s.roleta_type as string,
        source: "fechamento",
        source_sale_id: s.id,
        client_name: s.client_name,
        product: s.product,
        status: "pendente",
      }));
    if (novos.length === 0) return { created: 0 };

    const { error: e3 } = await db.from("bi_roleta_spins").insert(novos);
    if (e3) throw new Error(e3.message);
    return { created: novos.length };
  });

// ── Comissionamento individual do vendedor ───────────────────────────────────
// Vendedor não-admin nunca recebe as vendas do time no browser: o cálculo roda
// aqui e só a linha dele volta. A identidade vem do token (commissionScope).
export const fetchMyCommissionFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { periodId?: number | null } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const scope = commissionScope(context.claims);
    if (!scope.sellerName) throw new Error("Utilizador sem vendedor associado");
    const db = await admin();

    const { data: periodsRaw, error: pErr } = await db
      .from("bi_commission_periods")
      .select("id,nome,data_inicio,data_fim,roleta_pool_brl,roleta_pool_eur,cotacao_eur")
      .order("data_inicio", { ascending: false });
    if (pErr) throw new Error(pErr.message);
    const periods = (periodsRaw ?? []) as CommissionPeriod[];
    if (periods.length === 0) return null;

    const today = new Date().toISOString().slice(0, 10);
    const period =
      (data.periodId ? periods.find((p) => p.id === data.periodId) : null) ??
      periods.find((p) => p.data_inicio <= today && today <= p.data_fim) ??
      periods[0];

    const [sellersRes, ratesRes, bonusesRes, spinsRes] = await Promise.all([
      db
        .from("bi_seller_config")
        .select("seller_name,hotmart_affiliate_name,clint_user_name,moeda_padrao,is_active"),
      db
        .from("bi_commission_rates")
        .select("seller_name,produto_grupo,rate_pct,manager_rate_pct,effective_from"),
      db
        .from("bi_commission_bonuses")
        .select("id,period_id,seller_name,tipo,valor,moeda,notas,created_at"),
      db.from("bi_roleta_spins").select(SPIN_COLS),
    ]);
    for (const r of [sellersRes, ratesRes, bonusesRes, spinsRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const [wise, overrides, manualSales, hotmartSales] = await Promise.all([
      fetchAllRows(
        ({ from, to }) =>
          db
            .from("bi_wise_payments")
            .select(
              "id,data_pagamento,cliente,valor_eur,cotacao_eur,valor_brl,descricao,seller_name,produto_grupo,period_id,email_cliente,situacao,inadimplente,sheet_tab,source,synced_at",
            )
            .range(from, to),
        () => db.from("bi_wise_payments").select("*", { count: "exact", head: true }),
      ),
      fetchAllRows(
        ({ from, to }) =>
          db
            .from("bi_sale_overrides")
            .select("transacao,seller_name,produto_grupo,excluir,observacao")
            .range(from, to),
        () => db.from("bi_sale_overrides").select("*", { count: "exact", head: true }),
      ),
      fetchAllRows(
        ({ from, to }) =>
          db
            .from("manual_sales")
            .select(
              "id,seller_name,product,funnel,value_eur,sale_date,confirmation_status,confirmed_hotmart_valor_brl,client_email,client_name,installment_number,installment_total,installment_paid",
            )
            .eq("installment_paid", true)
            .gte("sale_date", period.data_inicio)
            .lte("sale_date", period.data_fim)
            .range(from, to),
        () =>
          db
            .from("manual_sales")
            .select("*", { count: "exact", head: true })
            .eq("installment_paid", true)
            .gte("sale_date", period.data_inicio)
            .lte("sale_date", period.data_fim),
      ),
      fetchAllRows(
        ({ from, to }) =>
          db
            .from("sales")
            .select(
              "transacao,produto_grupo,produto_original,status,data_venda,nome_cliente,email_cliente,nome_afiliado,origem_checkout,faturamento_liquido_brl,preco_total,moeda_original,numero_parcela",
            )
            .gte("data_venda", `${period.data_inicio}T00:00:00`)
            .lte("data_venda", `${period.data_fim}T23:59:59`)
            .range(from, to),
        () =>
          db
            .from("sales")
            .select("*", { count: "exact", head: true })
            .gte("data_venda", `${period.data_inicio}T00:00:00`)
            .lte("data_venda", `${period.data_fim}T23:59:59`),
      ),
    ]);

    const summary = calculateCommissions(
      period,
      (sellersRes.data ?? []) as any,
      (ratesRes.data ?? []) as any,
      hotmartSales as any,
      wise as any,
      (bonusesRes.data ?? []) as any,
      manualSales as any,
      (spinsRes.data ?? []) as any,
      overrides as any,
    );

    const me = summary.sellers.find((s) => s.sellerName === scope.sellerName) ?? null;

    return {
      sellerName: scope.sellerName,
      period,
      periods: periods.map((p) => ({ id: p.id, nome: p.nome })),
      cotacao: eurBrlRate(period),
      me,
      rates: (ratesRes.data ?? []).filter((r: any) => r.seller_name === scope.sellerName),
      spins: ((spinsRes.data ?? []) as RoletaSpinRow[]).filter(
        (s) =>
          s.seller_name === scope.sellerName &&
          s.spin_date >= period.data_inicio &&
          s.spin_date <= period.data_fim,
      ),
      vendas: summary.vendas
        .filter((v) => v.seller === scope.sellerName && !v.override?.excluir)
        .map((v) => ({
          transacao: v.transacao,
          data_venda: v.data_venda,
          nome_cliente: v.nome_cliente,
          produto_grupo: v.produto_grupo,
          base_brl: v.base_brl,
          source: v.source,
        })),
    };
  });
