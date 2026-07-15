import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isAdminUser, ALLOWED_NON_ADMIN_ROUTES } from "@/lib/auth";
import logoIcon from "@/assets/logo-icon.png";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.startsWith("/auth")) return null;
  return value;
}

function getDestination(user: any, next: string | null) {
  if (isAdminUser(user)) return next ?? "/";
  return next && ALLOWED_NON_ADMIN_ROUTES.includes(next) ? next : "/fechamento";
}

async function completeOAuthSession() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  if (accessToken && refreshToken) {
    await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  }

  return supabase.auth.getSession();
}

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Finalizando login com Google…");

  useEffect(() => {
    let cancelled = false;
    const next = safeNext(new URLSearchParams(window.location.search).get("next"));
    async function finish() {
      try {
        const { data, error } = await completeOAuthSession();
        if (error) throw error;
        const session = data.session;
        if (!session) throw new Error("Sessão não encontrada após o login.");
        if (cancelled) return;
        navigate({ to: getDestination(session.user, next), replace: true });
      } catch (error) {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : "Não foi possível concluir o login.");
        window.setTimeout(() => navigate({ to: "/auth", replace: true }), 1800);
      }
    }
    void finish();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <img src={logoIcon} alt="" className="mx-auto h-10 w-10 object-contain" />
        <h1 className="mt-4 text-base font-semibold">Dashcomercial LLMídia</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}