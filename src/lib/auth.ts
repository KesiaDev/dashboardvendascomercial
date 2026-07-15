export const ADMIN_EMAILS = ["kesiawnandi@gmail.com", "kesia@llmidiaco.com"];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export const ALLOWED_NON_ADMIN_ROUTES = ["/fechamento", "/fechamento-semanal"];
