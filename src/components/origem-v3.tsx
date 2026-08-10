import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchOrigemV3Fn } from "@/lib/origem-v3.functions";
import { ChevronDown, ChevronRight, Route as RouteIcon } from "lucide-react";

function pct(n: number, d: number) {
  return d > 0 ? (n / d) * 100 : 0;
}
function pctColor(v: number) {
  if (v >= 10) return "text-emerald-500";
  if (v >= 4) return "text-amber-500";
  return "text-red-500";
}

export function OrigemV3Card({ from, to, title }: { from: string; to: string; title: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["origem-v3", from, to],
    queryFn: () => fetchOrigemV3Fn({ data: { from, to } }),
    staleTime: 5 * 60_000,
  });

  const rows = data ?? [];
  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          leads: a.leads + r.leads,
          abertos: a.abertos + r.abertos,
          perdidos: a.perdidos + r.perdidos,
          ganhos: a.ganhos + r.ganhos,
        }),
        { leads: 0, abertos: 0, perdidos: 0, ganhos: 0 },
      ),
    [rows],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <RouteIcon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="text-sm text-muted-foreground px-4 py-6">Carregando origens…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground px-4 py-6">Sem leads no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-border bg-muted/40">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Origem / Campanha</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Leads</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Em aberto</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Perdidos</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Ganhos</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Conversão</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isOpen = open[r.origem] ?? false;
                  return (
                    <React.Fragment key={r.origem}>
                      <tr
                        className="border-t border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
                        onClick={() => setOpen((o) => ({ ...o, [r.origem]: !isOpen }))}
                      >
                        <td className="px-4 py-2 font-semibold">
                          <span className="flex items-center gap-1.5">
                            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            {r.origem}
                            <span className="text-xs font-normal text-muted-foreground">
                              ({r.campanhas.length} campanha{r.campanhas.length !== 1 ? "s" : ""})
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.leads}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.abertos}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.perdidos}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-500 font-medium">{r.ganhos}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${pctColor(pct(r.ganhos, r.leads))}`}>
                          {r.leads > 0 ? `${pct(r.ganhos, r.leads).toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                      {isOpen &&
                        r.campanhas.map((c) => (
                          <tr key={`${r.origem}-${c.campanha}`} className="border-t border-border/30 hover:bg-muted/10">
                            <td className="px-4 py-1.5 pl-10 text-muted-foreground truncate max-w-[320px]">{c.campanha}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{c.leads}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">—</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">—</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-emerald-500">{c.ganhos}</td>
                            <td className={`px-3 py-1.5 text-right tabular-nums ${pctColor(pct(c.ganhos, c.leads))}`}>
                              {c.leads > 0 ? `${pct(c.ganhos, c.leads).toFixed(1)}%` : "—"}
                            </td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.leads}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.abertos}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.perdidos}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.ganhos}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(totals.ganhos, totals.leads).toFixed(1)}%</td>
                </tr>
              </tfoot>
            </table>
            <p className="text-xs text-muted-foreground px-4 py-2 border-t border-border/40">
              A Clint não envia "tags" no negócio: a origem real é reconstruída pelos campos UTM gravados no lead
              (campanha, página de origem, conteúdo) somados ao funil de entrada — Minicurso V3, Ebook V3, Palestras e
              Sessão Estratégica. Ganhos aqui são os negócios marcados como WON na Clint no período.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
