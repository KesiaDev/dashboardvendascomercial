/**
 * Autorização das server functions.
 *
 * Server functions do TanStack Start são endpoints HTTP públicos — o identificador
 * delas vai no bundle do browser. E este projeto fala com o Supabase pelo client de
 * `service_role`, que ignora RLS por definição. Ou seja: uma server function sem
 * middleware é uma consulta sem restrição alguma, aberta à internet.
 *
 * O guard de rota em `_app.tsx` NÃO protege nada disso: ele só redireciona o browser.
 *
 * Regra: toda server function leva `.middleware([requireSupabaseAuth])`. As que
 * expõem dado financeiro ou administrativo levam também `assertAdmin(context.claims)`
 * como primeira linha do handler.
 */
import { ADMIN_EMAILS, sellerNameForEmail } from "@/lib/auth";

type Claims = { email?: unknown; user_metadata?: { role?: unknown } | null } | null | undefined;

/** Lança se o usuário autenticado não for administrador. */
export function assertAdmin(claims: Claims): void {
  const email = String((claims as any)?.email ?? "")
    .trim()
    .toLowerCase();
  const metaRole = String((claims as any)?.user_metadata?.role ?? "")
    .trim()
    .toLowerCase();
  if (ADMIN_EMAILS.includes(email)) return;
  if (metaRole === "admin") return;
  throw new Error("Acesso negado: apenas administradores");
}

/**
 * Escopo do comissionamento.
 *
 * Admin (gestão) vê o time inteiro. Vendedor vê exclusivamente a própria linha —
 * e o nome usado no filtro vem do e-mail do token, nunca do cliente.
 */
export function commissionScope(claims: Claims): { admin: boolean; sellerName: string | null } {
  const email = String((claims as any)?.email ?? "")
    .trim()
    .toLowerCase();
  const metaRole = String((claims as any)?.user_metadata?.role ?? "")
    .trim()
    .toLowerCase();
  if (ADMIN_EMAILS.includes(email) || metaRole === "admin") {
    return { admin: true, sellerName: sellerNameForEmail(email) };
  }
  const sellerName = sellerNameForEmail(email);
  if (!sellerName) throw new Error("Acesso negado: sem comissionamento associado a este utilizador");
  return { admin: false, sellerName };
}
