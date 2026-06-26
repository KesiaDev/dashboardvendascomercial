import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { BarChart3, Upload } from "lucide-react";
import { CurrencyToggle } from "@/components/currency-toggle";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground font-bold">
              LL
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">Dashboard de Vendas</h1>
              <p className="text-xs text-muted-foreground leading-tight">Resultado semanal por produto</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-1">
              <NavLink to="/" icon={<BarChart3 className="h-4 w-4" />}>Dashboard</NavLink>
              <NavLink to="/import" icon={<Upload className="h-4 w-4" />}>Importar</NavLink>
            </nav>
            <div className="mx-2 h-6 w-px bg-border" />
            <CurrencyToggle />
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
