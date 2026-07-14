import { createFileRoute } from "@tanstack/react-router";
import { mapProductToGroup } from "@/lib/product-groups";

// Webhook Hotmart → upsert em `sales`.
// Validação: query param ?hottok={HOTMART_WEBHOOK_TOKEN}.
export const Route = createFileRoute("/api/hotmart/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});

function mapEventToStatus(evt: string): string {
  const e = (evt || "").toUpperCase();
  if (e === "PURCHASE_APPROVED" || e === "PURCHASE_COMPLETE") return "Aprovado";
  if (e === "PURCHASE_REFUNDED") return "Reembolsado";
  if (e === "PURCHASE_CHARGEBACK") return "Chargeback";
  if (e === "PURCHASE_CANCELED" || e === "PURCHASE_CANCELLED") return "Cancelado";
  if (e === "PURCHASE_PROTEST" || e === "PURCHASE_DISPUTE") return "Dispute";
  if (e === "PURCHASE_BILLET_PRINTED" || e === "PURCHASE_OUT_OF_SHOPPING_CART") return "Aguardando pagamento";
  if (e === "PURCHASE_EXPIRED") return "Expirado";
  if (e === "PURCHASE_DELAYED") return "Vencido";
  return "Desconhecido";
}

function toIso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "number") return new Date(v).toISOString();
  const s = String(v);
  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 1e11) return new Date(asNum).toISOString();
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function extractProducerBRL(purchase: any): number | null {
  const commissions = purchase?.commissions;
  if (Array.isArray(commissions)) {
    const producer = commissions.find((c: any) => {
      const src = String(c?.source ?? c?.role ?? "").toUpperCase();
      return src.includes("PRODUCER");
    });
    if (producer) {
      const v = Number(producer?.value);
      const cur = String(producer?.currency_value ?? producer?.currency_code ?? "").toUpperCase();
      if (Number.isFinite(v) && cur === "BRL") return v;
      const ex = Number(producer?.exchange?.value);
      if (Number.isFinite(ex)) return ex;
    }
  } else if (commissions && typeof commissions === "object") {
    const producer = (commissions as any).producer;
    if (producer) {
      const v = Number(producer?.value);
      if (Number.isFinite(v)) return v;
    }
  }
  return null;
}

async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("hottok");
    const expected = process.env.HOTMART_WEBHOOK_TOKEN;
    if (!expected || token !== expected) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const payload: any = await request.json();
    const event: string = payload?.event ?? payload?.name ?? "";
    const data: any = payload?.data ?? payload;
    const purchase: any = data?.purchase ?? {};
    const product: any = data?.product ?? {};
    const buyer: any = data?.buyer ?? {};
    const affiliates: any[] = data?.affiliates ?? [];

    const transacao: string | undefined =
      purchase?.transaction ?? purchase?.order_ref ?? data?.transaction;
    if (!transacao) {
      console.warn("[Hotmart webhook] payload sem transacao", { event });
      return new Response(JSON.stringify({ ok: false, error: "missing transaction" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const produto_original = String(product?.name ?? "").trim() || "—";
    const currency =
      purchase?.price?.currency_value ?? purchase?.price?.currency_code ?? null;
    const priceVal = Number(purchase?.price?.value);
    const offerVal = Number(purchase?.offer?.value ?? purchase?.price?.value);
    const installments = Number(
      purchase?.payment?.installments_number ?? purchase?.payment?.installments ?? 0,
    );

    const row = {
      transacao: String(transacao),
      produto_original,
      produto_grupo: mapProductToGroup(produto_original),
      status: mapEventToStatus(event),
      data_venda: toIso(purchase?.order_date ?? purchase?.date_purchase ?? data?.date_purchase),
      data_confirmacao: toIso(purchase?.approved_date),
      moeda_original: currency ? String(currency) : null,
      preco_oferta: Number.isFinite(offerVal) ? offerVal : null,
      preco_total: Number.isFinite(priceVal) ? priceVal : null,
      faturamento_liquido_brl: extractProducerBRL(purchase),
      meio_pagamento: purchase?.payment?.type ?? null,
      nome_cliente: buyer?.name ?? null,
      email_cliente: buyer?.email ? String(buyer.email).trim().toLowerCase() : null,
      pais: buyer?.address?.country ?? null,
      estado: buyer?.address?.state ?? null,
      cidade: buyer?.address?.city ?? null,
      numero_parcela: Number.isFinite(installments) && installments > 0 ? installments : null,
      cupom: purchase?.offer?.code ?? null,
      origem_checkout: purchase?.offer?.key ?? purchase?.tracking?.source_sck ?? null,
      nome_afiliado: affiliates?.[0]?.name ?? null,
      raw: payload,
      updated_at: new Date().toISOString(),
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("sales").upsert(row, { onConflict: "transacao" });
    if (error) {
      console.error("[Hotmart webhook] upsert error", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    console.log("[Hotmart webhook]", event, transacao);
    return new Response(JSON.stringify({ ok: true, transacao }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    console.error("[Hotmart webhook] fail", e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
