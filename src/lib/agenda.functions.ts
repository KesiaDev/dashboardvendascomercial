import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAdminEmail } from "@/lib/auth";

export type AgendaItem = {
  id: string;
  seller_email: string;
  seller_name: string | null;
  lead_name: string;
  lead_phone: string | null;
  lead_email: string | null;
  scheduled_at: string;
  duration_min: number;
  meeting_type: string;
  meeting_link: string | null;
  source: string;
  status: string;
  clint_deal_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentPrompt = {
  id: string;
  seller_email: string;
  seller_name: string | null;
  agent_name: string;
  prompt: string;
  active: boolean;
  clint_pipeline_id: string | null;
  updated_at: string;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const listAgendaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string; to?: string; seller?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const supabase = await admin();
    const email = (context.claims as any)?.email as string | undefined;
    const isAdmin = isAdminEmail(email) || (context.claims as any)?.user_metadata?.role === "admin";

    let q = supabase.from("seller_agenda").select("*").order("scheduled_at", { ascending: true });
    if (data.from) q = q.gte("scheduled_at", data.from);
    if (data.to) q = q.lte("scheduled_at", data.to);
    if (isAdmin) {
      if (data.seller) q = q.eq("seller_email", data.seller.toLowerCase());
    } else {
      q = q.eq("seller_email", (email ?? "").toLowerCase());
    }
    const { data: rows, error } = await q.limit(500);
    if (error) throw error;
    return { items: (rows ?? []) as AgendaItem[], isAdmin };
  });

export const upsertAgendaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<AgendaItem> & { id?: string }) => d)
  .handler(async ({ data, context }) => {
    const supabase = await admin();
    const email = (context.claims as any)?.email as string | undefined;
    const isAdmin = isAdminEmail(email) || (context.claims as any)?.user_metadata?.role === "admin";

    const seller = (data.seller_email ?? (isAdmin ? "" : email ?? "")).toLowerCase();
    if (!seller) throw new Error("seller_email obrigatório");
    if (!isAdmin && seller !== (email ?? "").toLowerCase()) {
      throw new Error("Sem permissão para agendar para outro vendedor");
    }
    if (!data.lead_name) throw new Error("Nome do lead obrigatório");
    if (!data.scheduled_at) throw new Error("Data obrigatória");

    const payload = {
      seller_email: seller,
      seller_name: data.seller_name ?? null,
      lead_name: data.lead_name,
      lead_phone: data.lead_phone ?? null,
      lead_email: data.lead_email ?? null,
      scheduled_at: data.scheduled_at,
      duration_min: data.duration_min ?? 60,
      meeting_type: data.meeting_type ?? "consultoria",
      meeting_link: data.meeting_link ?? null,
      source: data.source ?? "manual",
      status: data.status ?? "agendado",
      clint_deal_id: data.clint_deal_id ?? null,
      notes: data.notes ?? null,
    };

    if (data.id) {
      const { error } = await supabase.from("seller_agenda").update(payload).eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: inserted, error } = await supabase
      .from("seller_agenda")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: inserted.id };
  });

export const deleteAgendaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const supabase = await admin();
    const email = (context.claims as any)?.email as string | undefined;
    const isAdmin = isAdminEmail(email) || (context.claims as any)?.user_metadata?.role === "admin";
    let q = supabase.from("seller_agenda").delete().eq("id", data.id);
    if (!isAdmin) q = q.eq("seller_email", (email ?? "").toLowerCase());
    const { error } = await q;
    if (error) throw error;
    return { ok: true };
  });

export const listPromptsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = await admin();
    const email = (context.claims as any)?.email as string | undefined;
    const isAdmin = isAdminEmail(email) || (context.claims as any)?.user_metadata?.role === "admin";
    let q = supabase.from("seller_ai_agent_prompts").select("*").order("seller_email");
    if (!isAdmin) q = q.eq("seller_email", (email ?? "").toLowerCase());
    const { data, error } = await q;
    if (error) throw error;
    return { items: (data ?? []) as AgentPrompt[], isAdmin };
  });

export const savePromptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<AgentPrompt>) => d)
  .handler(async ({ data, context }) => {
    const supabase = await admin();
    const email = (context.claims as any)?.email as string | undefined;
    const isAdmin = isAdminEmail(email) || (context.claims as any)?.user_metadata?.role === "admin";
    if (!isAdmin) throw new Error("Somente admin pode gerenciar prompts");
    if (!data.seller_email) throw new Error("seller_email obrigatório");
    if (!data.prompt) throw new Error("Prompt obrigatório");

    const payload = {
      seller_email: data.seller_email.toLowerCase(),
      seller_name: data.seller_name ?? null,
      agent_name: data.agent_name ?? "Agente Comercial",
      prompt: data.prompt,
      active: data.active ?? false,
      clint_pipeline_id: data.clint_pipeline_id ?? null,
    };
    const { error } = await supabase
      .from("seller_ai_agent_prompts")
      .upsert(payload, { onConflict: "seller_email" });
    if (error) throw error;
    return { ok: true };
  });
