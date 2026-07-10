import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchCampanhaDataFn } from "@/lib/data.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Users, Inbox, Zap, AlertCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_app/campanha")({
  component: CampanhaPage,
});

// ── Helpers ────────────────────────────────────────────────────────────────

const PALESTRAS_ID = "7c07456e-d803-497d-8595-c0e181f7d4db";

/** Quantos dias atrás foi o updated_stage_at */
function daysAgo(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / 86_400_000);
}

const CADENCE_WINDOWS = [
  { label: "D+3", emoji: "📩", color: "#6366f1", start: 3, end: 5 },
  { label: "D+7", emoji: "💡", color: "#f59e0b", start: 6, end: 8 },
  { label: "D+10", emoji: "⏳", color: "#f97316", start: 9, end: 11 },
  { label: "D+14", emoji: "🙏", color: "#ef4444", start: 12, end: 15 },
];

function getWindow(dateStr: string | null | undefined): string | null {
  const d = daysAgo(dateStr);
  if (d === null) return null;
  for (const w of CADENCE_WINDOWS) {
    if (d >= w.start && d <= w.end) return w.label;
  }
  return null;
}

function shortName(full: string | null | undefined): string {
  if (!full) return "—";
  return full.split(" ")[0];
}

const VENDOR_COLORS = ["#6366f1","#f59e0b","#10b981","#f97316","#8b5cf6"];

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: number | string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-5 flex items-start gap-4">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Leads Novos tab ────────────────────────────────────────────────────────

