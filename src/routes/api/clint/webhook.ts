import { createFileRoute } from "@tanstack/react-router";

function parseMeetingDatetime(str: string): Date | null {
  // "Terça-feira 22/07 às 14h00" or "Segunda 21/07 às 09h00"
  const match = str.match(/(\d{1,2})\/(\d{1,2})\s+às\s+(\d{1,2})h(\d{2})/);
  if (!match) return null;
  const [, dayStr, monthStr, hourStr, minStr] = match;
  const year = new Date().getFullYear();
  // Europe/Lisbon: UTC+1 in summer
  return new Date(Date.UTC(year, parseInt(monthStr, 10) - 1, parseInt(dayStr, 10), parseInt(hourStr, 10) - 1, parseInt(minStr, 10)));
}

function detectEventType(body: Record<string, unknown>): string {
  const top =
    (body.event as string) ??
    (body.type as string) ??
    (body.trigger as string) ??
    (body.action as string) ??
    null;
  if (top && top !== "object" && top !== "undefined") return top;

  const data = (body.data as Record<string, unknown>) ?? {};
  const fromData =
    (data.event_type as string) ??
    (data.event as string) ??
    (data.type as string) ??
    null;
  if (fromData) return fromData;

  const msg = (data.message ?? data.msg ?? body.message ?? body.msg) as Record<string, unknown> | null;
  const hasMsg = msg != null && ((msg.content ?? msg.text ?? msg.body) != null);
  const hasStage =
    data.deal_stage != null || data.stage != null || data.old_stage != null || body.deal_stage != null;

  if (hasStage) return "stage_change";
  if (hasMsg) return "message";
  return "webhook_event";
}

