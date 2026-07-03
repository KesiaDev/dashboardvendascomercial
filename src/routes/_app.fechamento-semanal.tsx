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

  type Row = { key: string; date: string; product: string; seller: string; qtd: number; total: number };

  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    for (const s of sales) {
      const key = `${s.sale_date}|${s.product}|${s.seller_name}`;
      const cur = map.get(key) ?? { key, date: s.sale_date, product: s.product, seller: s.seller_name, qtd: 0, total: 0 };
      cur.qtd += 1;
      cur.total += Number(s.value_eur || 0);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort(
      (a, b) => a.date.localeCompare(b.date) || a.product.localeCompare(b.product),
    );
  }, [sales]);



  const weekTotal = rows.reduce((s, x) => s + x.total, 0);
  const weekQtd = rows.reduce((s, x) => s + x.qtd, 0);

  // Número da semana desde PERIOD_START
  const weekNumber = Math.floor((weekStart.getTime() - minStart.getTime()) / (7 * 24 * 3600 * 1000)) + 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Fechamento Semanal</h2>
          <p className="text-sm text-muted-foreground">
            Produto, quantidade, vendedor e data — semanas desde 01/06/2026.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))} disabled={!canPrev} aria-label="Semana anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Semana {weekNumber}</span>
            <span className="text-muted-foreground">
              {fmtDay(toISO(weekStart))} – {fmtDay(toISO(weekEnd))}
            </span>
          </div>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))} disabled={!canNext} aria-label="Próxima semana">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Carregando…</div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma venda registrada nesta semana.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Data</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="w-20 text-center">Qtd</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="w-32 text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="tabular-nums">{fmtDay(r.date)}</TableCell>
                    <TableCell className="font-medium">{r.product}</TableCell>
                    <TableCell className="text-center tabular-nums">{r.qtd}</TableCell>
                    <TableCell className="text-muted-foreground">{r.seller}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtEur(r.total)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-secondary/50 font-semibold">
                  <TableCell colSpan={2}>Total da semana</TableCell>
                  <TableCell className="text-center tabular-nums">{weekQtd}</TableCell>
                  <TableCell />
                  <TableCell className="text-right tabular-nums">{fmtEur(weekTotal)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );

}
