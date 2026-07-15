import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { isAdminUser } from "@/lib/auth";
import logoIcon from "@/assets/logo-icon.png";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

const GOOGLE_NEXT_KEY = "dashcomercial_google_next";

function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.startsWith("/auth")) return null;
  return value;
}

function getPendingDestination(user: any) {
  const stored = typeof window !== "undefined" ? safeNext(window.sessionStorage.getItem(GOOGLE_NEXT_KEY)) : null;
  if (typeof window !== "undefined") window.sessionStorage.removeItem(GOOGLE_NEXT_KEY);
  if (stored) return stored;
  return isAdminUser(user) ? "/" : "/fechamento";
}

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const go = (u: any) => {
      navigate({ to: getPendingDestination(u), replace: true });
    };
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) go(data.session.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
        go(session.user);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);


  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const u = data.user;
    navigate({ to: isAdminUser(u) ? "/" : "/fechamento", replace: true });
  }

  async function onGoogle() {
    setGoogleLoading(true);
    try {
      const next = safeNext(new URLSearchParams(window.location.search).get("next"));
      window.sessionStorage.setItem(GOOGLE_NEXT_KEY, next ?? "/");
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        const message = result.error.message || "Falha ao entrar com Google";
        toast.error(message === "Sign in was cancelled" ? "Login cancelado ou interrompido. Toque em Continuar com Google novamente." : message);
        return;
      }
      if (result.redirected) return;

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        navigate({ to: getPendingDestination(data.session.user), replace: true });
      }
    } finally {
      setGoogleLoading(false);
    }
  }


  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <img src={logoIcon} alt="" className="h-10 w-10 object-contain" />
          <div>
            <h1 className="text-base font-semibold">Dashcomercial LLMídia</h1>
            <p className="text-xs text-muted-foreground">Entre com suas credenciais</p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onGoogle}
          disabled={googleLoading || loading}
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {googleLoading ? "Abrindo Google..." : "Continuar com Google"}
        </Button>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">ou</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading || googleLoading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
