export const ADMIN_EMAILS = ["kesiawnandi@gmail.com", "kesia@llmidiaco.com"];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

type MaybeUser = {
  email?: string | null;
  user_metadata?: { role?: string | null } | null;
} | null | undefined;

export function isAdminUser(user: MaybeUser): boolean {
  if (!user) return false;
  if (isAdminEmail(user.email)) return true;
  const role = (user.user_metadata?.role ?? "").toString().trim().toLowerCase();
  return role === "admin";
}

export const ALLOWED_NON_ADMIN_ROUTES = ["/fechamento", "/fechamento-semanal", "/agenda", "/ferias", "/indicacoes", "/coach"];

// Vendedores autorizados a ver a visão individual de Performance/Conversas/Ligações no Coach.
// Qualquer outro utilizador não-admin vê essas abas vazias.
export const ALLOWED_SELLER_EMAILS = [
  "ritasbandeira@gmail.com",
  "gp5230158@gmail.com",
  "fabio.nadal19@gmail.com",
  "luanaguimaraes.moc@gmail.com",
  "jpessoa20@hotmail.com",
];

export function isAllowedSellerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ALLOWED_SELLER_EMAILS.includes(email.trim().toLowerCase());
}
