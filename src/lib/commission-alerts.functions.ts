import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CommissionAlert = {
  id: string;
  sale_id: string;
  type: "pendente_24h" | "afiliado_divergente" | string;
  severity: string;
  message: string;
  seller_name: string | null;
  client_name: string | null;
  client_email: string | null;
  sale_date: string | null;
  value_eur: number | null;
  hotmart_nome_afiliado: string | null;
  hours_pending: number | null;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
};

const COLS =
  "id,sale_id,type,severity,message,seller_name,client_name,client_email,sale_date,value_eur,hotmart_nome_afiliado,hours_pending,resolved,resolved_at,created_at";

async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Acesso restrito a administradores");
}

export const listCommissionAlertsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { includeResolved?: boolean }) => d ?? {})
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase
      .from("commission_alerts")
      .select(COLS)
      .order("severity", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(200);
    if (!data.includeResolved) q = q.eq("resolved", false);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as CommissionAlert[];
  });

export const resolveCommissionAlertFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; resolved?: boolean }) => {
    if (!d?.id) throw new Error("ID obrigatório");
    return { id: d.id, resolved: d.resolved ?? true };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("commission_alerts")
      .update({
        resolved: data.resolved,
        resolved_at: data.resolved ? new Date().toISOString() : null,
        resolved_by: data.resolved ? context.userId : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Roda a auditoria sob demanda (mesmo ciclo do cron). Admin apenas. */
export const runManualSalesAuditFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runManualSalesAudit } = await import("@/lib/manual-sales-audit.server");
    return await runManualSalesAudit();
  });
