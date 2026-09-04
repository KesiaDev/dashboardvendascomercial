import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ClipboardCheck,
  CalendarDays,
  CalendarRange,
  Trophy,
  DollarSign,
  Menu,
  Sparkles,
  Share2,
  LogOut,
  Users,
  Target,
  Plane,
  Swords,
  Bot,
} from "lucide-react";
import { CurrencyToggle } from "@/components/currency-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { isAdminUser, ALLOWED_NON_ADMIN_ROUTES, getSessionFast } from "@/lib/auth";
import logoIcon from "@/assets/logo-icon.webp";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const ALL_NAV_ITEMS = [
  { to: "/fechamento", label: "Fechamento", icon: ClipboardCheck, adminOnly: false },
  { to: "/fechamento-semanal", label: "Fechamento Semanal", icon: CalendarDays, adminOnly: false },

  { to: "/ferias", label: "Férias da Equipe", icon: Plane, adminOnly: false },
  { to: "/ranking", label: "Ranking", icon: Trophy, adminOnly: true },
  { to: "/metas-comercial", label: "Metas Comercial", icon: Target, adminOnly: true },

  { to: "/comissionamento", label: "Comissionamento", icon: DollarSign, adminOnly: true },
  { to: "/coach", label: "Análise Comercial", icon: Sparkles, adminOnly: false },
  { to: "/leads-dia", label: "Leads por Dia", icon: CalendarRange, adminOnly: false },
  { to: "/agente-ia", label: "Agente IA", icon: Bot, adminOnly: true },
  { to: "/arena", label: "Arena Comercial", icon: Swords, adminOnly: false },
  { to: "/indicacoes", label: "Indicações", icon: Share2, adminOnly: false },
  { to: "/usuarios", label: "Usuários", icon: Users, adminOnly: true },
] as const;

export type AppUser = { email: string | null; user_metadata?: any } | null;

export type AppAuth = {
  session: Session | null;
  user: AppUser;
  admin: boolean;
  /** true enquanto a sessão ainda não foi resolvida. */
  loading: boolean;
};

const AppAuthCtx = createContext<AppAuth>({
  session: null,
  user: null,
  admin: false,
  loading: true,
});

/**
 * Sessão já resolvida pelo layout /_app.
 *
 * As rotas filhas NÃO devem chamar getSessionFast() nem supabase.auth.getUser()
 * de novo: /fechamento repetia o mesmo getSessionFast e /coach fazia um
 * supabase.auth.getUser(), que é uma requisição de rede ao GoTrue, como terceira
 * verificação em série antes de qualquer dado carregar.
 */
export function useAppAuth(): AppAuth {
  return useContext(AppAuthCtx);
}

function AppLayout() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"loading" | "auth" | "ready">("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser>(null);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    let cancelled = false;
    getSessionFast().then((s) => {
      if (cancelled) return;
      setSession(s ?? null);
      setUser(
        s?.user ? { email: s.user.email ?? null, user_metadata: s.user.user_metadata } : null,
      );
      setStatus(s ? "ready" : "auth");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setSession(s ?? null);
      setUser(
        s?.user ? { email: s.user.email ?? null, user_metadata: s.user.user_metadata } : null,
      );
      setStatus(s ? "ready" : "auth");
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (status === "auth") navigate({ to: "/auth", replace: true });
  }, [status, navigate]);

  const admin = isAdminUser(user);

  useEffect(() => {
    if (status !== "ready") return;
    if (admin) return;
    const allowed = ALLOWED_NON_ADMIN_ROUTES.some(
      (r) => pathname === r || pathname.startsWith(r + "/"),
    );
    if (!allowed) {
      navigate({ to: "/fechamento", replace: true });
    }
  }, [status, admin, pathname, navigate]);

  const ready = status === "ready";

  const auth = useMemo<AppAuth>(
    () => ({ session, user, admin, loading: !ready }),
    [session, user, admin, ready],
  );

  // Antes, o layout inteiro era substituído por um <div>Carregando…</div> enquanto
  // a sessão resolvia — inclusive no SSR, onde useEffect nem roda, então o servidor
  // renderizava essa string para as 26 rotas. Agora o cabeçalho e a navegação
  // pintam imediatamente e só o conteúdo da rota espera.
  const navItems = ALL_NAV_ITEMS.filter((item) => admin || !item.adminOnly);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Abrir menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="border-b border-border px-6 py-4">
                  <SheetTitle className="flex items-center gap-3">
                    <img
                      src={logoIcon}
                      alt=""
                      width={32}
                      height={32}
                      className="h-8 w-8 object-contain"
                    />
                    <span className="text-sm">Dashcomercial LLMídia</span>
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-1 p-3">
                  {navItems.map(({ to, label, icon: Icon }) => (
                    <Link
                      key={to}
                      to={to}
                      onClick={() => setOpen(false)}
                      className="inline-flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground [&.active]:bg-secondary [&.active]:text-foreground"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                    </Link>
                  ))}
                </nav>
              </SheetContent>
            </Sheet>
            <img
              src={logoIcon}
              alt="Dashcomercial LLMídia"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
            />
            <span className="text-sm font-semibold">Dashcomercial LLMídia</span>
          </div>
          <div className="flex items-center gap-2">
            {admin && <CurrencyToggle />}
            <ThemeToggle />
            <span className="hidden text-xs text-muted-foreground sm:inline">{user?.email}</span>
            <Button variant="ghost" size="icon" aria-label="Sair" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <AppAuthCtx.Provider value={auth}>
          {ready ? (
            <Outlet />
          ) : (
            <div className="space-y-4" aria-busy="true" aria-live="polite">
              <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-[104px] animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
              <div className="h-[280px] animate-pulse rounded-xl bg-muted" />
              <span className="sr-only">Carregando…</span>
            </div>
          )}
        </AppAuthCtx.Provider>
      </main>
    </div>
  );
}
