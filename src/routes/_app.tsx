import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BarChart3, ClipboardCheck, CalendarDays, Trophy, TrendingUp, DollarSign, Menu, TrendingUpIcon, GitMerge } from "lucide-react";
import { CurrencyToggle } from "@/components/currency-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import logoIcon from "@/assets/logo-icon.png";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const NAV_ITEMS = [
  { to: "/",                    label: "Visão Geral",        icon: BarChart3 },
  { to: "/fechamento",          label: "Fechamento",         icon: ClipboardCheck },
  { to: "/fechamento-semanal",  label: "Fechamento Semanal", icon: CalendarDays },
  { to: "/ranking",             label: "Ranking",            icon: Trophy },
  { to: "/resultados",          label: "Resultados",         icon: TrendingUp },
  { to: "/vendas-reais",        label: "Vendas Reais",       icon: TrendingUpIcon },
  { to: "/comissionamento",     label: "Comissionamento",    icon: DollarSign },
  { to: "/funis",               label: "Funis",              icon: GitMerge },
] as const;

function AppLayout() {
  const [open, setOpen] = useState(false);

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
                  {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
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
            <CurrencyToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
