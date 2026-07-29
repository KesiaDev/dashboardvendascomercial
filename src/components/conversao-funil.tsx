import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchConversaoFunilFn, type ConversaoRow } from "@/lib/conversao-funil.functions";
import { ChevronDown, ChevronRight, Target } from "lucide-react";

function pct(n: number, d: number) {
  return d > 0 ? (n / d) * 100 : 0;
}
function fmtAprov(v: number) {
  return v > 100 ? ">100%" : `${v.toFixed(1)}%`;
}
function pctColor(v: number) {
  if (v >= 30) return "text-emerald-500";
  if (v >= 15) return "text-amber-500";
  return "text-red-500";
}

type FunnelAgg = {
  funnel: string;
  leads: number;
  won: number;
  lost: number;
  sellers: ConversaoRow[];
};

export function ConversaoFunilCard({
  from,
  to,
  title,
}: {
  from: string;
  to: string;
  title: string;
}) {
  const [hideNoSeller, setHideNoSeller] = useState(true);
  const [openFunnels, setOpenFunnels] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["conversao-funil", from, to],
    queryFn: () => fetchConversaoFunilFn({ data: { from, to } }),
    staleTime: 5 * 60_000,
  });

  const funnels = useMemo<FunnelAgg[]>(() => {
    const rows = (data ?? []).filter((r) =>
      hideNoSeller ? r.seller !== "— sem vendedor —" : true,
    );
    const map = new Map<string, FunnelAgg>();
    for (const r of rows) {
      let f = map.get(r.funnel);
      if (!f) {
        f = { funnel: r.funnel, leads: 0, won: 0, lost: 0, sellers: [] };
        map.set(r.funnel, f);
      }
      f.leads += r.leads;
      f.won += r.won;
      f.lost += r.lost;
      f.sellers.push(r);
    }
    for (const f of map.values()) f.sellers.sort((a, b) => b.won - a.won || b.leads - a.leads);
    return Array.from(map.values()).sort((a, b) => b.won - a.won || b.leads - a.leads);
  }, [data, hideNoSeller]);

  const totals = funnels.reduce(
    (acc, f) => ({ leads: acc.leads + f.leads, won: acc.won + f.won, lost: acc.lost + f.lost }),
    { leads: 0, won: 0, lost: 0 },
  );

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <Target className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7"
          onClick={() => setHideNoSeller((v) => !v)}
        >
          {hideNoSeller ? "Mostrar sem vendedor" : "Ocultar sem vendedor"}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="text-sm text-muted-foreground px-4 py-6">Carregando conversão…</p>
        ) : funnels.length === 0 ? (
          <p className="text-sm text-muted-foreground px-4 py-6">Sem negócios no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-border bg-muted/40">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Funil / Vendedor</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Leads</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Ganhos</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Perdidos</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Conversão</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Aproveit.</th>
                </tr>
              </thead>
              <tbody>
                {funnels.map((f) => {
                  const conv = pct(f.won, f.won + f.lost);
                  const aprov = pct(f.won, f.leads);
                  const isOpen = openFunnels[f.funnel] ?? false;
                  return (
                    <React.Fragment key={f.funnel}>
                      <tr
                        className="border-t border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
                        onClick={() => setOpenFunnels((o) => ({ ...o, [f.funnel]: !isOpen }))}
                      >
                        <td className="px-4 py-2 font-semibold">
                          <span className="flex items-center gap-1.5">
                            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            <span className="truncate max-w-[240px]">{f.funnel}</span>
                            <span className="text-xs font-normal text-muted-foreground">
                              ({f.sellers.length} vendedor{f.sellers.length !== 1 ? "es" : ""})
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{f.leads}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-500 font-medium">{f.won}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{f.lost}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${pctColor(conv)}`}>
                          {conv.toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {fmtAprov(aprov)}
                        </td>
                      </tr>
                      {isOpen &&
                        f.sellers.map((s) => {
                          const sConv = pct(s.won, s.won + s.lost);
                          const sAprov = pct(s.won, s.leads);
                          return (
                            <tr key={`${f.funnel}-${s.seller}`} className="border-t border-border/30 hover:bg-muted/10">
                              <td className="px-4 py-1.5 pl-10 text-muted-foreground truncate max-w-[260px]">
                                {s.seller}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{s.leads}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-emerald-500">{s.won}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{s.lost}</td>
                              <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${pctColor(sConv)}`}>
                                {sConv.toFixed(1)}%
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                                {fmtAprov(sAprov)}
                              </td>
                            </tr>
                          );
                        })}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.leads}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.won}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.lost}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {pct(totals.won, totals.won + totals.lost).toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtAprov(pct(totals.won, totals.leads))}
                  </td>
                </tr>
              </tfoot>
            </table>
            <p className="text-xs text-muted-foreground px-4 py-2 border-t border-border/40">
              Conversão = ganhos ÷ (ganhos + perdidos) no período · Aproveitamento = ganhos ÷ leads criados no período.
              Fonte: pipelines da Clint.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
