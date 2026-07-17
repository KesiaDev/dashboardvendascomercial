import { createFileRoute } from "@tanstack/react-router";

const CLINT_TOKEN =
  "U2FsdGVkX1/+cRRyndTOhUIUwrP9MLbU/pM4+wyGr6pd68sPVDQFME2bhHkzBOhNMyoyNjzI8YycBlOq2I98PA==";
const ORIGIN_IDS = [
  "07fc7c4b-82d2-427d-b09e-04a7f90f16f1",
  "8c159581-ba93-4fad-a909-f4e204d6faaf",
];
const PERIOD_START = "2026-06-29T00:00:00Z";
const PERIOD_END = "2026-07-14T00:00:00Z";

async function clintGet(path: string) {
  const res = await fetch(`https://api.clint.digital${path}`, {
    headers: { "api-token": CLINT_TOKEN, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Clint ${path} ${res.status}`);
  return res.json();
}

function extractText(msg: any): string {
  if (typeof msg.content === "string" && msg.content.trim()) return msg.content;
  const comps = msg.content_action?.components;
  if (Array.isArray(comps)) {
    for (const c of comps) {
      if (c?.formatted_text) return c.formatted_text;
      if (c?.text) return c.text;
    }
  }
  if (msg.content_object?.template_name)
    return `[template: ${msg.content_object.template_name}]`;
  if (msg.content_type && msg.content_type !== "TEXT")
    return `[${msg.content_type}]`;
  return "[sem texto]";
}

async function runBackfill() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  // Users map for seller name/email
  const { data: users } = await db
    .from("clint_users")
    .select("id, email, first_name, last_name");
  const userMap = new Map<string, { email: string | null; name: string | null }>();
  for (const u of users ?? []) {
    userMap.set(u.id, {
      email: u.email,
      name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || null,
    });
  }

  // Deals in window
  const { data: deals, error: dErr } = await db
    .from("clint_deals")
    .select(
      "id, contact_id, contact_name, contact_email, contact_phone, user_id, user_email, user_name, origin_id, origin_name, stage, status, value, won_at, created_at",
    )
    .in("origin_id", ORIGIN_IDS)
    .in("status", ["OPEN", "WON", "LOST"])
    .gte("created_at", PERIOD_START)
    .lt("created_at", PERIOD_END);
  if (dErr) throw new Error(`deals query: ${dErr.message}`);

  let processed = 0;
  let inserted = 0;
  let skipped = 0;
  const errors: Array<{ deal_id: string; error: string }> = [];

  const periodStartMs = Date.parse(PERIOD_START);
  const periodEndMs = Date.parse(PERIOD_END);

  for (const deal of deals ?? []) {
    processed++;
    try {
      if (!deal.contact_id) {
        skipped++;
        continue;
      }

      // Skip if already have any conversation for this deal
      const { data: existingConv } = await db
        .from("coach_conversations")
        .select("id")
        .eq("deal_id", deal.id)
        .maybeSingle();
      if (existingConv) {
        skipped++;
        continue;
      }

      // Fetch chats for contact
      const chatsResp = await clintGet(
        `/v2/chats/contact/${deal.contact_id}`,
      );
      const chats = (chatsResp?.data ?? []) as any[];
      if (!chats.length) {
        skipped++;
        continue;
      }

      for (const chat of chats) {
        // Skip chats already imported
        const { data: existingByClintConv } = await db
          .from("coach_conversations")
          .select("id")
          .eq("clint_conversation_id", chat.id)
          .maybeSingle();
        if (existingByClintConv) continue;

        // Fetch messages
        const msgResp = await clintGet(
          `/v2/messages/chat/${chat.id}?limit=500`,
        );
        const allMsgs = (msgResp?.data ?? []) as any[];

        // Keep only real messages (USER/CUSTOMER), sort ascending
        const realMsgs = allMsgs
          .filter((m) => m.type === "USER" || m.type === "CUSTOMER")
          .sort(
            (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
          );

        // Must have at least one outbound (USER) in period
        const hasOutboundInPeriod = realMsgs.some((m) => {
          if (m.type !== "USER") return false;
          const t = Date.parse(m.created_at);
          return t >= periodStartMs && t < periodEndMs;
        });
        if (!hasOutboundInPeriod) continue;

        // Seller from chat.user_id (fallback deal)
        const sellerFromChat = chat.user_id ? userMap.get(chat.user_id) : null;
        const sellerEmail =
          sellerFromChat?.email ?? deal.user_email ?? null;
        const sellerName = sellerFromChat?.name ?? deal.user_name ?? null;

        const firstMsg = realMsgs[0];
        const lastMsg = realMsgs[realMsgs.length - 1];

        const { data: convRow, error: cErr } = await db
          .from("coach_conversations")
          .insert({
            clint_conversation_id: chat.id,
            clint_contact_id: deal.contact_id,
            deal_id: deal.id,
            seller_email: sellerEmail,
            seller_name: sellerName,
            contact_name: deal.contact_name,
            contact_email: deal.contact_email,
            origin_name: deal.origin_name,
            stage: deal.stage,
            deal_value: deal.value,
            source: "clint",
            first_message_at: firstMsg?.created_at ?? chat.created_at,
            last_message_at:
              lastMsg?.created_at ?? chat.last_message_at ?? chat.created_at,
            message_count: realMsgs.length,
          })
          .select("id")
          .single();
        if (cErr) throw new Error(`insert conv: ${cErr.message}`);

        const conversationId = convRow.id as string;

        const rows = realMsgs.map((m) => {
          const direction = m.type === "USER" ? "outbound" : "inbound";
          const author = direction === "outbound" ? "vendedor" : "cliente";
          const msgSeller = m.user_id ? userMap.get(m.user_id) : null;
          const senderName =
            direction === "outbound"
              ? (msgSeller?.name ?? sellerName)
              : deal.contact_name;
          return {
            conversation_id: conversationId,
            clint_message_id: m.id,
            sent_at: m.created_at,
            direction,
            sender_name: senderName,
            body: extractText(m),
            author,
            seller_id:
              direction === "outbound"
                ? (msgSeller?.email ?? sellerEmail ?? sellerName)
                : null,
            lead_phone: deal.contact_phone,
          };
        });

        if (rows.length) {
          // Chunk insert to avoid payload limits
          for (let i = 0; i < rows.length; i += 200) {
            const chunk = rows.slice(i, i + 200);
            const { error: mErr } = await db
              .from("coach_messages")
              .insert(chunk);
            if (mErr) throw new Error(`insert msgs: ${mErr.message}`);
          }
        }

        inserted++;
      }
    } catch (e: unknown) {
      errors.push({
        deal_id: deal.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { processed, inserted, skipped, errors };
}

export const Route = createFileRoute("/api/public/backfill-v3")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await runBackfill();
          return Response.json({ ok: true, ...result });
        } catch (e: unknown) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
      GET: () => Response.json({ ok: true, hint: "POST to run backfill" }),
    },
  },
});
