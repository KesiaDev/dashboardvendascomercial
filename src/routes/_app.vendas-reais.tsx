import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getFaturamentoPorProdutoFn,
  getRenovacoesFn,
  getCancelamentosFn,
  getVendasPorVendedorFn,
  CATEGORIA_LABEL,
  CATEGORIA_COLOR,
} from "@/lib/vendas-reais.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { AlertTriangle, Trophy, RefreshCw, XCircle, Package } from "lucide-react";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brlPrec = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";
const currentMonth = () => new Date().toISOString().slice(0, 7);

export const Route = createFileRoute("/_app/vendas-reais")({
  component: VendasReaisPage,
  head: () => ({
    meta: [{ title: "Vendas Reais — Dashcomercial LLMídia" }],
  }),
});

function VendasReaisPage() {
  const [month, setMonth] = useState(currentMonth());

  const fetchProdutos = useServerFn(getFaturamentoPorProdutoFn);
  const fetchRenov = useServerFn(getRenovacoesFn);
  const fetchCancel = useServerFn(getCancelamentosFn);
  const fetchVend = useServerFn(getVendasPorVendedorFn);

  const produtosQ = useQuery({
    queryKey: ["vendas-reais", "produtos", month],
    queryFn: () => fetchProdutos({ data: { month } }),
  });
  const renovQ = useQuery({
    queryKey: ["vendas-reais", "renov", month],
    queryFn: () => fetchRenov({ data: { month } }),
  });
  const cancelQ = useQuery({
    queryKey: ["vendas-reais", "cancel", month],
    queryFn: () => fetchCancel({ data: { month } }),
  });
  const vendQ = useQuery({
    queryKey: ["vendas-reais", "vend", month],
    queryFn: () => fetchVend({ data: { month } }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Vendas Reais</h1>
          <p className="text-sm text-muted-foreground">
            Faturamento por vendedor e produto, com regras corretas de meta, renovação e cancelamento.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="month" className="text-xs">Mês</Label>
            <Input
              id="month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value || currentMonth())}
              className="w-40"
            />
          </div>
        </div>
      </div>

      <Tabs defaultValue="vendedores" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="vendedores"><Trophy className="mr-1 h-4 w-4" />Por Vendedor</TabsTrigger>
          <TabsTrigger value="produtos"><Package className="mr-1 h-4 w-4" />Por Produto</TabsTrigger>
          <TabsTrigger value="renovacoes"><RefreshCw className="mr-1 h-4 w-4" />Renovações</TabsTrigger>
          <TabsTrigger value="cancelamentos"><XCircle className="mr-1 h-4 w-4" />Cancelamentos</TabsTrigger>
        </TabsList>

        <TabsContent value="vendedores" className="space-y-4">
          {vendQ.data ? <VendedoresTab data={vendQ.data} /> : <LoadingBlock />}
        </TabsContent>
        <TabsContent value="produtos" className="space-y-4">
          {produtosQ.data ? <ProdutosTab data={produtosQ.data} /> : <LoadingBlock />}
        </TabsContent>
        <TabsContent value="renovacoes" className="space-y-4">
          {renovQ.data ? <RenovacoesTab data={renovQ.data} /> : <LoadingBlock />}
        </TabsContent>
        <TabsContent value="cancelamentos" className="space-y-4">
          {cancelQ.data ? <CancelamentosTab data={cancelQ.data} /> : <LoadingBlock />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LoadingBlock() {
  return <div className="py-12 text-center text-sm text-muted-foreground">Carregando…</div>;
}

// ─── Por Vendedor ────────────────────────────────────────────────────────────
function VendedoresTab({ data }: { data: Awaited<ReturnType<typeof getVendasPorVendedorFn>> }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard label="Faturamento Meta" value={brl(data.totais.faturamentoMeta)} hint="Só produtos que contam para meta (Gestor de Tráfego)" />
        <KpiCard label="Faturamento Total" value={brl(data.totais.faturamentoTotal)} hint="Todos os produtos (inclui renovações)" />
        <KpiCard label="Vendas p/ meta" value={String(data.totais.qtdMeta)} />
        <KpiCard label="Vendas totais" value={String(data.totais.qtdTotal)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Ranking por faturamento de meta</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Fat. Meta</TableHead>
                  <TableHead className="text-right">Qtd Meta</TableHead>
                  <TableHead className="text-right">Fat. Total</TableHead>
                  <TableHead className="text-right">Renovações</TableHead>
                  <TableHead>Mix por produto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.vendedores.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Sem vendas lançadas nesse mês.
                    </TableCell>
                  </TableRow>
                )}
                {data.vendedores.map((v) => (
                  <TableRow key={v.seller}>
                    <TableCell className="font-medium">{v.seller}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-primary">{brl(v.faturamentoMeta)}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.qtdMeta}</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(v.faturamentoTotal)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {v.renovacoes > 0 ? `${v.renovacoes} · ${brl(v.valorRenovacoes)}` : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(v.porCategoria)
                          .sort(([, a], [, b]) => b.valor - a.valor)
                          .map(([cat, x]) => (
                            <Badge
                              key={cat}
                              variant="outline"
                              style={{ borderColor: CATEGORIA_COLOR[cat], color: CATEGORIA_COLOR[cat] }}
                            >
                              {CATEGORIA_LABEL[cat] ?? cat}: {x.qtd}
                            </Badge>
                          ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Valores em BRL. Vendas confirmadas via Hotmart usam o valor real; as não confirmadas usam EUR × 6 como estimativa.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

// ─── Por Produto ─────────────────────────────────────────────────────────────
function ProdutosTab({ data }: { data: Awaited<ReturnType<typeof getFaturamentoPorProdutoFn>> }) {
  const chartData = useMemo(
    () => data.produtos.map((p) => ({ name: p.label, valor: p.faturamento, cor: CATEGORIA_COLOR[p.categoria] })),
    [data.produtos],
  );
  return (
    <>
      <KpiCard label="Faturamento total do mês" value={brl(data.total)} hint="Soma da comissão do produtor (BRL) de todas as vendas aprovadas" />

      <Card>
        <CardHeader><CardTitle>Faturamento por produto</CardTitle></CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 40, left: 0 }}>
                <XAxis dataKey="name" angle={-20} textAnchor="end" height={80} interval={0} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v: number) => brl(v)} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => brlPrec(v)} />
                <Bar dataKey="valor">
                  {chartData.map((d, i) => <Cell key={i} fill={d.cor} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Faturamento (BRL)</TableHead>
                <TableHead className="text-right">% do total</TableHead>
                <TableHead>Meta?</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.produtos.map((p) => (
                <TableRow key={p.categoria}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: CATEGORIA_COLOR[p.categoria] }} />
                      {p.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.qtd}</TableCell>
                  <TableCell className="text-right tabular-nums">{brlPrec(p.faturamento)}</TableCell>
                  <TableCell className="text-right tabular-nums">{(p.pct * 100).toFixed(1)}%</TableCell>
                  <TableCell>
                    {p.conta_meta ? <Badge>Sim</Badge> : <Badge variant="secondary">Não</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

// ─── Renovações ──────────────────────────────────────────────────────────────
function RenovacoesTab({ data }: { data: Awaited<ReturnType<typeof getRenovacoesFn>> }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <KpiCard label="Total de renovações" value={brl(data.total)} hint="Não conta para a meta dos vendedores" />
        <KpiCard label="Qtd. renovações" value={String(data.renovacoes.length)} />
      </div>
      <Card>
        <CardHeader><CardTitle>Renovações do mês</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Afiliado (SCK)</TableHead>
                <TableHead className="text-right">Valor (BRL)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.renovacoes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Sem renovações nesse mês.
                  </TableCell>
                </TableRow>
              )}
              {data.renovacoes.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{fmtDate(r.data_venda)}</TableCell>
                  <TableCell>{r.produto_original}</TableCell>
                  <TableCell className="text-sm">{r.nome_cliente ?? r.email_cliente ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.nome_afiliado ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{brlPrec(Number(r.faturamento_liquido_brl ?? 0))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

// ─── Cancelamentos ───────────────────────────────────────────────────────────
function CancelamentosTab({ data }: { data: Awaited<ReturnType<typeof getCancelamentosFn>> }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <KpiCard
          label="Efetivados (chargeback + reembolso)"
          value={brl(data.totalEfetivado)}
          hint="Já subtraem do faturamento realizado"
          tone="destructive"
        />
        <KpiCard
          label="Aguardando resultado (em risco)"
          value={brl(data.totalPendente)}
          hint="Disputas em análise, ainda não impactam o resultado"
          tone="warning"
        />
      </div>

      <CancelSection title="Efetivados" rows={data.efetivados} emptyText="Nenhum chargeback ou reembolso efetivado no mês." destructive />
      <CancelSection title="Aguardando resultado" rows={data.pendentes} emptyText="Nenhuma disputa em análise no mês." />
    </>
  );
}

function CancelSection({
  title,
  rows,
  emptyText,
  destructive,
}: {
  title: string;
  rows: Awaited<ReturnType<typeof getCancelamentosFn>>["efetivados"];
  emptyText: string;
  destructive?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        {destructive && <AlertTriangle className="h-4 w-4 text-destructive" />}
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Afiliado</TableHead>
              <TableHead className="text-right">Valor (BRL)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">{emptyText}</TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{fmtDate(r.data_venda)}</TableCell>
                <TableCell>{r.produto_original}</TableCell>
                <TableCell className="text-sm">{r.nome_cliente ?? r.email_cliente ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={destructive ? "destructive" : "outline"}>{r.status}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.nome_afiliado ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{brlPrec(Number(r.faturamento_liquido_brl ?? 0))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── UI helpers ──────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "destructive" | "warning";
}) {
  const toneClass =
    tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-amber-500" : "";
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
