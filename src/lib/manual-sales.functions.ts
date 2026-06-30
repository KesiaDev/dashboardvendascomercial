import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
};

export const createManualSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    seller_name: string;
    product: string;
    funnel: string;
    value_eur: number;
    client_name?: string;
    client_email?: string;
    sale_date: string; // YYYY-MM-DD
    notes?: string;
  }) => {
    if (!d.seller_name || !d.product || !d.funnel) throw new Error("Campos obrigatórios faltando");
    if (!(d.value_eur >= 0)) throw new Error("Valor inválido");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.sale_date)) throw new Error("Data inválida");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    // Daily cutoff: a sale dated today can only be inserted before 23:59 BR time.
    const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (data.sale_date > today) throw new Error("Data não pode ser no futuro");

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
        client_email: data.client_email ?? null,
        sale_date: data.sale_date,
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row!.id };
  });

export const listManualSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string; to?: string }) => d ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("manual_sales")
      .select("id,seller_name,product,funnel,value_eur,client_name,client_email,sale_date,notes,created_at,created_by,created_by_email")
      .order("sale_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (data.from) q = q.gte("sale_date", data.from);
    if (data.to) q = q.lte("sale_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as (ManualSale & { created_by: string })[];
  });

export const updateManualSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    seller_name: string;
    product: string;
    funnel: string;
    value_eur: number;
    client_name?: string;
    client_email?: string;
    sale_date: string;
    notes?: string;
  }) => {
    if (!d.id) throw new Error("ID obrigatório");
    if (!d.seller_name || !d.product || !d.funnel) throw new Error("Campos obrigatórios faltando");
    if (!(d.value_eur >= 0)) throw new Error("Valor inválido");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.sale_date)) throw new Error("Data inválida");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("manual_sales")
      .update({
        seller_name: data.seller_name,
        product: data.product,
        funnel: data.funnel,
        value_eur: data.value_eur,
        client_name: data.client_name ?? null,
        client_email: data.client_email ?? null,
        sale_date: data.sale_date,
        notes: data.notes ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

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
