import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const PRODUCTS = [
  "Mentor Tráfego Pago 2.0 - AU",
  "Formação Gestor de Redes Sociais 2.0",
  "Renovação Mentoria",
  "Renovação Accelerator",
  "Master and Scale",
  "Programa Accelerator",
  "Estrategista de Infoprodutos",
  "Tráfego Master",
  "Outros",
] as const;

export const FUNNELS = [
  "PIPELINE_COMERCIAL-V3",
  "Master and Scale — LDP_03_MAS_MGT",
  "Funil - Sessão Estratégica",
  "SESSÃO ESTRATÉGICA",
  "MGM - Teste",
  "Funil de Indicações",
  "WGRS 1",
  "Renovação Mariana",
  "Funil Retomada de Leads Perdidos",
  "Funil Potencial Compra Futura",
  "Renovação",
  "Retrabalho Leads",
  "WGT - Perpétuo",
  "WGT-2",
  "CONVIDAR PARA IMERSÃO",
  "TESTE",
] as const;

export const SELLERS = [
  "Gisele Pimentel",
  "João Pessoa",
  "Fabio Nadal",
  "Rita Bandeira",
  "Luana Guimarães",
] as const;

export type RoletaType = "mentoria" | "accelerator";
export type BonusSemanalEur = 30 | 60;

