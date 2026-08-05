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
  color: string | null;
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
    // Calendário é visível para toda a equipa (todos os vendedores veem todas as reuniões).
    // A edição/eliminação continua restrita ao dono do agendamento ou admins.
    if (data.seller) q = q.eq("seller_email", data.seller.toLowerCase());
    const { data: rows, error } = await q.limit(500);
    if (error) throw error;
    return { items: (rows ?? []) as AgendaItem[], isAdmin };
  });

export const upsertAgendaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<AgendaItem> & { id?: string; repeat_weekdays?: number[] | null; repeat_until?: string | null }) => d)
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
      color: data.color ?? null,
    };

    if (data.id) {
      const { error } = await supabase.from("seller_agenda").update(payload).eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id, count: 1 };
    }

    const days = repeatDates(new Date(data.scheduled_at), data.repeat_weekdays, data.repeat_until);
    if (days.length > 1) {
      const rows = days.map((d) => ({ ...payload, scheduled_at: d.toISOString() }));
      const { error } = await supabase.from("seller_agenda").insert(rows);
      if (error) throw error;
      return { ok: true, id: null as string | null, count: rows.length };
    }

    const { data: inserted, error } = await supabase
      .from("seller_agenda")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: inserted.id as string | null, count: 1 };
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

export type AgendaLog = {
  id: number;
  created_at: string;
  status: string;
  error_msg: string | null;
  payload: string | null;
};

/** Diagnóstico: últimas chamadas do n8n/Clint ao endpoint /api/public/agenda/book */
export const listAgendaLogsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims as any)?.email as string | undefined;
    const isAdmin = isAdminEmail(email) || (context.claims as any)?.user_metadata?.role === "admin";
    if (!isAdmin) return { items: [] as AgendaLog[] };
    const supabase = await admin();
    const { data, error } = await supabase
      .from("coach_integration_logs")
      .select("id, created_at, status, error_msg, payload")
      .eq("event_type", "agenda_book")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw error;
    const items: AgendaLog[] = (data ?? []).map((r: any) => ({
      id: r.id,
      created_at: r.created_at,
      status: r.status,
      error_msg: r.error_msg ?? null,
      payload: r.payload ? JSON.stringify(r.payload) : null,
    }));
    return { items };

  });

/** Lista fixa da equipa comercial (para filtrar a agenda por vendedor, mesmo sem eventos). */
export const listAgendaSellersFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const supabase = await admin();
    const [{ data: cfg }, { data: users }, { data: agenda }] = await Promise.all([
      supabase.from("bi_seller_config").select("seller_name, clint_user_name, is_active"),
      supabase.from("clint_users").select("email, first_name, last_name, active"),
      supabase.from("seller_agenda").select("seller_email, seller_name"),
    ]);

    const norm = (v?: string | null) =>
      (v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

    const out = new Map<string, { email: string; name: string }>();
    for (const c of cfg ?? []) {
      if ((c as any).is_active === false) continue;
      const full = norm((c as any).clint_user_name);
      if (!full) continue;
      const parts = full.split(" ").filter(Boolean);
      const u = (users ?? []).find((x: any) => {
        const un = norm(`${x.first_name ?? ""} ${x.last_name ?? ""}`);
        if (!un) return false;
        if (un === full || un.includes(full) || full.includes(un)) return true;
        // fallback: casa pelo e-mail (ex.: "luana guimaraes" -> luanaguimaraes@...)
        const mail = norm(x.email).split("@")[0].replace(/[^a-z]/g, "");
        return !!mail && parts.every((p) => mail.includes(p));
      });
      if (u?.email) out.set(u.email.toLowerCase(), { email: u.email.toLowerCase(), name: (c as any).seller_name ?? u.email });
    }

    for (const a of agenda ?? []) {
      const e = ((a as any).seller_email ?? "").toLowerCase();
      if (e && !out.has(e)) out.set(e, { email: e, name: (a as any).seller_name ?? e });
    }
    return { sellers: Array.from(out.values()).sort((a, b) => a.name.localeCompare(b.name)) };
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

/** Gera as datas de repetição a partir de um início, dias da semana e data limite. */
function repeatDates(start: Date, weekdays?: number[] | null, until?: string | null): Date[] {
  const base = new Date(start);
  if (!weekdays?.length || !until) return [base];
  const limit = new Date(`${until}T23:59:59`);
  if (isNaN(limit.getTime()) || limit < base) return [base];
  const out: Date[] = [];
  const cursor = new Date(base);
  // começa no mesmo dia (se bater no filtro) e avança dia a dia
  for (let i = 0; i < 400 && cursor <= limit; i++) {
    if (weekdays.includes(cursor.getDay())) out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out.length ? out : [base];
}

/** Bloqueio de agenda: cria slots de 30 em 30 min com status "bloqueado". */
export const blockAgendaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from: string; to: string; reason?: string | null; seller_email?: string | null; seller_name?: string | null; color?: string | null; repeat_weekdays?: number[] | null; repeat_until?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const supabase = await admin();
    const email = (context.claims as any)?.email as string | undefined;
    const isAdmin = isAdminEmail(email) || (context.claims as any)?.user_metadata?.role === "admin";
    const seller = (data.seller_email ?? email ?? "").toLowerCase();
    if (!seller) throw new Error("seller_email obrigatório");
    if (!isAdmin && seller !== (email ?? "").toLowerCase()) {
      throw new Error("Sem permissão para bloquear a agenda de outro vendedor");
    }
    const start = new Date(data.from);
    const end = new Date(data.to);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error("Datas inválidas");
    if (end <= start) throw new Error("Hora final deve ser maior que a inicial");
    const durationMs = end.getTime() - start.getTime();
    const days = repeatDates(start, data.repeat_weekdays, data.repeat_until);
    const maxSlots = 2000;
    const rows: any[] = [];
    for (const day of days) {
      const dayEnd = day.getTime() + durationMs;
      for (let t = day.getTime(); t < dayEnd && rows.length < maxSlots; t += 30 * 60 * 1000) {
        rows.push({
          seller_email: seller,
          seller_name: data.seller_name ?? null,
          lead_name: data.reason?.trim() || "Bloqueado",
          scheduled_at: new Date(t).toISOString(),
          duration_min: 30,
          meeting_type: "bloqueio",
          source: "bloqueio",
          status: "bloqueado",
          notes: data.reason ?? null,
          color: data.color ?? null,
        });
      }
    }
    if (!rows.length) throw new Error("Intervalo vazio");
    const { error } = await supabase.from("seller_agenda").insert(rows);
    if (error) throw error;
    return { ok: true, count: rows.length, days: days.length };
  });


/** Remove todos os bloqueios de um vendedor dentro de um intervalo. */
export const unblockAgendaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from: string; to: string; seller_email?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const supabase = await admin();
    const email = (context.claims as any)?.email as string | undefined;
    const isAdmin = isAdminEmail(email) || (context.claims as any)?.user_metadata?.role === "admin";
    let q = supabase
      .from("seller_agenda")
      .delete()
      .eq("status", "bloqueado")
      .gte("scheduled_at", data.from)
      .lte("scheduled_at", data.to);
    const seller = (data.seller_email ?? "").toLowerCase();
    if (isAdmin) {
      if (seller) q = q.eq("seller_email", seller);
    } else {
      q = q.eq("seller_email", (email ?? "").toLowerCase());
    }
    const { error } = await q;
    if (error) throw error;
    return { ok: true };
  });
