import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fetchConversaoFunilFn, type ConversaoRow } from "@/lib/conversao-funil.functions";
import { Gauge, CalendarClock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Metas de aproveitamento (conversão lead→venda) por funil.
 * Baselines históricos informados pela liderança; meta do trimestre = 2× a baseline.
 */
const DEFAULT_BASELINES: Record<string, number> = {
  "PIPELINE_COMERCIAL-V3": 2.97,
  "Sessão Estratégica": 5,
  "WGT - Perpétuo": 0.47,
};
const DEFAULT_BASELINE_FALLBACK = 2;
const MULTIPLICADOR_META = 2;

const STORE_KEY = "metas-funil-v1";

type Config = {
  baselines: Record<string, number>;
  metas: Record<string, number>;
  comparecimento: number; // % de reuniões agendadas que acontecem
  fechamento: number; // % de reuniões realizadas que viram venda
};

const DEFAULT_CONFIG: Config = {
  baselines: {},
  metas: {},
  comparecimento: 48.6,
  fechamento: 33,
};

function loadConfig(): Config {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Config) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function fmtPct(v: number) {
  return `${v.toFixed(2)}%`;
}

function weeksBetween(from: string, to: string) {
  const ms = new Date(`${to}T23:59:59Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.max(1, ms / (7 * 24 * 3600 * 1000));
}

export function MetasFunilCard({ from, to, title }: { from: string; to: string; title: string }) {
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  useEffect(() => setCfg(loadConfig()), []);
  const save = (next: Config) => {
    setCfg(next);
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["conversao-funil", from, to],
    queryFn: () => fetchConversaoFunilFn({ data: { from, to } }),
    staleTime: 5 * 60_000,
  });

  const rows = useMemo(() => {
    const map = new Map<string, { funnel: string; leads: number; vendas: number; valor: number }>();
    for (const r of (data ?? []) as ConversaoRow[]) {
      const cur = map.get(r.funnel) ?? { funnel: r.funnel, leads: 0, vendas: 0, valor: 0 };
      cur.leads += r.leads;
      cur.vendas += r.vendas;
      cur.valor += r.valor;
      map.set(r.funnel, cur);
    }
    const semanas = weeksBetween(from, to);
    return Array.from(map.values())
      .map((f) => {
        const baseline =
          cfg.baselines[f.funnel] ?? DEFAULT_BASELINES[f.funnel] ?? DEFAULT_BASELINE_FALLBACK;
        const meta = cfg.metas[f.funnel] ?? baseline * MULTIPLICADOR_META;
        const real = f.leads > 0 ? (f.vendas / f.leads) * 100 : 0;
        const vendasMeta = (f.leads * meta) / 100;
        const gap = f.vendas - vendasMeta;
        // Reuniões necessárias: vendas alvo ÷ taxa de fechamento, e agendamentos ÷ comparecimento
        const reunioesRealizadas = cfg.fechamento > 0 ? vendasMeta / (cfg.fechamento / 100) : 0;
        const agendamentos = cfg.comparecimento > 0 ? reunioesRealizadas / (cfg.comparecimento / 100) : 0;
        return {
          ...f,
          baseline,
          meta,
          real,
          vendasMeta,
          gap,
          atingimento: meta > 0 ? (real / meta) * 100 : 0,
          reunioesSemana: reunioesRealizadas / semanas,
          agendamentosSemana: agendamentos / semanas,
        };
      })
      .filter((f) => f.leads > 0 || f.vendas > 0)
      .sort((a, b) => b.leads - a.leads);
  }, [data, cfg, from, to]);

  const totals = rows.reduce(
    (a, r) => ({
      leads: a.leads + r.leads,
      vendas: a.vendas + r.vendas,
      vendasMeta: a.vendasMeta + r.vendasMeta,
      reunioesSemana: a.reunioesSemana + r.reunioesSemana,
      agendamentosSemana: a.agendamentosSemana + r.agendamentosSemana,
    }),
    { leads: 0, vendas: 0, vendasMeta: 0, reunioesSemana: 0, agendamentosSemana: 0 },
  );

  const statusBadge = (atg: number) => {
    if (atg >= 100) return <Badge className="bg-emerald-500/15 text-emerald-500 border-0">No alvo</Badge>;
    if (atg >= 70) return <Badge className="bg-amber-500/15 text-amber-500 border-0">Atenção</Badge>;
    return <Badge className="bg-red-500/15 text-red-500 border-0">Abaixo</Badge>;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            {title}
          </CardTitle>
          <div className="flex items-center gap-3 flex-wrap text-xs">
            <label className="flex items-center gap-1 text-muted-foreground">
              Comparecimento
              <Input
                type="number"
                value={cfg.comparecimento}
                onChange={(e) => save({ ...cfg, comparecimento: Number(e.target.value) })}
                className="h-7 w-16 text-xs"
              />
              %
            </label>
            <label className="flex items-center gap-1 text-muted-foreground">
              Fechamento reunião
              <Input
                type="number"
                value={cfg.fechamento}
                onChange={(e) => save({ ...cfg, fechamento: Number(e.target.value) })}
                className="h-7 w-16 text-xs"
              />
              %
            </label>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => save(DEFAULT_CONFIG)}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Padrões
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="text-sm text-muted-foreground px-4 py-6">Carregando metas…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground px-4 py-6">Sem dados no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-border bg-muted/40">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Funil</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Leads</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Vendas</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Baseline</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Meta %</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Realizado %</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[16%]">Atingimento</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Vendas p/ meta</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Reuniões/sem</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.funnel} className="border-t border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2 font-medium truncate max-w-[200px]">{r.funnel}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.leads}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-500 font-medium">{r.vendas}</td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        step="0.01"
                        value={r.baseline}
                        onChange={(e) =>
                          save({ ...cfg, baselines: { ...cfg.baselines, [r.funnel]: Number(e.target.value) } })
                        }
                        className="h-7 w-20 text-xs text-right ml-auto"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        step="0.01"
                        value={Number(r.meta.toFixed(2))}
                        onChange={(e) =>
                          save({ ...cfg, metas: { ...cfg.metas, [r.funnel]: Number(e.target.value) } })
                        }
                        className="h-7 w-20 text-xs text-right ml-auto"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtPct(r.real)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full ${r.atingimento >= 100 ? "bg-emerald-500" : r.atingimento >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${Math.min(100, r.atingimento)}%` }}
                          />
                        </div>
                        {statusBadge(r.atingimento)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.vendasMeta.toFixed(1)}
                      <span className={`ml-1 text-xs ${r.gap >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        ({r.gap >= 0 ? "+" : ""}
                        {r.gap.toFixed(1)})
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.reunioesSemana.toFixed(1)}
                      <span className="text-xs text-muted-foreground ml-1">
                        (agendar {r.agendamentosSemana.toFixed(1)})
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.leads}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.vendas}</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtPct(totals.leads > 0 ? (totals.vendas / totals.leads) * 100 : 0)}
                  </td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right tabular-nums">{totals.vendasMeta.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.reunioesSemana.toFixed(1)}</td>
                </tr>
              </tfoot>
            </table>
            <div className="px-4 py-3 border-t border-border/40 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" />
                Plano da semana: <strong className="text-foreground">{Math.ceil(totals.agendamentosSemana)}</strong>{" "}
                reuniões agendadas →{" "}
                <strong className="text-foreground">{Math.ceil(totals.reunioesSemana)}</strong> realizadas →{" "}
                <strong className="text-foreground">
                  {(totals.reunioesSemana * (cfg.fechamento / 100)).toFixed(1)}
                </strong>{" "}
                vendas/semana
              </span>
              <span>
                Meta = 2× a baseline histórica do funil (V3 2,97% · Sessão Estratégica 5% · WGT 0,47%). Baseline e meta
                são editáveis por funil.
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
