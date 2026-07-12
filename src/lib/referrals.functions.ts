import { createServerFn } from "@tanstack/react-start";

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const REFERRAL_STATUSES = [
  "novo",
  "contactado",
  "em_negociacao",
  "convertido",
  "perdido",
] as const;

export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export type Referral = {
  id: string;
  seller_name: string;
  seller_email: string | null;
  client_name: string;
  client_email: string | null;
  referred_name: string;
  referred_phone: string | null;
  referred_email: string | null;
  product_interest: string | null;
  notes: string | null;
  status: ReferralStatus;
  source_sale_id: string | null;
  contacted_at: string | null;
  converted_at: string | null;
  converted_value_eur: number | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
};

export const listReferralsFn = createServerFn({ method: "GET" }).handler(async () => {
  const db = await adminDb();
  const { data, error } = await db
    .from("referrals")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Referral[];
});

export const createReferralFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as {
    seller_name: string;
    client_name: string;
    client_email?: string | null;
    referred_name: string;
    referred_phone?: string | null;
    referred_email?: string | null;
    product_interest?: string | null;
    notes?: string | null;
    source_sale_id?: string | null;
    created_by_email?: string | null;
  })
  .handler(async ({ data }) => {
    const db = await adminDb();
    const { data: row, error } = await db
      .from("referrals")
      .insert({
        seller_name: data.seller_name,
        client_name: data.client_name,
        client_email: data.client_email ?? null,
        referred_name: data.referred_name,
        referred_phone: data.referred_phone ?? null,
        referred_email: data.referred_email ?? null,
        product_interest: data.product_interest ?? null,
        notes: data.notes ?? null,
        source_sale_id: data.source_sale_id ?? null,
        created_by_email: data.created_by_email ?? null,
        status: "novo",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as Referral;
  });

export const updateReferralStatusFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as {
    id: string;
    status: ReferralStatus;
    converted_value_eur?: number | null;
  })
  .handler(async ({ data }) => {
    const db = await adminDb();
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "contactado") patch.contacted_at = new Date().toISOString();
    if (data.status === "convertido") {
      patch.converted_at = new Date().toISOString();
      if (data.converted_value_eur != null) patch.converted_value_eur = data.converted_value_eur;
    }
    const { error } = await db.from("referrals").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteReferralFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const db = await adminDb();
    const { error } = await db.from("referrals").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export function buildReferralMessage(params: {
  clientName: string;
  sellerName: string;
}) {
  const first = params.clientName.trim().split(/\s+/)[0] || params.clientName;
  return `Olá ${first}! 🎉

Foi um prazer ter você conosco e parabéns pela decisão de investir no seu crescimento — tenho certeza que os resultados virão rápido.

Uma coisa que faz muita diferença aqui: os nossos melhores alunos quase sempre chegaram por indicação de quem já vive essa experiência. Por isso queria te fazer um pedido rápido.

Você conhece 3 a 5 pessoas (amigos, sócios, clientes ou pessoas do seu networking) que também poderiam se beneficiar das nossas mentorias e formações?

Se sim, me envia por favor:
• Nome
• WhatsApp
• Um contexto rápido (o que faz / por que faria sentido)

Prometo tratar cada indicação com o mesmo cuidado que tratei você — sem pressão, apenas uma conversa de valor.

Obrigado pela confiança!
${params.sellerName}`;
}
