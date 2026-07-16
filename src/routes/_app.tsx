import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BarChart3, ClipboardCheck, CalendarDays, CalendarClock, Trophy, TrendingUp, DollarSign, Menu, TrendingUpIcon, GitMerge, Sparkles, Share2, LogOut, Users } from "lucide-react";
import { CurrencyToggle } from "@/components/currency-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { isAdminUser, ALLOWED_NON_ADMIN_ROUTES } from "@/lib/auth";
import logoIcon from "@/assets/logo-icon.png";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const ALL_NAV_ITEMS = [
  { to: "/",                    label: "Visão Geral",        icon: BarChart3,        adminOnly: true },
  { to: "/fechamento",          label: "Fechamento",         icon: ClipboardCheck,   adminOnly: false },
  { to: "/fechamento-semanal",  label: "Fechamento Semanal", icon: CalendarDays,     adminOnly: false },
  { to: "/ranking",             label: "Ranking",            icon: Trophy,           adminOnly: true },
  { to: "/resultados",          label: "Resultados",         icon: TrendingUp,       adminOnly: true },
  { to: "/vendas-reais",        label: "Vendas Reais",       icon: TrendingUpIcon,   adminOnly: true },
  { to: "/comissionamento",     label: "Comissionamento",    icon: DollarSign,       adminOnly: true },
  { to: "/funis",               label: "Funis",              icon: GitMerge,         adminOnly: true },
  { to: "/coach",               label: "Análise Comercial",  icon: Sparkles,         adminOnly: true },
  { to: "/indicacoes",          label: "Indicações",         icon: Share2,           adminOnly: true },
  { to: "/usuarios",            label: "Usuários",           icon: Users,            adminOnly: true },
] as const;

function AppLayout() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"loading" | "auth" | "ready">("loading");
  const [user, setUser] = useState<{ email: string | null; user_metadata?: any } | null>(null);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUser(data.session?.user ? { email: data.session.user.email ?? null, user_metadata: data.session.user.user_metadata } : null);
      setStatus(data.session ? "ready" : "auth");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setUser(session?.user ? { email: session.user.email ?? null, user_metadata: session.user.user_metadata } : null);
      setStatus(session ? "ready" : "auth");
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
    if (!ALLOWED_NON_ADMIN_ROUTES.includes(pathname)) {
      navigate({ to: "/fechamento", replace: true });
    }
  }, [status, admin, pathname, navigate]);

  if (status !== "ready") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

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
                    <img src={logoIcon} alt="" className="h-8 w-8 object-contain" />
                    <span className="text-sm">Dashcomercial LLMídia</span>
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-1 p-3">
                  {navItems.map(({ to, label, icon: Icon }) => (
                    <Link
                      key={to}
                      to={to}
                      activeOptions={{ exact: to === "/" }}
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
            <img src={logoIcon} alt="Dashcomercial LLMídia" className="h-9 w-9 object-contain" />
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
        <Outlet />
      </main>
    </div>
  );
}
