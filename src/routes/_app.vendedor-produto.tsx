import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchAllDeals, fetchAllSales, matchSellerProduct, periodRange, type Period } from "@/lib/bi";
import { formatInt } from "@/lib/format";
import { formatBRL } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_app/vendedor-produto")({
  component: VendedorProduto,
});

function VendedorProduto() {
  const [period, setPeriod] = useState<Period>("month");
  const { data: deals = [], isLoading: l1 } = useQuery({ queryKey: ["bi_deals"], queryFn: fetchAllDeals });
  const { data: sales = [], isLoading: l2 } = useQuery({ queryKey: ["bi_sales"], queryFn: fetchAllSales });

  const { start, end } = periodRange(period);
  const result = useMemo(() => matchSellerProduct(deals, sales, start, end), [deals, sales, start, end]);

  const bySeller = useMemo(() => {
    const m = new Map<string, { total: number; revenue: number; produtos: typeof result.rows }>();
    for (const r of result.rows) {
      const cur = m.get(r.seller) ?? { total: 0, revenue: 0, produtos: [] };
      cur.total += r.vendas;
      cur.revenue += r.faturamento;
      cur.produtos.push(r);
      m.set(r.seller, cur);
    }
    return Array.from(m.entries())
      .map(([seller, v]) => ({ seller, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [result]);

  const isLoading = l1 || l2;
  const totalSales = result.matched + result.unmatched;
  const matchRate = totalSales > 0 ? result.matched / totalSales : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Vendedor × Produto</h2>
          <p className="text-sm text-muted-foreground">
            Cruza vendas aprovadas da Hotmart com negócios ganhos da Clint pelo e-mail do
            cliente — mostra qual produto cada vendedor mais vende.
          </p>
        </div>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList>
            <TabsTrigger value="day">Dia</TabsTrigger>
            <TabsTrigger value="week">Sem</TabsTrigger>
            <TabsTrigger value="month">Mês</TabsTrigger>
            <TabsTrigger value="quarter">Trim</TabsTrigger>
            <TabsTrigger value="semester">Sem.</TabsTrigger>
            <TabsTrigger value="year">Ano</TabsTrigger>
            <TabsTrigger value="all">Tudo</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Carregando…</div>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-6 py-4 text-sm">
            <div>
                <span className="text-muted-foreground">Vendas com vendedor identificado: </span>
                <span className="font-semibold">{formatInt(result.matched)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Sem correspondência na Clint: </span>
                <span className="font-semibold">{formatInt(result.unmatched)}</span>
                <span className="text-muted-foreground"> ({formatBRL(result.unmatchedRevenue)})</span>
              </div>
              <div>
                <span className="text-muted-foreground">Taxa de identificação: </span>
                <span className="font-semibold">{(matchRate * 100).toFixed(0)}%</span>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {bySeller.map((s, i) => (
              <Card key={s.seller}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      {s.seller}
                    </CardTitle>
                    <Badge variant="secondary">#{i + 1}</Badge>
                  </div>
                  <p className="text-xl font-semibold mt-1">{formatBRL(s.revenue)}</p>
                  <p className="text-xs text-muted-foreground">{formatInt(s.total)} vendas identificadas</p>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {s.produtos
                    .sort((a, b) => b.faturamento - a.faturamento)
                    .map((p) => (
                      <div
                        key={p.produto_grupo}
                        className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-sm"
                      >
                        <span className="font-medium">{p.produto_grupo}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {formatInt(p.vendas)} · {formatBRL(p.faturamento)}
                        </span>
                      </div>
                    ))}
                </CardContent>
              </Card>
            ))}
          </div>

          {bySeller.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhuma venda com vendedor identificado ainda. Verifique se há vendas
                importadas em /import e negócios ganhos sincronizados em /comercial.
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