function extractExternalId(body: Record<string, unknown>): string | null {
  const data = (body.data as Record<string, unknown>) ?? {};
  return (
    (body.event_id as string) ??
    (body.id as string) ??
    (data.id as string) ??
    (data.event_id as string) ??
    ((data.message as Record<string, unknown>)?.id as string) ??
    null
  );
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

async function detectAuthor(
  db: any,
  msgFrom: string,
  contactPhone: string | null,
  direction: "inbound" | "outbound",
): Promise<"cliente" | "vendedor" | "pendente_revisao"> {
  const f = msgFrom.toLowerCase().trim();
  if (f === "contact" || f === "client") return "cliente";
  if (f === "user" || f === "seller" || f === "agent") return "vendedor";

  const fromPhone = normalizePhone(msgFrom);

  if (fromPhone.length >= 8) {
    const { data: cfg } = await db
      .from("coach_config")
      .select("seller_phones")
      .eq("id", 1)
      .maybeSingle();

    const sellerPhones: Array<{ name?: string; phone: string }> = cfg?.seller_phones ?? [];
    for (const sp of sellerPhones) {
      const spNorm = normalizePhone(sp.phone ?? "");
      if (spNorm.length >= 8 && fromPhone.slice(-8) === spNorm.slice(-8)) return "vendedor";
    }

    if (contactPhone) {
      const cpNorm = normalizePhone(contactPhone);
      if (cpNorm.length >= 8 && fromPhone.slice(-8) === cpNorm.slice(-8)) return "cliente";
    }

    return "pendente_revisao";
  }

  return direction === "inbound" ? "cliente" : "vendedor";
}

async function triggerAnalysisAsync(conversationId: string) {
  try {
    const { analyzeConversationCore } = await import("@/lib/coach.functions");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await analyzeConversationCore(supabaseAdmin as any, conversationId, false, "stage_change");
  } catch {}
}

async function handleWebhook(request: Request) {
  const { supabaseAdmin: _sb } = await import("@/integrations/supabase/client.server");
  const db = _sb as any;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const event = detectEventType(body);
  const externalId = extractExternalId(body);

  let rawId: number | null = null;
  if (externalId) {
    const { data: rawRow, error: dupErr } = await db
      .from("clint_events_raw")
      .insert({ external_id: externalId, event_type: event, payload: body })
      .select("id")
      .single();

    if (dupErr) {
      if (dupErr.code === "23505") {
        return Response.json({ ok: true, duplicate: true });
      }
    } else {
      rawId = rawRow?.id ?? null;
    }
  } else {
    const { data: rawRow } = await db
      .from("clint_events_raw")
      .insert({ event_type: event, payload: body })
      .select("id")
      .single();
    rawId = rawRow?.id ?? null;
  }

  const { data: logRow } = await db
    .from("coach_integration_logs")
    .insert({ event_type: event, payload: body, status: "received" })
    .select("id")
    .single();
  const logId = logRow?.id ?? null;

  let stageConversationId: string | null = null;
  try {
    const result = await processWebhookEvent(db, event, body);
    stageConversationId = result?.stageConversationId ?? null;

    if (rawId) await db.from("clint_events_raw").update({ status: "processed" }).eq("id", rawId);
    if (logId) await db.from("coach_integration_logs").update({ status: "processed" }).eq("id", logId);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (rawId) await db.from("clint_events_raw").update({ status: "error", error_msg: msg }).eq("id", rawId);
    if (logId) await db.from("coach_integration_logs").update({ status: "error", error_msg: msg }).eq("id", logId);
  }

  if (stageConversationId) {
    triggerAnalysisAsync(stageConversationId).catch(() => {});
  }

  return Response.json({ ok: true });
}

async function processWebhookEvent(
  db: any,
  event: string,
  body: Record<string, unknown>,
): Promise<{ stageConversationId: string | null }> {
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
  const msg =
    (data.message as Record<string, unknown>) ??
    (data.msg as Record<string, unknown>) ??
    (body.message as Record<string, unknown>) ??
    {};

  const contactName =
    (contact.name as string) ?? (data.contact_name as string) ?? (data.lead_name as string) ?? null;
  const contactPhone =
    (contact.phone as string) ?? (contact.mobile as string) ?? (data.contact_phone as string) ?? null;
  const contactId = (contact.id as string) ?? null;
  const contactEmail = (contact.email as string) ?? (data.contact_email as string) ?? null;

  const sellerName =
    (seller.full_name as string) ??
    (seller.name as string) ??
    (data.deal_user as string) ??
    (data.seller_name as string) ??
    null;
  const sellerEmail =
    (seller.email as string) ??
    (data.seller_email as string) ??
    (data.deal_user as string) ??
    null;

  const originName =
    (data.origin_name as string) ??
    ((data.origin as Record<string, unknown>)?.name as string) ??
    null;
  const stage =
    (data.deal_stage as string) ??
    (data.stage as string) ??
    ((data.stage_data as Record<string, unknown>)?.name as string) ??
    (data.new_stage as string) ??
    null;

  const msgContent =
    (msg.content as string) ?? (msg.text as string) ?? (msg.body as string) ?? (data.content as string) ?? null;

  const hasMessageContent = msgContent != null;
  const isMessageEvent = event.includes("message") || event.includes("mensagem") || hasMessageContent;
  const isStageEvent =
    event.includes("stage") || event.includes("etapa") || event === "stage_change" || (stage != null && !hasMessageContent);

  const contactKey = contactEmail ?? contactPhone ?? null;
  if (!clintConvId && !dealId && !contactKey) return { stageConversationId: null };
  if (!isMessageEvent && !isStageEvent) return { stageConversationId: null };

  const now = new Date().toISOString();
  let conversationId: string | null = null;

  // Resolve deal_id + origin_name via contact_id quando o payload não trouxe
  // (garante que "Atendimentos" possa ser filtrado por Pipeline Comercial V3)
  let resolvedDealId: string | null = dealId;
  let resolvedOriginName: string | null = originName;
  if ((!resolvedDealId || !resolvedOriginName) && contactId) {
    const { data: matches } = await db
      .from("clint_deals")
      .select("id,origin_name,created_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(20);
    const list = (matches ?? []) as Array<{ id: string; origin_name: string | null; created_at: string | null }>;
    const preferred =
      list.find((d) => d.origin_name === "PIPELINE_COMERCIAL-V3") ?? list[0] ?? null;
    if (preferred) {
      resolvedDealId = resolvedDealId ?? preferred.id;
      resolvedOriginName = resolvedOriginName ?? preferred.origin_name;
    }
  }



  // Detect meeting confirmed by AI agent (n8n posts stage_change with meeting_datetime)
  if (isStageEvent && stage && /reuni[aã]o/i.test(stage)) {
    const meetingDatetimeStr = (data.meeting_datetime as string) ?? null;
    if (meetingDatetimeStr) {
      const scheduledAt = parseMeetingDatetime(meetingDatetimeStr);
      if (scheduledAt) {
        await db.from("seller_agenda").insert({
          seller_email: sellerEmail ?? "kesia@llmidiaco.com",
          lead_name: contactName ?? "Lead",
          lead_phone: contactPhone,
          scheduled_at: scheduledAt.toISOString(),
          duration_min: 30,
          meeting_type: "consultoria",
          source: "agente_ia",
          clint_deal_id: resolvedDealId,
          status: "agendado",
          notes: meetingDatetimeStr,
        });
      }
    }
  }

  if (clintConvId) {
    const { data: existing } = await db
      .from("coach_conversations")
      .select("id, message_count")
      .eq("clint_conversation_id", clintConvId)
      .maybeSingle();

    if (!existing) {
      const { data: newConv, error: ie } = await db
        .from("coach_conversations")
        .insert({
          clint_conversation_id: clintConvId,
          clint_contact_id: contactId,
          deal_id: resolvedDealId,
          seller_name: sellerName,
          seller_email: sellerEmail,
          contact_name: contactName,
          contact_email: contactEmail,
          origin_name: resolvedOriginName,
          stage,
          source: "clint",
          first_message_at: now,
          last_message_at: now,
          message_count: hasMessageContent ? 1 : 0,
        })
        .select("id")
        .single();
      if (ie) throw new Error(ie.message);
      conversationId = newConv.id;
    } else {
      await db
        .from("coach_conversations")
        .update({
          last_message_at: hasMessageContent ? now : undefined,
          message_count: hasMessageContent ? (existing.message_count ?? 0) + 1 : undefined,
          seller_name: sellerName ?? undefined,
          deal_id: resolvedDealId ?? undefined,
          stage: stage ?? undefined,
        })
        .eq("clint_conversation_id", clintConvId);
      conversationId = existing.id;
    }
  } else if (dealId) {
    const { data: existing } = await db
      .from("coach_conversations")
      .select("id")
      .eq("deal_id", dealId)
      .eq("source", "clint")
      .maybeSingle();

    if (existing) {
      conversationId = existing.id;
      if (stage) {
        await db
          .from("coach_conversations")
          .update({ stage, seller_name: sellerName ?? undefined })
          .eq("id", existing.id);
      }
    } else {
      const { data: newConv, error: ie } = await db
        .from("coach_conversations")
        .insert({
          deal_id: resolvedDealId,
          seller_name: sellerName,
          seller_email: sellerEmail,
          contact_name: contactName,
          contact_email: contactEmail,
          origin_name: resolvedOriginName,
          stage,
          source: "clint",
          first_message_at: now,
          last_message_at: now,
          message_count: 0,
        })
        .select("id")
        .single();
      if (!ie && newConv) conversationId = newConv.id;
    }
  } else if (contactKey) {
    // Payload sem deal_id/conversation_id — chave por contact_email
    if (!contactEmail) return { stageConversationId: null };
    const { data: existing } = await db
      .from("coach_conversations")
      .select("id")
      .eq("source", "clint")
      .eq("contact_email", contactEmail)
      .maybeSingle();

    if (existing) {
      conversationId = existing.id;
      await db
        .from("coach_conversations")
        .update({
          stage: stage ?? undefined,
          seller_name: sellerName ?? undefined,
          seller_email: sellerEmail ?? undefined,
          contact_name: contactName ?? undefined,
          last_message_at: hasMessageContent ? now : undefined,
        })
        .eq("id", existing.id);
    } else {
      const { data: newConv, error: ie } = await db
        .from("coach_conversations")
        .insert({
          seller_name: sellerName,
          seller_email: sellerEmail,
          contact_name: contactName,
          contact_email: contactEmail,
          origin_name: resolvedOriginName,
          stage,
          source: "clint",
          first_message_at: now,
          last_message_at: now,
          message_count: 0,
        })
        .select("id")
        .single();
      if (!ie && newConv) conversationId = newConv.id;
    }
  }

  if (!conversationId) return { stageConversationId: null };

  if (hasMessageContent) {
    const rawFrom =
      (msg.from as string) ?? (msg.author as string) ?? (msg.sender as string) ?? "";

    const directionHint: "inbound" | "outbound" =
      rawFrom === "contact" || rawFrom === "client" || (data.author_type as string) === "client"
        ? "inbound"
        : rawFrom === "user" || rawFrom === "seller" || rawFrom === "agent"
          ? "outbound"
          : "outbound";

    const author = await detectAuthor(db, rawFrom, contactPhone, directionHint);
    const direction: "inbound" | "outbound" = author === "cliente" ? "inbound" : "outbound";
    const senderName = direction === "inbound" ? contactName : sellerName;
    const sentAt = (msg.sent_at as string) ?? (msg.timestamp as string) ?? (msg.created_at as string) ?? now;
    const clintMsgId = (msg.id as string) ?? null;

    if (clintMsgId) {
      const { data: existingMsg } = await db
        .from("coach_messages")
        .select("id")
        .eq("clint_message_id", clintMsgId)
        .maybeSingle();
      if (existingMsg) return { stageConversationId: null };
    }

    await db.from("coach_messages").insert({
      conversation_id: conversationId,
      clint_message_id: clintMsgId,
      sent_at: sentAt,
      direction,
      sender_name: senderName,
      body: msgContent,
      author,
      seller_id: sellerEmail ?? sellerName ?? null,
      lead_phone: contactPhone,
    });
  }

  return {
    stageConversationId: isStageEvent && !hasMessageContent ? conversationId : null,
  };
}

export const Route = createFileRoute("/api/clint/webhook")({
  server: {
    handlers: {
      POST: ({ request }) => handleWebhook(request),
      GET: () => Response.json({ ok: true, status: "webhook endpoint active" }),
    },
  },
});