export type ManualSale = {
  id: string;
  seller_name: string;
  product: string;
  funnel: string;
  value_eur: number;
  client_name: string | null;
  client_email: string | null;
  sale_date: string;
  notes: string | null;
  created_at: string;
  created_by_email: string;
  // Confirmação cruzada com Hotmart/Wise
  confirmation_status: string;
  confirmed_hotmart_sale_id: string | null;
  confirmed_hotmart_valor_brl: number | null;
  confirmed_wise_id: number | null;
  // Novos (fase 1)
  roleta_type: RoletaType | null;
  bonus_semanal_eur: BonusSemanalEur | null;
  affiliate_mismatch: boolean;
  hotmart_nome_afiliado: string | null;
  // Parcelamento (até 3x)
  installment_number: number;
  installment_total: number;
  parent_sale_id: string | null;
  installment_paid: boolean;
  installment_paid_at: string | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

// Normaliza email para comparação (trim + lowercase). Não altera acentos porque
// e-mails são ASCII por definição prática aqui.
function normEmail(e: string | null | undefined) {
  return (e ?? "").trim().toLowerCase();
}

// Extrai o primeiro nome normalizado (sem acento, minúsculo) — usado para
// comparar `nome_afiliado` (Hotmart) com `seller_name` (dashboard). Ex.:
// "Gisele Gagliano Pimentel" vs "Gisele Pimentel" → ambos "gisele".
function firstNameNorm(name: string | null | undefined) {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .split(/\s+/)[0] ?? "";
}

// Verdadeiro quando a Hotmart tem um afiliado que NÃO bate com o vendedor
// lançado no fechamento. Vendas com nome_afiliado vazio (link SCK sem afiliado
// direto) NÃO contam como divergência — é o caso comum.
function isAffiliateMismatch(sellerName: string, nomeAfiliado: string | null | undefined) {
  const afiliado = firstNameNorm(nomeAfiliado);
  if (!afiliado) return false;
  return firstNameNorm(sellerName) !== afiliado;
}

// ── Lookup por email ──────────────────────────────────────────────────────────

export type HotmartMatch = {
  id: string;
  email_cliente: string | null;
  nome_cliente: string | null;
  produto_original: string;
  produto_grupo: string;
  faturamento_liquido_brl: number | null;
  data_venda: string | null;
  nome_afiliado: string | null;
  status: string;
  moeda_original: string | null;
};

export const lookupByEmailFn = createServerFn({ method: "GET" })
  .inputValidator((d: { email: string; sale_date?: string }) => {
    if (!d.email || !d.email.includes("@")) throw new Error("Email inválido");
    return { email: normEmail(d.email), sale_date: d.sale_date };
  })
  .handler(async ({ data }) => {
    const db = await adminDb();
    // Janela de ±7 dias ao redor da data informada
    let q = db
      .from("sales")
      .select(
        "id,email_cliente,nome_cliente,produto_original,produto_grupo,faturamento_liquido_brl,data_venda,nome_afiliado,status,moeda_original",
      )
      .eq("email_cliente", data.email)
      .in("status", ["Aprovado", "Completo", "APPROVED"])
      .order("data_venda", { ascending: false })
      .limit(10);

    if (data.sale_date) {
      const d = new Date(data.sale_date);
      const from = new Date(d); from.setDate(d.getDate() - 7);
      const to = new Date(d); to.setDate(d.getDate() + 7);
      q = q
        .gte("data_venda", from.toISOString().slice(0, 10))
        .lte("data_venda", to.toISOString().slice(0, 10));
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as HotmartMatch[];
  });

// Busca match único (o mais recente na janela) para gravar na manual_sale.
async function findHotmartMatch(email: string, saleDate: string) {
  const db = await adminDb();
  const em = normEmail(email);
  if (!em) return null;
  const d = new Date(saleDate);
  const from = new Date(d); from.setDate(d.getDate() - 7);
  const to = new Date(d); to.setDate(d.getDate() + 7);
  const { data, error } = await db
    .from("sales")
    .select("id,faturamento_liquido_brl,nome_afiliado")
    .eq("email_cliente", em)
    .in("status", ["Aprovado", "Completo", "APPROVED"])
    .gte("data_venda", from.toISOString().slice(0, 10))
    .lte("data_venda", to.toISOString().slice(0, 10))
    .order("data_venda", { ascending: false })
    .limit(1);
  if (error) return null;
  return data?.[0] ?? null;
}

// ── Confirmar manualmente ─────────────────────────────────────────────────────

export const confirmManualSaleFn = createServerFn({ method: "POST" })
  .inputValidator((d: {
    id: string;
    status: "confirmado_hotmart" | "confirmado_wise" | "nao_encontrado" | "pendente";
    confirmed_hotmart_sale_id?: string | null;
    confirmed_hotmart_valor_brl?: number | null;
    confirmed_wise_id?: number | null;
  }) => {
    if (!d.id) throw new Error("ID obrigatório");
    return d;
  })
  .handler(async ({ data }) => {
    const db = await adminDb();
    const { error } = await db
      .from("manual_sales")
      .update({
        confirmation_status: data.status,
        confirmed_hotmart_sale_id: data.confirmed_hotmart_sale_id ?? null,
        confirmed_hotmart_valor_brl: data.confirmed_hotmart_valor_brl ?? null,
        confirmed_wise_id: data.confirmed_wise_id ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Criar venda ───────────────────────────────────────────────────────────────

export const createManualSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    seller_name: string;
    product: string;
    funnel: string;
    value_eur: number;
    client_name?: string;
    client_email: string;
    sale_date: string;
    notes?: string;
    roleta_type?: RoletaType | null;
    bonus_semanal_eur?: BonusSemanalEur | null;
    installment_total?: number;
  }) => {
    if (!d.seller_name || !d.product || !d.funnel) throw new Error("Campos obrigatórios faltando");
    if (!d.client_email || !d.client_email.includes("@")) throw new Error("E-mail do cliente obrigatório");
    if (!(d.value_eur >= 0)) throw new Error("Valor inválido");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.sale_date)) throw new Error("Data inválida");
    if (d.roleta_type && d.roleta_type !== "mentoria" && d.roleta_type !== "accelerator")
      throw new Error("roleta_type inválido");
    if (d.bonus_semanal_eur != null && d.bonus_semanal_eur !== 30 && d.bonus_semanal_eur !== 60)
      throw new Error("bonus_semanal_eur deve ser 30 ou 60");
    const inst = d.installment_total ?? 1;
    if (![1, 2, 3].includes(inst)) throw new Error("Parcelas deve ser 1, 2 ou 3");
    return { ...d, installment_total: inst, client_email: normEmail(d.client_email) };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (data.sale_date > today) throw new Error("Data não pode ser no futuro");

    const hotmartMatch = await findHotmartMatch(data.client_email, data.sale_date);
    const confirmationStatus = hotmartMatch ? "confirmado_hotmart" : "pendente";
    const affiliateMismatch = hotmartMatch
      ? isAffiliateMismatch(data.seller_name, hotmartMatch.nome_afiliado)
      : false;

    const base = {
      created_by: userId,
      created_by_email: (claims as any)?.email ?? "—",
      seller_name: data.seller_name,
      product: data.product,
      funnel: data.funnel,
      value_eur: data.value_eur,
      client_name: data.client_name ?? null,
      client_email: data.client_email,
      notes: data.notes ?? null,
      roleta_type: data.roleta_type ?? null,
      bonus_semanal_eur: data.bonus_semanal_eur ?? null,
      installment_total: data.installment_total,
    };

    // Parcela 1 — venda "pai", já paga, tenta confirmar no Hotmart
    const { data: parent, error } = await supabase
      .from("manual_sales")
      .insert({
        ...base,
        sale_date: data.sale_date,
        confirmation_status: confirmationStatus,
        confirmed_hotmart_sale_id: hotmartMatch?.id ?? null,
        confirmed_hotmart_valor_brl: hotmartMatch?.faturamento_liquido_brl ?? null,
        affiliate_mismatch: affiliateMismatch,
        hotmart_nome_afiliado: hotmartMatch?.nome_afiliado ?? null,
        installment_number: 1,
        installment_paid: true,
        installment_paid_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Parcelas 2..N — pendentes, agendadas +1, +2 meses
    if (data.installment_total > 1) {
      const [y, m, d] = data.sale_date.split("-").map(Number);
      const rows = [] as any[];
      for (let n = 2; n <= data.installment_total; n++) {
        const due = new Date(y, m - 1 + (n - 1), d);
        const dueIso = due.toISOString().slice(0, 10);
        rows.push({
          ...base,
          sale_date: dueIso,
          confirmation_status: "pendente",
          affiliate_mismatch: false,
          hotmart_nome_afiliado: null,
          installment_number: n,
          parent_sale_id: parent!.id,
          installment_paid: false,
        });
      }
      const { error: insErr } = await supabase.from("manual_sales").insert(rows);
      if (insErr) throw new Error(insErr.message);
    }

    return {
      ok: true,
      id: parent!.id,
      confirmation: confirmationStatus,
      hotmartMatch,
      affiliateMismatch,
      installments: data.installment_total,
    };
  });

// ── Marcar parcela como paga / pendente ──────────────────────────────────────

export const markInstallmentPaidFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; paid: boolean }) => {
    if (!d.id) throw new Error("ID obrigatório");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("manual_sales")
      .update({
        installment_paid: data.paid,
        installment_paid_at: data.paid ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Listar vendas ─────────────────────────────────────────────────────────────

const SALE_COLS =
  "id,seller_name,product,funnel,value_eur,client_name,client_email,sale_date,notes,created_at,created_by,created_by_email,confirmation_status,confirmed_hotmart_sale_id,confirmed_hotmart_valor_brl,confirmed_wise_id,roleta_type,bonus_semanal_eur,affiliate_mismatch,hotmart_nome_afiliado";

const SALE_COLS_ADMIN =
  "id,seller_name,product,funnel,value_eur,client_name,client_email,sale_date,notes,created_at,created_by_email,confirmation_status,confirmed_hotmart_sale_id,confirmed_hotmart_valor_brl,confirmed_wise_id,roleta_type,bonus_semanal_eur,affiliate_mismatch,hotmart_nome_afiliado";

export const listManualSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string; to?: string }) => d ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("manual_sales")
      .select(SALE_COLS)
      .order("sale_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (data.from) q = q.gte("sale_date", data.from);
    if (data.to) q = q.lte("sale_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as (ManualSale & { created_by: string })[];
  });

export const listManualSalesAdmin = createServerFn({ method: "GET" })
  .inputValidator((d: { from?: string; to?: string }) => d ?? {})
  .handler(async ({ data }) => {
    const db = await adminDb();
    let q = db
      .from("manual_sales")
      .select(SALE_COLS_ADMIN)
      .order("sale_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (data.from) q = q.gte("sale_date", data.from);
    if (data.to) q = q.lte("sale_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as ManualSale[];
  });


// ── Atualizar venda ───────────────────────────────────────────────────────────

export const updateManualSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    seller_name: string;
    product: string;
    funnel: string;
    value_eur: number;
    client_name?: string;
    client_email: string;
    sale_date: string;
    notes?: string;
    roleta_type?: RoletaType | null;
    bonus_semanal_eur?: BonusSemanalEur | null;
  }) => {
    if (!d.id) throw new Error("ID obrigatório");
    if (!d.seller_name || !d.product || !d.funnel) throw new Error("Campos obrigatórios faltando");
    if (!d.client_email || !d.client_email.includes("@")) throw new Error("E-mail do cliente obrigatório");
    if (!(d.value_eur >= 0)) throw new Error("Valor inválido");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.sale_date)) throw new Error("Data inválida");
    if (d.roleta_type && d.roleta_type !== "mentoria" && d.roleta_type !== "accelerator")
      throw new Error("roleta_type inválido");
    if (d.bonus_semanal_eur != null && d.bonus_semanal_eur !== 30 && d.bonus_semanal_eur !== 60)
      throw new Error("bonus_semanal_eur deve ser 30 ou 60");
    return { ...d, client_email: normEmail(d.client_email) };
  })
  .handler(async ({ data, context }) => {
    const hotmartMatch = await findHotmartMatch(data.client_email, data.sale_date);
    const affiliateMismatch = hotmartMatch
      ? isAffiliateMismatch(data.seller_name, hotmartMatch.nome_afiliado)
      : false;

    const { error } = await context.supabase
      .from("manual_sales")
      .update({
        seller_name: data.seller_name,
        product: data.product,
        funnel: data.funnel,
        value_eur: data.value_eur,
        client_name: data.client_name ?? null,
        client_email: data.client_email,
        sale_date: data.sale_date,
        notes: data.notes ?? null,
        confirmation_status: hotmartMatch ? "confirmado_hotmart" : "pendente",
        confirmed_hotmart_sale_id: hotmartMatch?.id ?? null,
        confirmed_hotmart_valor_brl: hotmartMatch?.faturamento_liquido_brl ?? null,
        roleta_type: data.roleta_type ?? null,
        bonus_semanal_eur: data.bonus_semanal_eur ?? null,
        affiliate_mismatch: affiliateMismatch,
        hotmart_nome_afiliado: hotmartMatch?.nome_afiliado ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Deletar venda ─────────────────────────────────────────────────────────────

export const deleteManualSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d.id) throw new Error("ID obrigatório");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("manual_sales").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Re-confirmar todas as pendentes (admin) ───────────────────────────────────

export const reconfirmAllPendingFn = createServerFn({ method: "POST" })
  .handler(async () => {
    const db = await adminDb();
    const { data: pending, error: pendingError } = await db
      .from("manual_sales")
      .select("id,client_email,sale_date,seller_name")
      .eq("confirmation_status", "pendente")
      .not("client_email", "is", null);
    if (pendingError) throw new Error(pendingError.message);

    let confirmed = 0;
    let mismatches = 0;
    for (const row of pending ?? []) {
      if (!row.client_email) continue;
      const match = await findHotmartMatch(row.client_email, row.sale_date);
      if (match) {
        const mismatch = isAffiliateMismatch(row.seller_name, match.nome_afiliado);
        if (mismatch) mismatches++;
        await db
          .from("manual_sales")
          .update({
            confirmation_status: "confirmado_hotmart",
            confirmed_hotmart_sale_id: match.id,
            confirmed_hotmart_valor_brl: match.faturamento_liquido_brl,
            affiliate_mismatch: mismatch,
            hotmart_nome_afiliado: match.nome_afiliado,
          })
          .eq("id", row.id);
        confirmed++;
      }
    }
    return { total: (pending ?? []).length, confirmed, mismatches };
  });
