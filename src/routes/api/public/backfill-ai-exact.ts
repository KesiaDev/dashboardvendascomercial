/**
 * Backfill das conversas exatas atendidas pelo SDR COMERCIAL IA.
 * Identificação: source="AI_CONVERSATION" nas mensagens do Clint.
 * Os chat IDs abaixo foram confirmados manualmente pela usuária.
 */
import { createFileRoute } from "@tanstack/react-router";

const CLINT_BASE = "https://api.clint.digital";
const PIPELINE_V3_ORIGIN_NAME = "PIPELINE_COMERCIAL-V3";

// Chat IDs confirmados como conversas da IA (SDR COMERCIAL IA)
const KNOWN_AI_CHAT_IDS: string[] = [
  "33fbc9b6-62aa-45f7-af0a-52e2365533cc",
  "04c25c88-945d-4c2b-8fc7-f0acf9c3e6d3",
  "60a11587-8806-4e19-8b0b-c02e331831a6",
  "c384ba19-772e-4e23-8155-b377d5d514c5",
  "3a4053b0-35aa-485e-81a2-deeb34e83513",
  "623ac00f-66f9-45f6-b0a3-9f9552428a90",
  "f423421e-c178-4871-a464-956e0f5c17a9",
  "169c9582-70b0-490a-a801-2dce9ea6c6e4",
  "d271698d-0539-491c-87ba-cab20f08297b",
  "df0aa135-c3b0-4045-b4d9-7ae80d875d8a",
  "f4674b93-0460-46fb-8b38-0b32ff2959f8",
  "7fc8237a-e5c1-44a5-9928-6947d4df534b",
  "72013d6d-1712-48b0-8ad2-2f689e44463e",
  "85c17c4c-91dc-4343-a50f-aa8f5f8ba1bb",
  "3277ce70-aa08-4ea0-946b-0c6723dfaf23",
  "2c893aaf-11d7-49e1-a976-453035fe4b04",
  "72154f77-c2ba-495d-93dd-f262c5d2fa4d",
  "e44d0b93-15e0-421e-ac64-6319269453bd",
  "3ec1fe3d-8784-48db-aeea-6a8c09f680ac",
  "6cd7b977-b242-41fb-a250-2bd01d257353",
  "8ef18d97-5647-4704-8f3a-2b2646146963",
  "447fcdbf-20b2-4ee7-9290-08b4cdcd896a",
  "47b5a4ab-312c-4386-a2c8-dd506ef950bd",
  "c6bb5085-9a77-4a14-8460-68763f2c1359",
  "6b591cfd-2040-4aae-8f04-e66126ccf97b",
  "7c3f7f7c-6176-42f2-ad35-ed3e3a26784b",
  "bccd958a-2c97-40fe-8c2a-f4e4f35f4f8d",
  "365ff93b-24b3-4e7a-9efc-425f2a1eca3e",
  "8152fba3-716c-4514-828c-6582c8a17a4f",
  "72d1d8cc-b97f-44f3-9675-100e53ad4396",
];

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
  if (msg.content_object?.template_name)
    return `[template: ${msg.content_object.template_name}]`;
  if (msg.content_type && msg.content_type !== "TEXT")
    return `[${msg.content_type}]`;
  return "[sem texto]";
}

