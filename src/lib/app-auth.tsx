import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";

/**
 * Contexto de sessão do layout /_app.
 *
 * Vive num módulo próprio de propósito: com autoCodeSplitting, o componente da
 * rota vai para outro chunk, e um createContext declarado dentro do arquivo de
 * rota acabava duplicado — o Provider ficava num módulo e o useContext noutro,
 * então as páginas ficavam eternamente em "Carregando…".
 */
export type AppUser = { email: string | null; user_metadata?: any } | null;

export type AppAuth = {
  session: Session | null;
  user: AppUser;
  admin: boolean;
  /** true enquanto a sessão ainda não foi resolvida. */
  loading: boolean;
};

export const AppAuthCtx = createContext<AppAuth>({
  session: null,
  user: null,
  admin: false,
  loading: true,
});

export function useAppAuth(): AppAuth {
  return useContext(AppAuthCtx);
}