function LeadsNovosTab({ leadsNovos }: { leadsNovos: any[] }) {
  const byFunnel = useMemo(() => {
    const map: Record<string, { name: string; total: number; byVendor: Record<string, number> }> = {};
    for (const d of leadsNovos) {
      const name = d.origin_name || d.origin_id || "Desconhecido";
      if (!map[name]) map[name] = { name, total: 0, byVendor: {} };
      map[name].total++;
      const v = shortName(d.user_name) || "(sem dono)";
      map[name].byVendor[v] = (map[name].byVendor[v] ?? 0) + 1;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [leadsNovos]);

  const byVendor = useMemo(() => {
    const map: Record<string, { name: string; total: number; funnels: Record<string, number> }> = {};
    for (const d of leadsNovos) {
      const v = shortName(d.user_name) || "(sem dono)";
      if (!map[v]) map[v] = { name: v, total: 0, funnels: {} };
      map[v].total++;
      const fn = d.origin_name || "Desconhecido";
      map[v].funnels[fn] = (map[v].funnels[fn] ?? 0) + 1;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [leadsNovos]);

  const chartData = byFunnel.slice(0, 8).map((f) => ({ name: f.name.length > 22 ? f.name.slice(0, 20) + "…" : f.name, total: f.total }));

  const semDono = leadsNovos.filter((d) => !d.user_id).length;
  const palestras = leadsNovos.filter((d) => d.origin_id === PALESTRAS_ID).length;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Inbox}   label="Total de leads esta semana"         value={leadsNovos.length} />
        <StatCard icon={Zap}     label="Funis Perpétuos"                    value={leadsNovos.length - palestras} />
        <StatCard icon={AlertCircle} label="Sem responsável"               value={semDono} sub={semDono > 0 ? "leads sem dono atribuído" : "todos atribuídos ✅"} />
      </div>

      {/* Chart + vendor table side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Bar chart by funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Leads por Funil</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhum lead novo esta semana.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={160} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [v, "Leads"]} />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={VENDOR_COLORS[i % VENDOR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Vendor ranking */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Por Vendedor</CardTitle>
          </CardHeader>
          <CardContent>
            {byVendor.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhum lead esta semana.</p>
            ) : (
              <div className="space-y-3">
                {byVendor.map((v, i) => (
                  <div key={v.name} className="flex items-center gap-3">
                    <div
                      className="h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ background: VENDOR_COLORS[i % VENDOR_COLORS.length] }}
                    >
                      {v.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{v.name}</span>
                        <span className="text-sm font-bold tabular-nums">{v.total}</span>
                      </div>
                      <div className="h-1.5 mt-1 rounded-full bg-border overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.round((v.total / leadsNovos.length) * 100)}%`,
                            background: VENDOR_COLORS[i % VENDOR_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full funnel breakdown table */}
      {byFunnel.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Detalhamento por Funil</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-2 pr-4 font-medium">Funil</th>
                  <th className="pb-2 pr-4 font-medium text-right">Total</th>
                  <th className="pb-2 font-medium">Vendedores</th>
                </tr>
              </thead>
              <tbody>
                {byFunnel.map((f) => (
                  <tr key={f.name} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="py-2.5 pr-4 font-medium max-w-[220px] truncate" title={f.name}>{f.name}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums font-bold">{f.total}</td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(f.byVendor)
                          .sort((a, b) => b[1] - a[1])
                          .map(([vname, cnt]) => (
                            <Badge key={vname} variant="secondary" className="text-xs">
                              {vname} ({cnt})
                            </Badge>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Campanha Retomada tab ──────────────────────────────────────────────────

function RetomadaTab({ retomadaDeals }: { retomadaDeals: any[] }) {
  const { cadenceByVendor, windowTotals, allVendors } = useMemo(() => {
    const byVendor: Record<string, Record<string, any[]>> = {};
    const windowTotals: Record<string, number> = { "D+3": 0, "D+7": 0, "D+10": 0, "D+14": 0 };

    for (const d of retomadaDeals) {
      const w = getWindow(d.updated_stage_at);
      if (!w) continue;
      const v = shortName(d.user_name) || "(sem dono)";
      if (!byVendor[v]) byVendor[v] = { "D+3": [], "D+7": [], "D+10": [], "D+14": [] };
      byVendor[v][w].push(d);
      windowTotals[w] = (windowTotals[w] ?? 0) + 1;
    }

    const allVendors = Object.keys(byVendor).sort();
    return { cadenceByVendor: byVendor, windowTotals, allVendors };
  }, [retomadaDeals]);

  const total = Object.values(windowTotals).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* Window summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CADENCE_WINDOWS.map((w) => (
          <Card key={w.label}>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">{w.emoji} {w.label} — {w.label === "D+3" ? "Follow-up Suave" : w.label === "D+7" ? "Prova Social" : w.label === "D+10" ? "Escassez" : "Encerramento"}</p>
              <p className="text-3xl font-black tabular-nums mt-1" style={{ color: w.color }}>
                {windowTotals[w.label] ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">leads para contactar hoje</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground text-sm">Nenhum lead nos janelas de cadência atualmente.<br/>Os leads aparecem aqui quando o updated_stage_at coincide com D+3/7/10/14.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Vendor × window grid */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Grade Vendedor × Cadência</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-6 font-medium">Vendedor</th>
                    {CADENCE_WINDOWS.map((w) => (
                      <th key={w.label} className="pb-2 px-3 font-medium text-center">
                        {w.emoji} {w.label}
                      </th>
                    ))}
                    <th className="pb-2 pl-3 font-medium text-center">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {allVendors.map((v) => {
                    const row = cadenceByVendor[v];
                    const rowTotal = CADENCE_WINDOWS.reduce((s, w) => s + (row[w.label]?.length ?? 0), 0);
                    return (
                      <tr key={v} className="border-b border-border/50 hover:bg-secondary/30">
                        <td className="py-3 pr-6 font-medium flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary">
                            {v[0]}
                          </div>
                          {v}
                        </td>
                        {CADENCE_WINDOWS.map((w) => {
                          const cnt = row[w.label]?.length ?? 0;
                          return (
                            <td key={w.label} className="py-3 px-3 text-center">
                              {cnt > 0 ? (
                                <span
                                  className="inline-flex items-center justify-center h-7 w-7 rounded-full text-white text-sm font-bold"
                                  style={{ background: w.color }}
                                >
                                  {cnt}
                                </span>
                              ) : (
                                <span className="text-border">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-3 pl-3 text-center font-bold tabular-nums">{rowTotal}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Per-window detail: list of leads */}
          {CADENCE_WINDOWS.map((w) => {
            const allInWindow = Object.values(cadenceByVendor)
              .flatMap((row) => row[w.label] ?? []);
            if (allInWindow.length === 0) return null;
            return (
              <Card key={w.label}>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    {w.emoji} {w.label} — leads para contactar agora ({allInWindow.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border">
                        <th className="pb-2 pr-4 font-medium">Nome</th>
                        <th className="pb-2 pr-4 font-medium">Telefone</th>
                        <th className="pb-2 pr-4 font-medium">Etapa</th>
                        <th className="pb-2 pr-4 font-medium">Vendedor</th>
                        <th className="pb-2 font-medium">Última etapa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allInWindow.map((d: any) => (
                        <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/30">
                          <td className="py-2 pr-4 font-medium">{d.contact_name ?? "—"}</td>
                          <td className="py-2 pr-4 tabular-nums text-muted-foreground">{d.contact_phone ?? "—"}</td>
                          <td className="py-2 pr-4">
                            <Badge variant="outline" className="text-xs">{d.stage ?? "—"}</Badge>
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">{shortName(d.user_name)}</td>
                          <td className="py-2 text-muted-foreground text-xs">
                            {d.updated_stage_at
                              ? new Date(d.updated_stage_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

function CampanhaPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["campanha-data"],
    queryFn: () => fetchCampanhaDataFn(),
    staleTime: 5 * 60 * 1000,
  });

  const weekLabel = useMemo(() => {
    const now = new Date();
    const dow = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    return `${fmt(monday)} a ${fmt(now)}`;
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando dados da campanha…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-destructive text-sm">
        Erro ao carregar: {String(error)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/25">
          <Users className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campanha & Pipeline</h1>
          <p className="text-sm text-muted-foreground">Leads novos • Cadência Retomada</p>
        </div>
      </div>

      <Tabs defaultValue="leads-novos">
        <TabsList>
          <TabsTrigger value="leads-novos">
            Leads Novos <Badge variant="secondary" className="ml-2">{data?.leadsNovos.length ?? 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="retomada">
            Campanha Retomada <Badge variant="secondary" className="ml-2">{data?.retomadaDeals.length ?? 0}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="leads-novos" className="mt-6">
          <div className="mb-3 text-xs text-muted-foreground">
            Semana {weekLabel} · Funis Perpétuos + Palestras (Quem pediu ajuda / Abandono de carrinho)
          </div>
          <LeadsNovosTab leadsNovos={data?.leadsNovos ?? []} />
        </TabsContent>

        <TabsContent value="retomada" className="mt-6">
          <div className="mb-3 text-xs text-muted-foreground">
            Leads na Retomada em etapa Base ou Mensagem 1 · grade de follow-up D+3 / D+7 / D+10 / D+14
          </div>
          <RetomadaTab retomadaDeals={data?.retomadaDeals ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
