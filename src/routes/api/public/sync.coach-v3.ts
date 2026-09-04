import { createFileRoute } from "@tanstack/react-router";

import { PIPELINE_V3_ORIGIN_IDS, PIPELINE_V3_ORIGIN_NAME } from "@/lib/pipeline-origins";

const CLINT_BASE = "https://api.clint.digital";
const BATCH_SIZE = 8; // parallel Clint API calls per batch

function checkApiKey(request: Request): boolean {
  const key = request.headers.get("x-api-key");
  const expected = process.env.INTERNAL_API_KEY;
  return !!expected && key === expected;
}

async function clintGet(path: string, token: string) {
  const res = await fetch(`${CLINT_BASE}${path}`, {
    headers: { "api-token": token, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Clint ${path} → ${res.status}`);
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
  if (msg.content_object?.template_name) return `[template: ${msg.content_object.template_name}]`;
  if (msg.content_type && msg.content_type !== "TEXT") return `[${msg.content_type}]`;
  return "[sem texto]";
}

export async function runCoachV3Sync(sinceDays: number) {
  const token = process.env.CLINT_API_TOKEN;
  if (!token) throw new Error("CLINT_API_TOKEN not configured");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const sinceDate = new Date(Date.now() - sinceDays * 86_400_000).toISOString();

  // Build user map for seller name/email resolution
  const { data: usersData } = await db
    .from("clint_users")
    .select("id, email, first_name, last_name");
  const userMap = new Map<string, { email: string | null; name: string | null }>();
  for (const u of (usersData ?? []) as any[]) {
    userMap.set(u.id, {
      email: u.email ?? null,
      name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || null,
    });
  }

  // Try to get deals from already-synced clint_deals table (both PIPELINE_COMERCIAL-V3 origin IDs)
  const { data: dbDeals } = await db
    .from("clint_deals")
    .select(
      "id, contact_id, contact_name, contact_email, contact_phone, user_id, user_email, user_name, stage, status, value, updated_at",
    )
    .in("origin_id", PIPELINE_V3_ORIGIN_IDS)
    .gte("updated_at", sinceDate)
    .in("status", ["OPEN", "WON", "LOST"])
    .order("updated_at", { ascending: false })
    .limit(1000);

  let deals: any[] = dbDeals ?? [];

  // Fallback: fetch directly from Clint API if local table is empty
  if (!deals.length) {
    let page = 1;
    while (true) {
      const q = new URLSearchParams({
        limit: "200",
        page: String(page),
        updated_at_start: sinceDate,
        sort: "updated_at",
        order: "desc",
      });
      const resp = await clintGet(`/v1/deals?${q}`, token);
      const items: any[] = (resp.data ?? []).filter((d: any) =>
        PIPELINE_V3_ORIGIN_IDS.includes(d.origin_id),
      );
      deals.push(...items);
      if (!resp.hasNext) break;
      if (++page > 25) break;
    }
    // Map to the same shape as clint_deals rows
    deals = deals.map((d: any) => ({
      id: d.id,
      contact_id: d.contact?.id ?? null,
      contact_name: d.contact?.name ?? null,
      contact_email: d.contact?.email ?? null,
      contact_phone: d.contact?.phone ?? d.contact?.mobile ?? null,
      user_id: d.user?.id ?? null,
      user_email: d.user?.email ?? null,
      user_name: d.user?.full_name?.trim() ?? null,
      stage: d.stage ?? null,
      status: d.status,
      value: d.value,
      updated_at: d.updated_at,
    }));
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors: { deal_id: string; error: string }[] = [];

  // Process a single deal: fetch chats + messages, upsert to coach tables
  async function processDeal(deal: any): Promise<void> {
    if (!deal.contact_id) {
      skipped++;
      return;
    }

    let chatsResp: any;
    try {
      chatsResp = await clintGet(`/v2/chats/contact/${deal.contact_id}`, token!);
    } catch {
      skipped++;
      return;
    }
    const chats: any[] = chatsResp?.data ?? [];
    if (!chats.length) {
      skipped++;
      return;
    }

    for (const chat of chats) {
      try {
        // Check if conversation already exists (unique by clint_conversation_id)
        const { data: existing } = await db
          .from("coach_conversations")
          .select("id, is_ai_conversation")
          .eq("clint_conversation_id", chat.id)
          .maybeSingle();

        if (existing) {
          // Conversa já existe → buscar mensagens novas (follow-ups, agendamentos, respostas)
          const msgResp2 = await clintGet(`/v2/messages/chat/${chat.id}?limit=500`, token!);
          const realMsgs2 = ((msgResp2?.data ?? []) as any[])
            .filter((m: any) => m.type === "USER" || m.type === "CUSTOMER")
            .sort((a: any, b: any) => Date.parse(a.created_at) - Date.parse(b.created_at));

          if (realMsgs2.length) {
            const { data: knownMsgs } = await db
              .from("coach_messages")
              .select("clint_message_id")
              .eq("conversation_id", existing.id)
              .not("clint_message_id", "is", null)
              // Dedupe: truncar aqui faz o sync reinserir as mensagens antigas
              // a cada execução, inflando a tabela.
              .limit(20000);
            const known = new Set((knownMsgs ?? []).map((m: any) => m.clint_message_id));
            const newMsgs = realMsgs2.filter((m: any) => !known.has(m.id));

            if (newMsgs.length) {
              const sellerFromChat2 = chat.user_id ? userMap.get(chat.user_id) : null;
              const sellerName2 = sellerFromChat2?.name ?? deal.user_name ?? null;
              const rows = newMsgs.map((m: any) => {
                const direction = m.type === "USER" ? "outbound" : "inbound";
                const msgSeller = m.user_id ? userMap.get(m.user_id) : null;
                return {
                  conversation_id: existing.id,
                  clint_message_id: m.id,
                  sent_at: m.created_at,
                  direction,
                  sender_name:
                    direction === "outbound" && m.source === "AI_CONVERSATION"
                      ? "SDR COMERCIAL IA"
                      : direction === "outbound"
                        ? (msgSeller?.name ?? sellerName2)
                        : (deal.contact_name ?? null),
                  body: extractText(m),
                  clint_source: m.source ?? null,
                };
              });
              for (let i = 0; i < rows.length; i += 200) {
                const { error: mErr } = await db
                  .from("coach_messages")
                  .insert(rows.slice(i, i + 200));
                if (mErr && mErr.code !== "23505") throw new Error(`insert msgs: ${mErr.message}`);
              }
            }

            const last2 = realMsgs2[realMsgs2.length - 1];
            const isAi2 = realMsgs2.some((m: any) => m.source === "AI_CONVERSATION");
            await db
              .from("coach_conversations")
              .update({
                stage: deal.stage ?? null,
                message_count: realMsgs2.length,
                last_message_at: last2?.created_at ?? null,
                is_ai_conversation: existing.is_ai_conversation || isAi2,
              })
              .eq("id", existing.id);
          } else {
            await db
              .from("coach_conversations")
              .update({ stage: deal.stage ?? null })
              .eq("id", existing.id);
          }
          updated++;
          continue;
        }

        // Fetch messages for this chat
        const msgResp = await clintGet(`/v2/messages/chat/${chat.id}?limit=500`, token!);
        const allMsgs: any[] = msgResp?.data ?? [];

        const realMsgs = allMsgs
          .filter((m: any) => m.type === "USER" || m.type === "CUSTOMER")
          .sort((a: any, b: any) => Date.parse(a.created_at) - Date.parse(b.created_at));

        if (!realMsgs.length) {
          skipped++;
          continue;
        }

        // Resolve seller
        const sellerFromChat = chat.user_id ? userMap.get(chat.user_id) : null;
        const sellerEmail = sellerFromChat?.email ?? deal.user_email ?? null;
        const sellerName = sellerFromChat?.name ?? deal.user_name ?? null;

        const firstMsg = realMsgs[0];
        const lastMsg = realMsgs[realMsgs.length - 1];

        // Insert conversation
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
            origin_name: PIPELINE_V3_ORIGIN_NAME,
            stage: deal.stage ?? null,
            deal_value: parseFloat(String(deal.value ?? 0)) || null,
            source: "clint",
            first_message_at: firstMsg?.created_at ?? chat.created_at,
            last_message_at: lastMsg?.created_at ?? chat.last_message_at ?? chat.created_at,
            message_count: realMsgs.length,
          })
          .select("id")
          .single();

        if (cErr) {
          // Unique constraint violation = race condition, treat as update
          if (cErr.code === "23505") {
            updated++;
            continue;
          }
          throw new Error(`insert conv: ${cErr.message}`);
        }
        const conversationId = convRow.id as string;

        // Insert messages with clint_source for reliable AI detection
        const isAiConversation = realMsgs.some((m: any) => m.source === "AI_CONVERSATION");
        const msgRows = realMsgs.map((m: any) => {
          const direction = m.type === "USER" ? "outbound" : "inbound";
          const msgSeller = m.user_id ? userMap.get(m.user_id) : null;
          const senderName =
            direction === "outbound" && m.source === "AI_CONVERSATION"
              ? "SDR COMERCIAL IA"
              : direction === "outbound"
                ? (msgSeller?.name ?? sellerName)
                : (deal.contact_name ?? null);
          return {
            conversation_id: conversationId,
            clint_message_id: m.id,
            sent_at: m.created_at,
            direction,
            sender_name: senderName,
            body: extractText(m),
            clint_source: m.source ?? null,
          };
        });

        // Mark conversation as AI if any message came from SDR COMERCIAL IA
        if (isAiConversation) {
          await db
            .from("coach_conversations")
            .update({ is_ai_conversation: true })
            .eq("id", conversationId);
        }

        for (let i = 0; i < msgRows.length; i += 200) {
          const { error: mErr } = await db.from("coach_messages").insert(msgRows.slice(i, i + 200));
          if (mErr && mErr.code !== "23505") throw new Error(`insert msgs: ${mErr.message}`);
        }

        inserted++;
      } catch (e: unknown) {
        errors.push({
          deal_id: deal.id ?? "unknown",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  // Process in parallel batches (BATCH_SIZE deals at a time)
  for (let i = 0; i < deals.length; i += BATCH_SIZE) {
    const batch = deals.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map((deal) => processDeal(deal)));
  }

  return {
    ok: true,
    since: sinceDate,
    deals_found: deals.length,
    inserted,
    updated,
    skipped,
    errors: errors.slice(0, 20),
  };
}

async function handleSync(request: Request) {
  if (!checkApiKey(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const sinceDays = parseInt(url.searchParams.get("sinceDays") ?? "90", 10) || 90;
  try {
    const result = await runCoachV3Sync(sinceDays);
    return Response.json(result);
  } catch (e: unknown) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/public/sync/coach-v3")({
  server: {
    handlers: {
      POST: ({ request }) => handleSync(request),
      GET: ({ request }) => handleSync(request),
    },
  },
});
