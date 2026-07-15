import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ADMIN_EMAILS } from "@/lib/auth";

function assertAdmin(claims: any) {
  const email = (claims?.email ?? "").toString().trim().toLowerCase();
  const metaRole = (claims?.user_metadata?.role ?? "").toString().trim().toLowerCase();
  if (ADMIN_EMAILS.includes(email)) return;
  if (metaRole === "admin") return;
  throw new Error("Acesso negado: apenas administradores");
}

export type AppUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "admin" | "vendedor" | "gestor";
  created_at: string;
  last_sign_in_at: string | null;
};

export const listAppUsersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AppUser[]> => {
    assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error(error.message);
    return (data.users ?? []).map((u) => {
      const em = u.email ?? null;
      const metaRole = ((u.user_metadata?.role as string) ?? "").trim().toLowerCase();
      const isHardcodedAdmin = em ? ADMIN_EMAILS.includes(em.trim().toLowerCase()) : false;
      const role: "admin" | "vendedor" | "gestor" =
        isHardcodedAdmin || metaRole === "admin"
          ? "admin"
          : metaRole === "gestor"
            ? "gestor"
            : "vendedor";
      return {
        id: u.id,
        email: em,
        full_name: (u.user_metadata?.full_name as string) ?? (u.user_metadata?.name as string) ?? null,
        role,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      };
    });
  });

export const createAppUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; password: string; full_name: string; role: "vendedor" | "gestor" | "admin" }) => d)
  .handler(async ({ data, context }) => {
    assertAdmin(context.claims);
    if (!data.email || !data.password || data.password.length < 6) {
      throw new Error("Email e senha (mín. 6 caracteres) obrigatórios");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.trim().toLowerCase(),
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, role: data.role },
    });
    if (error) throw new Error(error.message);
    return { ok: true, id: created.user?.id };
  });

export const resetAppUserPasswordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; password: string }) => d)
  .handler(async ({ data, context }) => {
    assertAdmin(context.claims);
    if (!data.password || data.password.length < 6) throw new Error("Senha mínima de 6 caracteres");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAppUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAppUserRoleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: "admin" | "gestor" | "vendedor" }) => d)
  .handler(async ({ data, context }) => {
    assertAdmin(context.claims);
    if (!["admin", "gestor", "vendedor"].includes(data.role)) throw new Error("Perfil inválido");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: got, error: getErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (getErr) throw new Error(getErr.message);
    const meta = { ...(got.user?.user_metadata ?? {}), role: data.role };
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { user_metadata: meta });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
