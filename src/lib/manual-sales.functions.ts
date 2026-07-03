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
  "Funil - Sessão Estratégica",
  "SESSÃO ESTRATÉGICA",
  "MGM - Teste",
  "Funil de Indicações",
  "WGRS 1",
  "Renovação Mariana",
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
};

// ── Lookup por email ──────────────────────────────────────────────────────────
// Busca na tabela sales (Hotmart) pelo email do cliente
// Retorna as vendas aprovadas mais próximas da data informada

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
    return d;
  })
  .handler(async ({ data }) => {
    const db = await adminDb();
    // Janela de ±7 dias ao redor da data informada
    let q = db
      .from("sales")
      .select("id,email_cliente,nome_cliente,produto_original,produto_grupo,faturamento_liquido_brl,data_venda,nome_afiliado,status,moeda_original")
      .or(`email_cliente.eq.${data.email},contact_email.eq.${data.email}`)
      .in("status", ["Aprovado", "Completo", "APPROVED"])
      .order("data_venda", { ascending: false })
      .limit(10);

    if (data.sale_date) {
      // Janela de 7 dias antes e 7 dias depois
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

// ── Confirmar manualmente ─────────────────────────────────────────────────────
// Admin pode marcar como confirmado / não encontrado

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
    client_email: string; // obrigatório
    sale_date: string;
    notes?: string;
  }) => {
    if (!d.seller_name || !d.product || !d.funnel) throw new Error("Campos obrigatórios faltando");
    if (!d.client_email || !d.client_email.includes("@")) throw new Error("E-mail do cliente obrigatório");
    if (!(d.value_eur >= 0)) throw new Error("Valor inválido");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.sale_date)) throw new Error("Data inválida");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (data.sale_date > today) throw new Error("Data não pode ser no futuro");

    // Tenta confirmar automaticamente buscando na Hotmart pelo email
    const db = await adminDb();
    const windowFrom = new Date(data.sale_date);
    const windowTo = new Date(data.sale_date);
    windowFrom.setDate(windowFrom.getDate() - 7);
    windowTo.setDate(windowTo.getDate() + 7);

    const { data: hotmartMatches } = await db
      .from("sales")
      .select("id,faturamento_liquido_brl,data_venda,produto_grupo,nome_afiliado,status")
      .or(`email_cliente.eq.${data.client_email},contact_email.eq.${data.client_email}`)
      .in("status", ["Aprovado", "Completo", "APPROVED"])
      .gte("data_venda", windowFrom.toISOString().slice(0, 10))
      .lte("data_venda", windowTo.toISOString().slice(0, 10))
      .limit(1);

    const hotmartMatch = hotmartMatches?.[0] ?? null;
    const confirmationStatus = hotmartMatch ? "confirmado_hotmart" : "pendente";

    const { data: row, error } = await supabase
      .from("manual_sales")
      .insert({
        created_by: userId,
        created_by_email: (claims as any)?.email ?? "—",
        seller_name: data.seller_name,
        product: data.product,
        funnel: data.funnel,
        value_eur: data.value_eur,
        client_name: data.client_name ?? null,
        client_email: data.client_email,
        sale_date: data.sale_date,
        notes: data.notes ?? null,
        confirmation_status: confirmationStatus,
        confirmed_hotmart_sale_id: hotmartMatch?.id ?? null,
        confirmed_hotmart_valor_brl: hotmartMatch?.faturamento_liquido_brl ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row!.id, confirmation: confirmationStatus, hotmartMatch };
  });

// ── Listar vendas ─────────────────────────────────────────────────────────────

export const listManualSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string; to?: string }) => d ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("manual_sales")
      .select("id,seller_name,product,funnel,value_eur,client_name,client_email,sale_date,notes,created_at,created_by,created_by_email,confirmation_status,confirmed_hotmart_sale_id,confirmed_hotmart_valor_brl,confirmed_wise_id")
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
      .select("id,seller_name,product,funnel,value_eur,client_name,client_email,sale_date,notes,created_at,created_by_email,confirmation_status,confirmed_hotmart_sale_id,confirmed_hotmart_valor_brl,confirmed_wise_id")
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
  }) => {
    if (!d.id) throw new Error("ID obrigatório");
    if (!d.seller_name || !d.product || !d.funnel) throw new Error("Campos obrigatórios faltando");
    if (!d.client_email || !d.client_email.includes("@")) throw new Error("E-mail do cliente obrigatório");
    if (!(d.value_eur >= 0)) throw new Error("Valor inválido");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.sale_date)) throw new Error("Data inválida");
    return d;
  })
  .handler(async ({ data, context }) => {
    // Re-tenta confirmação automática se email mudou
    const db = await adminDb();
    const windowFrom = new Date(data.sale_date);
    const windowTo = new Date(data.sale_date);
    windowFrom.setDate(windowFrom.getDate() - 7);
    windowTo.setDate(windowTo.getDate() + 7);

    const { data: hotmartMatches } = await db
      .from("sales")
      .select("id,faturamento_liquido_brl")
      .or(`email_cliente.eq.${data.client_email},contact_email.eq.${data.client_email}`)
      .in("status", ["Aprovado", "Completo", "APPROVED"])
      .gte("data_venda", windowFrom.toISOString().slice(0, 10))
      .lte("data_venda", windowTo.toISOString().slice(0, 10))
      .limit(1);

    const hotmartMatch = hotmartMatches?.[0] ?? null;

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
// Roda em batch: busca todas as manual_sales pendentes e tenta confirmar no Hotmart

export const reconfirmAllPendingFn = createServerFn({ method: "POST" })
  .handler(async () => {
    const db = await adminDb();
    const { data: pending, error: pendingError } = await db
      .from("manual_sales")
      .select("id,client_email,sale_date")
      .eq("confirmation_status", "pendente")
      .not("client_email", "is", null);
    if (pendingError) throw new Error(pendingError.message);

    let confirmed = 0;
    for (const row of pending ?? []) {
      if (!row.client_email) continue;
      const windowFrom = new Date(row.sale_date);
      const windowTo = new Date(row.sale_date);
      windowFrom.setDate(windowFrom.getDate() - 7);
      windowTo.setDate(windowTo.getDate() + 7);

      const { data: matches } = await db
        .from("sales")
        .select("id,faturamento_liquido_brl")
        .or(`email_cliente.eq.${row.client_email},contact_email.eq.${row.client_email}`)
        .in("status", ["Aprovado", "Completo", "APPROVED"])
        .gte("data_venda", windowFrom.toISOString().slice(0, 10))
        .lte("data_venda", windowTo.toISOString().slice(0, 10))
        .limit(1);

      const match = matches?.[0];
      if (match) {
        await db
          .from("manual_sales")
          .update({
            confirmation_status: "confirmado_hotmart",
            confirmed_hotmart_sale_id: match.id,
            confirmed_hotmart_valor_brl: match.faturamento_liquido_brl,
          })
          .eq("id", row.id);
        confirmed++;
      }
    }
    return { total: (pending ?? []).length, confirmed };
  });
