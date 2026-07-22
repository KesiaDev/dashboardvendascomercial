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

export type ReferralLocale = "pt-BR" | "pt-PT";

export function buildReferralMessage(params: {
  clientName: string;
  sellerName: string;
  locale?: ReferralLocale;
}) {
  const first = params.clientName.trim().split(/\s+/)[0] || params.clientName;
  if (params.locale === "pt-PT") {
    return `Olá ${first}! 🎉

Foi um prazer ter-te connosco e parabéns pela decisão de investires no teu crescimento — tenho a certeza que os resultados vão chegar rápido.

Uma coisa que faz muita diferença por cá: os nossos melhores alunos quase sempre chegaram por indicação de quem já vive esta experiência. Por isso queria pedir-te uma coisa rápida.

Conheces 3 a 5 pessoas (amigos, sócios, clientes ou pessoas do teu networking) que também pudessem beneficiar das nossas mentorias e formações?

Se sim, envia-me por favor:
• Nome
• WhatsApp
• Um contexto rápido (o que faz / porque faria sentido)

Prometo tratar cada indicação com o mesmo cuidado com que te tratei — sem pressão, apenas uma conversa de valor.

Obrigado pela confiança!
${params.sellerName}`;
  }
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

export function buildReferralMessageNaoFechou(params: {
  clientName: string;
  sellerName: string;
  locale?: ReferralLocale;
}) {
  const first = params.clientName.trim().split(/\s+/)[0] || params.clientName;
  if (params.locale === "pt-PT") {
    return `Olá ${first}, tudo bem? 🙌

Passo por aqui só para agradecer, a sério, pela tua abertura na nossa conversa. Sei que agora não foi o momento certo para seguires connosco — e está tudo bem, cada um tem o seu tempo. Fica o convite em aberto para quando fizer sentido: vou estar por cá.

Entretanto, posso pedir-te um favor rápido? Boa parte das pessoas que ajudamos a destravar o negócio chegou por indicação de alguém que viu valor no nosso trabalho — mesmo sem ter fechado na altura.

Conheces 3 a 5 pessoas (amigos, sócios, clientes ou pessoas do teu networking) que estejam a querer crescer com marketing, vendas ou tráfego e que fizessem sentido para uma conversa como a que tivemos?

Se sim, envia-me por favor:
• Nome
• WhatsApp
• Um contexto rápido (o que faz / porque achas que faz sentido)

Prometo tratar cada indicação com o mesmo cuidado e sem pressão nenhuma — é só uma conversa de valor, igual à nossa.

Muito obrigado pela força! 🚀
${params.sellerName}`;
  }
  return `Oi ${first}, tudo bem? 🙌

Passando aqui só pra agradecer de verdade pela sua abertura na nossa conversa. Sei que agora não foi o momento certo pra seguir com a gente — e tá tudo bem, cada um tem o seu tempo. Fica o convite em aberto pra quando fizer sentido: vou estar por aqui.

Enquanto isso, posso te pedir um favor rápido? Boa parte das pessoas que a gente ajuda a destravar o negócio chegou por indicação de alguém que enxergou valor no nosso trabalho — mesmo sem ter fechado na hora.

Você conhece 3 a 5 pessoas (amigos, sócios, clientes ou pessoas do seu networking) que estejam buscando crescer com marketing, vendas ou tráfego e que fariam sentido pra uma conversa como a que tivemos?

Se sim, me manda por favor:
• Nome
• WhatsApp
• Um contexto rápido (o que faz / por que acha que faz sentido)

Prometo tratar cada indicação com o mesmo cuidado e sem pressão nenhuma — é só uma conversa de valor, igual à nossa.

Muito obrigado pela força! 🚀
${params.sellerName}`;
}

