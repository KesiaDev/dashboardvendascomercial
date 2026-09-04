import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const ADMIN_EMAILS = ["kesiawnandi@gmail.com", "kesia@llmidiaco.com"];

// Cases de treinamento (Análise Comercial): visíveis apenas para este e-mail.
export const CASE_OWNER_EMAILS = ["kesiawnandi@gmail.com"];

/**
 * getSession com timeout: se o serviço de auth estiver lento/indisponível
 * (ex.: refresh de token estourando), não deixa a tela travada em
 * "Carregando…" — cai para a sessão em cache (se ainda válida) ou retorna null.
 */
export async function getSessionFast(timeoutMs = 6000): Promise<Session | null> {
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (result) return result.data.session ?? null;
  } catch {
    /* cai no fallback abaixo */
  }
  // Fallback: sessão em cache no storage (apenas browser, apenas se não expirada).
  try {
    if (typeof window === "undefined") return null;
    const key = Object.keys(window.localStorage).find((k) => /^sb-.+-auth-token$/.test(k));
    if (!key) return null;
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "null");
    if (
      parsed?.access_token &&
      typeof parsed?.expires_at === "number" &&
      parsed.expires_at * 1000 > Date.now() + 30_000
    ) {
      return parsed as Session;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function isCaseOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return CASE_OWNER_EMAILS.includes(email.trim().toLowerCase());
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

type MaybeUser =
  | {
      email?: string | null;
      user_metadata?: { role?: string | null } | null;
    }
  | null
  | undefined;

export function isAdminUser(user: MaybeUser): boolean {
  if (!user) return false;
  if (isAdminEmail(user.email)) return true;
  const role = (user.user_metadata?.role ?? "").toString().trim().toLowerCase();
  return role === "admin";
}

export const ALLOWED_NON_ADMIN_ROUTES = [
  "/fechamento",
  // Cada vendedor vê apenas o próprio comissionamento (filtrado no servidor).
  "/comissionamento",
  "/fechamento-semanal",
  
  "/indicacoes",
  "/coach",
  "/arena",
  "/leads-dia",
];

// Vendedores autorizados a ver a visão individual de Performance/Conversas/Ligações no Coach.
// Qualquer outro utilizador não-admin vê essas abas vazias.
// E-mails novos (Clint) + antigos (login continua válido). Luana saiu da empresa.
export const ALLOWED_SELLER_EMAILS = [
  "ritasbandeira@gmail.com",
  "gp5230158@gmail.com",
  "fabionadal@llmidiaco.com",
  "fabio.nadal19@gmail.com",
  "joaopessoa@llmidiaco.com",
  "jpessoa20@hotmail.com",
  "kesia@llmidiaco.com",
];

export function isAllowedSellerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ALLOWED_SELLER_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * E-mail de login → nome do vendedor em `bi_seller_config`.
 *
 * Serve para o comissionamento individual: cada vendedor só enxerga a própria
 * linha, e a identidade vem SEMPRE do token (nunca do payload do cliente).
 */
export const SELLER_NAME_BY_EMAIL: Record<string, string> = {
  "ritasbandeira@gmail.com": "Rita Bandeira",
  "rita@llmidiaco.com": "Rita Bandeira",
  "gp5230158@gmail.com": "Gisele Pimentel",
  "giselegagliano@lucianolarrossa.com": "Gisele Pimentel",
  "gisele@llmidiaco.com": "Gisele Pimentel",
  "joaopessoa@llmidiaco.com": "João Pessoa",
  "joaopessoa@lucianolarrossa.com": "João Pessoa",
  "jpessoa20@hotmail.com": "João Pessoa",
  "pamela@llmidiaco.com": "Pamela",
  "fabionadal@llmidiaco.com": "Fabio Nadal",
  "fabio.nadal19@gmail.com": "Fabio Nadal",
  "kesia@llmidiaco.com": "Kesia Nandi",
  "kesiawnandi@gmail.com": "Kesia Nandi",
};

/** Nome do vendedor correspondente ao e-mail de login, se houver. */
export function sellerNameForEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return SELLER_NAME_BY_EMAIL[email.trim().toLowerCase()] ?? null;
}
