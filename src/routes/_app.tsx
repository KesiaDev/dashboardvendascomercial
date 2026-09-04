import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  Plane,
  Swords,
  Bot,
  Megaphone,
  Network,
  Receipt,
  Upload,
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

/**
 * Navegação agrupada.
 *
 * O menu antes listava 12 itens sem seção nenhuma, e 11 rotas — cerca de 4.200
 * linhas de interface, incluindo /comercial, /executivo e /resultados — não tinham
 * entrada alguma: só se chegava nelas digitando a URL. Todas as rotas de
 * src/routes/_app.*.tsx estão aqui agora.
 *
 * adminOnly precisa espelhar ALLOWED_NON_ADMIN_ROUTES em src/lib/auth.ts: qualquer
 * rota fora daquela lista redireciona um não-admin de volta para /fechamento, então
 * mostrá-la no menu dele seria um link para lugar nenhum.
 */
const NAV_SECTIONS = [
  {
    section: "Operação",
    items: [
      { to: "/fechamento", label: "Fechamento", icon: ClipboardCheck, adminOnly: false },
      {
        to: "/fechamento-semanal",
        label: "Fechamento Semanal",
        icon: CalendarDays,
        adminOnly: false,
      },
      { to: "/leads-dia", label: "Leads por Dia", icon: CalendarRange, adminOnly: false },
      { to: "/import", label: "Importar CSV", icon: Upload, adminOnly: true },
    ],
  },
  {
    section: "Performance",
    items: [{ to: "/ranking", label: "Ranking", icon: Trophy, adminOnly: true }],
  },
  {
    section: "Metas e Dinheiro",
    items: [
      { to: "/vendas-reais", label: "Vendas Reais", icon: Receipt, adminOnly: true },
      { to: "/comissionamento", label: "Comissionamento", icon: DollarSign, adminOnly: true },
    ],
  },

  {
    section: "Time",
    items: [
      { to: "/coach", label: "Coach Comercial", icon: Sparkles, adminOnly: false },
      { to: "/arena", label: "Arena Comercial", icon: Swords, adminOnly: false },
      { to: "/ferias", label: "Férias da Equipe", icon: Plane, adminOnly: false },
      { to: "/indicacoes", label: "Indicações", icon: Share2, adminOnly: false },
      { to: "/usuarios", label: "Usuários", icon: Users, adminOnly: true },
    ],
  },
  {
    section: "Ferramentas",
    items: [
      { to: "/agente-ia", label: "Agente IA", icon: Bot, adminOnly: true },
      { to: "/agente", label: "Agente (chat)", icon: Bot, adminOnly: true },
      { to: "/campanha", label: "Campanhas", icon: Megaphone, adminOnly: true },
      { to: "/areas", label: "Áreas do Pipeline", icon: Network, adminOnly: true },
    ],
  },
] as const;

const NAV_LINK_CLASS =
  "inline-flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground [&.active]:bg-secondary [&.active]:text-foreground";

const SECTION_LABEL_CLASS =
  "px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70";

function NavList({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5 p-3">
      {sections.map(({ section, items }) => (
        <div key={section}>
          <p className={SECTION_LABEL_CLASS}>{section}</p>
          {items.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} onClick={onNavigate} className={NAV_LINK_CLASS}>
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

type NavSection = {
  section: string;
  items: readonly { to: string; label: string; icon: typeof Trophy }[];
};

// Sessão já resolvida pelo layout /_app; as rotas filhas consomem useAppAuth
// (definido em @/lib/app-auth) em vez de repetir a verificação.
export { useAppAuth } from "@/lib/app-auth";
export type { AppAuth, AppUser } from "@/lib/app-auth";

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
  const navSections: NavSection[] = NAV_SECTIONS.map((s) => ({
    section: s.section,
    items: s.items.filter((i) => admin || !i.adminOnly),
  })).filter((s) => s.items.length > 0);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[260px_1fr]">
      {/* Sidebar fixa no desktop. Antes a navegação era um Sheet em TODOS os
          breakpoints: num monitor de 27" o gestor gastava dois cliques para trocar
          de página e não tinha nenhuma noção de onde estava. */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r lg:border-border lg:bg-card/40 lg:backdrop-blur">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <img
            src={logoIcon}
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 object-contain"
          />
          <span className="text-sm font-semibold">Dashcomercial LLMídia</span>
        </div>
        <div className="flex-1 overflow-y-auto pb-4">
          <NavList sections={navSections} />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-center gap-3">
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Abrir menu" className="lg:hidden">
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
                  <div className="overflow-y-auto pb-4">
                    <NavList sections={navSections} onNavigate={() => setOpen(false)} />
                  </div>
                </SheetContent>
              </Sheet>
              <img
                src={logoIcon}
                alt="Dashcomercial LLMídia"
                width={36}
                height={36}
                className="h-9 w-9 object-contain lg:hidden"
              />
              <span className="text-sm font-semibold lg:hidden">Dashcomercial LLMídia</span>
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
    </div>
  );
}
