import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAdminEmail } from "@/lib/auth";

export type Vacation = {
  id: string;
  seller_email: string;
  seller_name: string | null;
  start_date: string;
  end_date: string;
  vacation_type: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function isAdminCtx(context: any) {
  const email = (context.claims as any)?.email as string | undefined;
  return isAdminEmail(email) || (context.claims as any)?.user_metadata?.role === "admin";
}

export const listVacationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string; to?: string }) => d)
  .handler(async ({ data }) => {
    const supabase = await admin();
    let q = supabase.from("seller_vacations").select("*").order("start_date", { ascending: true });
    if (data.from) q = q.gte("end_date", data.from);
    if (data.to) q = q.lte("start_date", data.to);
    const { data: rows, error } = await q.limit(500);
    if (error) throw error;
    return { items: (rows ?? []) as Vacation[] };
  });

export const upsertVacationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<Vacation> & { id?: string }) => d)
  .handler(async ({ data, context }) => {
    if (!isAdminCtx(context)) throw new Error("Somente admin pode gerenciar férias");
    const supabase = await admin();
    if (!data.seller_email) throw new Error("Email do vendedor obrigatório");
    if (!data.start_date || !data.end_date) throw new Error("Datas obrigatórias");
    if (data.end_date < data.start_date) throw new Error("Data fim deve ser >= início");

    const payload = {
      seller_email: data.seller_email.toLowerCase(),
      seller_name: data.seller_name ?? null,
      start_date: data.start_date,
      end_date: data.end_date,
      vacation_type: data.vacation_type ?? "ferias",
      status: data.status ?? "aprovado",
      notes: data.notes ?? null,
    };

    if (data.id) {
      const { error } = await supabase.from("seller_vacations").update(payload).eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: inserted, error } = await supabase
      .from("seller_vacations")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: inserted.id };
  });

export const deleteVacationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    if (!isAdminCtx(context)) throw new Error("Somente admin pode remover férias");
    const supabase = await admin();
    const { error } = await supabase.from("seller_vacations").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
