import { createServerFn } from "@tanstack/react-start";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const fetchCommissionPeriodsFn = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data, error } = await db
    .from("bi_commission_periods")
    .select("id,nome,data_inicio,data_fim,roleta_pool_brl,roleta_pool_eur,cotacao_eur")
    .order("data_inicio", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const fetchSellerConfigFn = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data, error } = await db
    .from("bi_seller_config")
    .select("seller_name,hotmart_affiliate_name,clint_user_name,moeda_padrao,is_active")
    .order("seller_name");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const fetchCommissionRatesFn = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data, error } = await db
    .from("bi_commission_rates")
    .select("seller_name,produto_grupo,rate_pct,manager_rate_pct,effective_from")
    .order("seller_name");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const fetchWisePaymentsFn = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data, error } = await db
    .from("bi_wise_payments")
    .select("id,data_pagamento,cliente,valor_eur,cotacao_eur,valor_brl,descricao,seller_name,produto_grupo,period_id")
    .order("data_pagamento", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const fetchCommissionBonusesFn = createServerFn({ method: "GET" }).handler(async () => {
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
  .inputValidator((d: UpsertRateInput) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db
      .from("bi_commission_rates")
      .upsert({ ...data, effective_from: "2026-01-01" }, { onConflict: "seller_name,produto_grupo,effective_from" });
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
  .inputValidator((d: UpsertPeriodInput) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const { id, ...rest } = data;
    if (id) {
      const { error } = await db.from("bi_commission_periods").update(rest).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db
        .from("bi_commission_periods")
        .insert(rest);
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
  .inputValidator((d: AddBonusInput) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db.from("bi_commission_bonuses").insert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCommissionBonusFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
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
  .inputValidator((d: { from: string; to: string }) => {
    if (!d.from || !d.to) throw new Error("Datas obrigatórias");
    return d;
  })
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: rows, error } = await db
      .from("manual_sales")
      .select("id,seller_name,product,value_eur,sale_date,confirmation_status,confirmed_hotmart_valor_brl,installment_number,installment_total,installment_paid")
      .eq("installment_paid", true)
      .gte("sale_date", data.from)
      .lte("sale_date", data.to)
      .order("sale_date", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const importWisePaymentsFn = createServerFn({ method: "POST" })
  .inputValidator((d: ImportWiseInput) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const rows = data.rows.map((r) => ({ ...r, period_id: data.period_id }));
    const { error } = await db.from("bi_wise_payments").insert(rows);
    if (error) throw new Error(error.message);
    return { imported: rows.length };
  });
