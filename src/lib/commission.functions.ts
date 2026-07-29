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
    .select("id,data_pagamento,cliente,valor_eur,cotacao_eur,valor_brl,descricao,seller_name,produto_grupo,period_id,email_cliente,situacao,inadimplente,sheet_tab,source,synced_at")
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
      .select("id,seller_name,product,funnel,value_eur,sale_date,confirmation_status,confirmed_hotmart_valor_brl,client_email,client_name,installment_number,installment_total,installment_paid")
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

export const fetchRoletaSpinsFn = createServerFn({ method: "GET" }).handler(async () => {
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
  .inputValidator((d: SpinInput) => {
    if (!d.seller_name?.trim()) throw new Error("Vendedor obrigatório");
    if (!d.spin_date) throw new Error("Data obrigatória");
    if (d.wheel !== "mentoria" && d.wheel !== "accelerator") throw new Error("Roleta inválida");
    return d;
  })
  .handler(async ({ data }) => {
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
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db.from("bi_roleta_spins").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Gera os giros pendentes a partir das vendas do Fechamento marcadas com roleta
// (1ª parcela apenas, sem renovações), sem duplicar o que já existe.
export const generateRoletaSpinsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { period_id: number; from: string; to: string }) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: sales, error } = await db
      .from("manual_sales")
      .select("id,seller_name,product,client_name,sale_date,roleta_type,installment_number,categoria_produto")
      .not("roleta_type", "is", null)
      .eq("installment_number", 1)
      .gte("sale_date", data.from)
      .lte("sale_date", data.to);
    if (error) throw new Error(error.message);

    const elegiveis = (sales ?? []).filter((s) => s.categoria_produto !== "RENOVACAO");
    if (elegiveis.length === 0) return { created: 0 };

    const { data: existing, error: e2 } = await db
      .from("bi_roleta_spins")
      .select("source_sale_id")
      .in("source_sale_id", elegiveis.map((s) => s.id));
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
