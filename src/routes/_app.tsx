import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { BarChart3, Bot, Upload, Users } from "lucide-react";
import { CurrencyToggle } from "@/components/currency-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import logoIcon from "@/assets/logo-icon.png";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <img src={logoIcon} alt="Dashcomercial LLMídia" className="h-10 w-10 object-contain" />
            <h1 className="text-sm font-semibold leading-tight">Dashcomercial LLMídia</h1>
          </div>
          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-1">
              <NavLink to="/" icon={<BarChart3 className="h-4 w-4" />}>Dashboard</NavLink>
              <NavLink to="/comercial" icon={<Users className="h-4 w-4" />}>Comercial</NavLink>
              <NavLink to="/agente" icon={<Bot className="h-4 w-4" />}>Agente IA</NavLink>
              <NavLink to="/import" icon={<Upload className="h-4 w-4" />}>Importar</NavLink>
            </nav>
            <div className="mx-2 h-6 w-px bg-border" />
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

function NavLink({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: true }}
      className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground [&.active]:bg-secondary [&.active]:text-foreground"
    >
      {icon}
      {children}
    </Link>
  );
}
