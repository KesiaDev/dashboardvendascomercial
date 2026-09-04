import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ConversaProva = {
  id: string;
  contato: string;
  seller: string;
  is_ai: boolean;
  origin_name: string | null;
  stage: string | null;
  status: "ganho" | "perdido" | "aberto";
  mensagens: { direction: string; sender: string | null; body: string; sent_at: string }[];
};

export async function loadConversaProva(id: string): Promise<ConversaProva> {
  const db = supabaseAdmin;
  const { data: c, error } = await db
    .from("coach_conversations")
    .select(
      "id, contact_name, contact_email, seller_name, seller_email, is_ai_conversation, origin_name, stage, deal_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) throw new Error("Conversa não encontrada");

  let status: "ganho" | "perdido" | "aberto" = "aberto";
  if ((c as any).deal_id) {
    const { data: d } = await db
      .from("clint_deals")
      .select("status")
      .eq("id", (c as any).deal_id)
      .maybeSingle();
    const s = String((d as any)?.status ?? "").toUpperCase();
    status = s === "WON" ? "ganho" : s === "LOST" ? "perdido" : "aberto";
  }

  const { data: msgs } = await db
    .from("coach_messages")
    .select("direction, sender_name, body, sent_at")
    .eq("conversation_id", id)
    .order("sent_at", { ascending: true })
    .limit(500);

  return {
    id: String((c as any).id),
    contato: (c as any).contact_name || (c as any).contact_email || "—",
    seller: (c as any).seller_name || (c as any).seller_email || "—",
    is_ai: !!(c as any).is_ai_conversation,
    origin_name: (c as any).origin_name ?? null,
    stage: (c as any).stage ?? null,
    status,
    mensagens: ((msgs ?? []) as any[]).map((m) => ({
      direction: String(m.direction ?? ""),
      sender: m.sender_name ?? null,
      body: String(m.body ?? ""),
      sent_at: String(m.sent_at ?? ""),
    })),
  };
}
