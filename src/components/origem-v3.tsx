import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchOrigemV3Fn } from "@/lib/origem-v3.functions";
import { ChevronDown, ChevronRight, Route as RouteIcon } from "lucide-react";

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

const eur = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function OrigemV3Card({ from, to, title }: { from: string; to: string; title: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [showAudit, setShowAudit] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["origem-v3", from, to],
    queryFn: () => fetchOrigemV3Fn({ data: { from, to } }),
    staleTime: 5 * 60_000,
  });

  const rows = data?.rows ?? [];
  const auditoria = data?.auditoria ?? [];

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          leads: a.leads + r.leads,
          abertos: a.abertos + r.abertos,
          perdidos: a.perdidos + r.perdidos,
          ganhos: a.ganhos + r.ganhos,
          valor: a.valor + r.valor,
          ganhosSemContato: a.ganhosSemContato + r.ganhosSemContato,
          valorSemContato: a.valorSemContato + r.valorSemContato,
        }),
        { leads: 0, abertos: 0, perdidos: 0, ganhos: 0, valor: 0, ganhosSemContato: 0, valorSemContato: 0 },
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
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Tag da Clint (PIPELINE_COMERCIAL-V3)</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Leads recebidos</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Perdidos</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Vendas</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Aproveit. %</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Valor (€)</th>
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
                              ({r.campanhas.length} tag{r.campanhas.length !== 1 ? "s" : ""})
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.leads}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.perdidos}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-500 font-medium">{r.ganhos}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{pct(r.ganhos, r.leads)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{eur(r.valor)}</td>
                      </tr>
                      {isOpen &&
                        r.campanhas.map((c) => (
                          <tr key={`${r.origem}-${c.campanha}`} className="border-t border-border/30 hover:bg-muted/10">
                            <td className="px-4 py-1.5 pl-10 text-muted-foreground truncate max-w-[320px]">{c.campanha}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{c.leads}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">—</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-emerald-500">{c.ganhos}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{pct(c.ganhos, c.leads)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">—</td>
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
                  <td className="px-3 py-2 text-right tabular-nums">{totals.perdidos}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.ganhos}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(totals.ganhos, totals.leads)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{eur(totals.valor)}</td>
                </tr>
              </tfoot>
            </table>

            {auditoria.length > 0 && (
              <div className="border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAudit((v) => !v)}
                  className="w-full flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/30"
                >
                  {showAudit ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Auditoria automática das vendas do período ({auditoria.length}) — captação × funil de conversão (SCK/afiliado)
                </button>
                {showAudit && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/40">
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Data venda</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Cliente</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Produto</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Vendedor</th>
                          <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Valor</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Captação (1º toque)</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Funil da conversão</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">SCK / Afiliado</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Entrou em</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Match</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditoria.map((a) => (
                          <tr key={a.saleId} className="border-t border-border/30 hover:bg-muted/10">
                            <td className="px-3 py-1.5 whitespace-nowrap">
                              {new Date(`${a.saleDate}T00:00:00`).toLocaleDateString("pt-BR")}
                            </td>
                            <td className="px-3 py-1.5 truncate max-w-[200px]" title={a.email ?? ""}>
                              {a.cliente}
                            </td>
                            <td className="px-3 py-1.5 truncate max-w-[180px]">{a.produto}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap">{a.vendedor}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{eur(a.valor)}</td>
                            <td className="px-3 py-1.5 truncate max-w-[200px]" title={a.tags.join(" | ")}>
                              {a.origem}
                            </td>
                            <td className="px-3 py-1.5 truncate max-w-[220px]">
                              {a.funilConversao}
                              <span className="text-muted-foreground"> · {a.metodo}</span>
                              {a.funilDeclarado && a.funilDeclarado !== a.funilConversao && (
                                <span className="text-amber-500"> (declarado: {a.funilDeclarado})</span>
                              )}
                            </td>
                            <td
                              className="px-3 py-1.5 truncate max-w-[200px] text-muted-foreground"
                              title={a.afiliado ?? ""}
                            >
                              {a.sck ?? "—"}
                              {a.afiliado ? ` · ${a.afiliado.split(" ")[0]}` : ""}
                            </td>
                            <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                              {a.primeiroContato
                                ? new Date(a.primeiroContato).toLocaleDateString("pt-BR")
                                : "—"}
                            </td>
                            <td
                              className={`px-3 py-1.5 whitespace-nowrap ${
                                a.match === "sem-match" ? "text-red-500" : a.match === "email" ? "text-emerald-500" : "text-amber-500"
                              }`}
                            >
                              {a.match}
                              {!a.falouComVendedor && <span className="text-muted-foreground"> · sem conversa</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