async function runBackfillAiExact() {
  const token = process.env.CLINT_API_TOKEN;
  if (!token) throw new Error("CLINT_API_TOKEN not configured");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  // Build user map for seller names
  const { data: usersData } = await db.from("clint_users").select("id, email, first_name, last_name");
  const userMap = new Map<string, { email: string | null; name: string | null }>();
  for (const u of (usersData ?? []) as any[]) {
    userMap.set(u.id, {
      email: u.email ?? null,
      name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || null,
    });
  }

  const results: { chat_id: string; status: string; msgs?: number; error?: string }[] = [];

  for (const chatId of KNOWN_AI_CHAT_IDS) {
    try {
      // Fetch messages from Clint
      const msgResp = await clintGet(`/v2/messages/chat/${chatId}?limit=500`, token);
      const allMsgs: any[] = msgResp?.data ?? [];

      const realMsgs = allMsgs
        .filter((m: any) => m.type === "USER" || m.type === "CUSTOMER")
        .sort((a: any, b: any) => Date.parse(a.created_at) - Date.parse(b.created_at));

      const hasAiMessages = allMsgs.some((m: any) => m.source === "AI_CONVERSATION");

      // Check if conversation already exists
      const { data: existing } = await db
        .from("coach_conversations")
        .select("id, deal_id, contact_name, seller_email, seller_name")
        .eq("clint_conversation_id", chatId)
        .maybeSingle();

      let convId: string | null = null;

      if (existing) {
        // Update stage only (is_ai_conversation column added via migration separately)
        await db
          .from("coach_conversations")
          .update({ message_count: realMsgs.length })
          .eq("id", existing.id);
        convId = existing.id as string;

        // Delete old messages (will re-insert with clint_source)
        await db.from("coach_messages").delete().eq("conversation_id", convId);
      } else {
        // Insert minimal conversation row
        const firstMsg = realMsgs[0];
        const lastMsg = realMsgs[realMsgs.length - 1];

        const { data: convRow, error: cErr } = await db
          .from("coach_conversations")
          .insert({
            clint_conversation_id: chatId,
            origin_name: PIPELINE_V3_ORIGIN_NAME,
            source: "clint",
            first_message_at: firstMsg?.created_at ?? new Date().toISOString(),
            last_message_at: lastMsg?.created_at ?? new Date().toISOString(),
            message_count: realMsgs.length,
          })
          .select("id")
          .single();

        if (cErr) {
          if (cErr.code === "23505") {
            // Race condition: conversation inserted concurrently, re-fetch
            const { data: retried } = await db
              .from("coach_conversations")
              .select("id")
              .eq("clint_conversation_id", chatId)
              .single();
            convId = (retried?.id as string) ?? null;
            if (convId) await db.from("coach_messages").delete().eq("conversation_id", convId);
          } else {
            throw new Error(`insert conv: ${cErr.message}`);
          }
        } else {
          convId = convRow.id as string;
        }
      }

      if (!convId) {
        results.push({ chat_id: chatId, status: "error", error: "no conv id resolved" });
        continue;
      }

      // Insert messages WITH clint_source field
      const msgRows = realMsgs.map((m: any) => {
        const direction = m.type === "USER" ? "outbound" : "inbound";
        const msgSeller = m.user_id ? userMap.get(m.user_id) : null;
        const senderName =
          direction === "outbound" && m.source === "AI_CONVERSATION"
            ? "SDR COMERCIAL IA"
            : direction === "outbound"
            ? (msgSeller?.name ?? null)
            : null;
        return {
          conversation_id: convId,
          clint_message_id: m.id,
          sent_at: m.created_at,
          direction,
          sender_name: senderName,
          body: extractText(m),
        };
      });

      for (let i = 0; i < msgRows.length; i += 200) {
        const { error: mErr } = await db.from("coach_messages").insert(msgRows.slice(i, i + 200));
        if (mErr) throw new Error(`insert msgs: ${mErr.message}`);
      }

      // Update message_count
      await db
        .from("coach_conversations")
        .update({ message_count: realMsgs.length })
        .eq("id", convId);

      results.push({
        chat_id: chatId,
        status: existing ? "updated" : "inserted",
        msgs: realMsgs.length,
      });
    } catch (e: unknown) {
      results.push({
        chat_id: chatId,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const ok = results.filter((r) => r.status !== "error").length;
  const errors = results.filter((r) => r.status === "error");
  return { ok: true, total: KNOWN_AI_CHAT_IDS.length, success: ok, errors, details: results };
}

async function handleBackfill(request: Request) {
  if (!checkApiKey(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runBackfillAiExact();
    return Response.json(result);
  } catch (e: unknown) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/public/backfill-ai-exact")({
  server: {
    handlers: {
      POST: ({ request }) => handleBackfill(request),
      GET: ({ request }) => handleBackfill(request),
    },
  },
});
