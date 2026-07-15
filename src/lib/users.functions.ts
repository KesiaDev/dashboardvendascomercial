import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ADMIN_EMAILS } from "@/lib/auth";

function assertAdmin(email: string | undefined | null) {
  const e = (email ?? "").trim().toLowerCase();
  if (!ADMIN_EMAILS.includes(e)) throw new Error("Acesso negado: apenas administradores");
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
    assertAdmin(context.claims?.email as string | undefined);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error(error.message);
    return (data.users ?? []).map((u) => {
      const em = u.email ?? null;
      const isAdmin = em ? ADMIN_EMAILS.includes(em.trim().toLowerCase()) : false;
      const role: "admin" | "vendedor" | "gestor" =
        isAdmin ? "admin" : ((u.user_metadata?.role as string) === "gestor" ? "gestor" : "vendedor");
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
  .inputValidator((d: { email: string; password: string; full_name: string; role: "vendedor" | "gestor" }) => d)
  .handler(async ({ data, context }) => {
    assertAdmin(context.claims?.email as string | undefined);
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
    assertAdmin(context.claims?.email as string | undefined);
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
    assertAdmin(context.claims?.email as string | undefined);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
