import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listManualSalesAdmin, type ManualSale } from "@/lib/manual-sales.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

export const Route = createFileRoute("/_app/fechamento-semanal")({ component: FechamentoSemanal });

// Início do período: 01/06/2026 (segunda-feira)
const PERIOD_START = "2026-06-01";

function parseISO(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
  const nd = new Date(d);
  nd.setUTCDate(nd.getUTCDate() + n);
  return nd;
}
// Segunda-feira da semana da data
function mondayOf(d: Date) {
  const wd = d.getUTCDay(); // 0=dom, 1=seg...
  const diff = wd === 0 ? -6 : 1 - wd;
  return addDays(d, diff);
}
function fmtDay(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
function fmtEur(v: number) {
  return `€${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function FechamentoSemanal() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(today));

  const weekEnd = addDays(weekStart, 6);
  const minStart = mondayOf(parseISO(PERIOD_START));
  const canPrev = weekStart > minStart;
  const canNext = weekEnd < today;

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["manual_sales_week", toISO(weekStart), toISO(weekEnd)],
    queryFn: () => listManualSalesAdmin({ data: { from: toISO(weekStart), to: toISO(weekEnd) } }),
  });

  type ProductRow = { product: string; qtd: number; total: number; days: string[]; clients: string[] };

  const bySeller = useMemo(() => {
    const map = new Map<string, ManualSale[]>();
    for (const s of sales) {
      if (!map.has(s.seller_name)) map.set(s.seller_name, []);
      map.get(s.seller_name)!.push(s);
    }
    return Array.from(map.entries())
      .map(([seller, rows]) => {
        // Agrupar por produto
        const prodMap = new Map<string, ProductRow>();
        for (const r of rows) {
          const cur = prodMap.get(r.product) ?? { product: r.product, qtd: 0, total: 0, days: [], clients: [] };
          cur.qtd += 1;
          cur.total += Number(r.value_eur || 0);
          cur.days.push(r.sale_date);
          if (r.client_name) cur.clients.push(r.client_name);
          prodMap.set(r.product, cur);
        }
        const products = Array.from(prodMap.values())
          .map((p) => ({ ...p, days: p.days.sort() }))
          .sort((a, b) => b.total - a.total);
        return {
          seller,
          products,
          qtd: rows.length,
          total: rows.reduce((s, r) => s + Number(r.value_eur || 0), 0),
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [sales]);


  const weekTotal = bySeller.reduce((s, x) => s + x.total, 0);
  const weekQtd = bySeller.reduce((s, x) => s + x.qtd, 0);

  // Número da semana desde PERIOD_START
  const weekNumber = Math.floor((weekStart.getTime() - minStart.getTime()) / (7 * 24 * 3600 * 1000)) + 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Fechamento Semanal</h2>
          <p className="text-sm text-muted-foreground">
            Vendas por vendedor, dia e produto — semanas desde 01/06/2026.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            disabled={!canPrev}
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Semana {weekNumber}</span>
            <span className="text-muted-foreground">
              {fmtDay(toISO(weekStart))} – {fmtDay(toISO(weekEnd))}
            </span>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            disabled={!canNext}
            aria-label="Próxima semana"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 py-4 text-sm">
          <div>
            <span className="text-muted-foreground">Total da semana: </span>
            <span className="font-semibold">{fmtEur(weekTotal)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Quantidade: </span>
            <span className="font-semibold">{weekQtd} venda{weekQtd === 1 ? "" : "s"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Vendedores ativos: </span>
            <span className="font-semibold">{bySeller.length}</span>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-muted-foreground">Carregando…</div>
      ) : bySeller.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma venda registrada nesta semana.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {bySeller.map((s) => (
            <Card key={s.seller}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{s.seller}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{s.qtd} venda{s.qtd === 1 ? "" : "s"}</Badge>
                    <Badge>{fmtEur(s.total)}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="w-16 text-center">Qtd</TableHead>
                      <TableHead>Dias</TableHead>
                      <TableHead className="w-32 text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.products.map((p) => (
                      <TableRow key={p.product}>
                        <TableCell className="font-medium">{p.product}</TableCell>
                        <TableCell className="text-center tabular-nums">{p.qtd}</TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {p.days.map(fmtDay).join(", ")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtEur(p.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
