import { createFileRoute } from "@tanstack/react-router";

async function handleWebhook(request: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { supabaseAdmin: _sb } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = _sb as any;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const event = (body.event as string) ?? (body.type as string) ?? "unknown";

  await db.from("coach_integration_logs").insert({ event_type: event, payload: body, status: "received" });

  try {
    await processWebhookEvent(db, event, body);
    await db.from("coach_integration_logs")
      .update({ status: "processed" })
      .order("id", { ascending: false })
      .limit(1);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("coach_integration_logs")
      .update({ status: "error", error_msg: msg })
      .order("id", { ascending: false })
      .limit(1);
  }

  return Response.json({ ok: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processWebhookEvent(db: any, event: string, body: Record<string, unknown>) {
  const data = (body.data as Record<string, unknown>) ?? body;

  const clintConvId =
    (data.conversation_id as string) ??
    (data.conversationId as string) ??
    (data.attendance_id as string) ??
    (data.attendanceId as string) ??
    null;

  const dealId =
    (data.deal_id as string) ??
    (data.dealId as string) ??
    ((data.deal as Record<string, unknown>)?.id as string) ??
    null;

  const contact = (data.contact as Record<string, unknown>) ?? {};
  const seller = (data.user as Record<string, unknown>) ?? (data.seller as Record<string, unknown>) ?? {};
  const msg = (data.message as Record<string, unknown>) ?? (data.msg as Record<string, unknown>) ?? {};

  const contactName = (contact.name as string) ?? (data.lead_name as string) ?? null;
  const contactEmail = (contact.email as string) ?? null;
  const contactId = (contact.id as string) ?? null;
  const sellerName = (seller.full_name as string) ?? (seller.name as string) ?? (data.seller_name as string) ?? null;
  const sellerEmail = (seller.email as string) ?? (data.seller_email as string) ?? null;
  const originName = (data.origin_name as string) ?? ((data.origin as Record<string, unknown>)?.name as string) ?? null;
  const stage = (data.stage as string) ?? ((data.stage_data as Record<string, unknown>)?.name as string) ?? null;

  const isMessageEvent =
    event.includes("message") || event.includes("mensagem") ||
    (msg as Record<string, unknown>).content != null ||
    (msg as Record<string, unknown>).text != null ||
    (msg as Record<string, unknown>).body != null;

  if (!isMessageEvent || !clintConvId) return;

  // Upsert conversa via clint_conversation_id
  const { data: existing } = await db
    .from("coach_conversations")
    .select("id, message_count")
    .eq("clint_conversation_id", clintConvId)
    .maybeSingle();

  let conversationId: string;
  const now = new Date().toISOString();

  if (!existing) {
    const { data: newConv, error: ie } = await db.from("coach_conversations").insert({
      clint_conversation_id: clintConvId,
      clint_contact_id: contactId,
      deal_id: dealId,
      seller_name: sellerName,
      seller_email: sellerEmail,
      contact_name: contactName,
      contact_email: contactEmail,
      origin_name: originName,
      stage,
      source: "clint_webhook",
      first_message_at: now,
      last_message_at: now,
      message_count: 1,
    }).select("id").single();
    if (ie) throw new Error(ie.message);
    conversationId = newConv.id;
  } else {
    await db.from("coach_conversations")
      .update({
        last_message_at: now,
        message_count: (existing.message_count ?? 0) + 1,
        seller_name: sellerName ?? undefined,
        deal_id: dealId ?? undefined,
        stage: stage ?? undefined,
      })
      .eq("clint_conversation_id", clintConvId);
    conversationId = existing.id;
  }

  // Determina direção e conteúdo da mensagem
  const rawFrom = (msg.from as string) ?? (msg.author as string) ?? "";
  const direction: "inbound" | "outbound" =
    rawFrom === "contact" || rawFrom === "client" ? "inbound"
    : rawFrom === "user" || rawFrom === "seller" ? "outbound"
    : (data.author_type as string) === "client" ? "inbound"
    : "outbound";

  const senderName = direction === "inbound" ? contactName : sellerName;

  const body_ =
    (msg.content as string) ??
    (msg.text as string) ??
    (msg.body as string) ??
    (data.content as string) ??
    "";

  const sentAt =
    (msg.sent_at as string) ??
    (msg.timestamp as string) ??
    (msg.created_at as string) ??
    now;

  await db.from("coach_messages").insert({
    conversation_id: conversationId,
    clint_message_id: (msg.id as string) ?? null,
    sent_at: sentAt,
    direction,
    sender_name: senderName,
    body: body_,
  });
}

export const Route = createFileRoute("/api/clint/webhook")({
  server: {
    handlers: {
      POST: ({ request }) => handleWebhook(request),
      GET: () => Response.json({ ok: true, status: "webhook endpoint active" }),
    },
  },
});
