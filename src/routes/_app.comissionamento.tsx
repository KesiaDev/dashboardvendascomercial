import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchCommissionPeriodsFn,
  fetchSellerConfigFn,
  fetchCommissionRatesFn,
  fetchWisePaymentsFn,
  fetchCommissionBonusesFn,
  fetchManualSalesForCommissionFn,
  fetchRoletaSpinsFn,
  fetchSalesForCommissionFn,
  fetchSaleOverridesFn,
  upsertSaleOverrideFn,
  addCommissionBonusFn,
  deleteCommissionBonusFn,
  upsertCommissionRateFn,
  upsertCommissionPeriodFn,
  type RoletaSpinRow,
} from "@/lib/commission.functions";
import { RoletaSpinsCard } from "@/components/roleta-spins";
import { useAppAuth } from "@/lib/app-auth";
import { RATE_MISSING_MESSAGE, eurBrlRate } from "@/lib/eur-rate";
import {
  calculateCommissions,
  periodWeeks,
  TAXA_LIQUIDO_HOTMART,
  type CommissionPeriod,
  type ManualSaleRow,
  type SaleOverride,
  type SellerCommission,
  type AttributedSaleRow,
} from "@/lib/commission";
import { PRODUCT_GROUPS } from "@/lib/product-groups";
import { WiseRecebimentosCard } from "@/components/wise-recebimentos";
import { CommissionAlertsCard } from "@/components/commission-alerts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Lock,
  Wallet,
  ChevronDown,
  ChevronUp,
  Settings,
  Plus,
  Trash2,
  Trophy,
  Target,
  Search,
} from "lucide-react";

export const Route = createFileRoute("/_app/comissionamento")({
  component: ComissionamentoPage,
  head: () => ({
    meta: [
      { title: "Comissionamento | Dash Comercial" },
      {
        name: "description",
        content:
          "Cálculo automático das comissões do time comercial por produto, com metas, bônus e roleta.",
      },
      { property: "og:title", content: "Comissionamento | Dash Comercial" },
      {
        property: "og:description",
        content: "Comissões do time comercial calculadas a partir das vendas Hotmart e Wise.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function money(v: number, moeda = "BRL") {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: moeda === "EUR" ? "EUR" : "BRL",
    maximumFractionDigits: 2,
  });
}

function pct(v: number) {
  return `${v.toFixed(1)}%`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString("pt-BR");
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function ComissionamentoPage() {
  // O gate de PIN que ficava aqui não protegia nada. VITE_ADMIN_PIN é substituído
  // pelo valor literal no bundle em tempo de build (e caía em "1234" quando a
  // variável não estava definida), a comparação era em JavaScript no browser, e
  // dava para pular tudo com localStorage.setItem("comm_admin_v1","1") no console.
  //
  // A proteção real é no servidor: as 18 server functions de comissionamento
  // exigem requireSupabaseAuth + assertAdmin(context.claims). Aqui só evitamos
  // mostrar a tela a quem não vai receber dado nenhum de qualquer forma.
  const { admin, loading } = useAppAuth();
  if (loading) return <div className="text-sm text-muted-foreground">Carregando…</div>;
  if (!admin) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <Lock className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">Área restrita</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          O comissionamento é visível apenas para administradores.
        </p>
      </div>
    );
  }
  return <Dashboard />;
}

function Dashboard() {
  const qc = useQueryClient();
  const [periodId, setPeriodId] = useState<number | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [expandedSeller, setExpandedSeller] = useState<string | null>(null);
  const [bonusForm, setBonusForm] = useState<{
    seller: string;
    tipo: string;
    valor: string;
    moeda: string;
    notas: string;
  } | null>(null);

  const { data: periods = [] } = useQuery({
    queryKey: ["comm_periods"],
    queryFn: async () => (await fetchCommissionPeriodsFn()) as CommissionPeriod[],
  });
  const { data: sellers = [] } = useQuery({
    queryKey: ["comm_sellers"],
    queryFn: async () => (await fetchSellerConfigFn()) as any[],
  });
  const { data: rates = [] } = useQuery({
    queryKey: ["comm_rates"],
    queryFn: async () => (await fetchCommissionRatesFn()) as any[],
  });
  const { data: wisePayments = [] } = useQuery({
    queryKey: ["comm_wise"],
    queryFn: async () => (await fetchWisePaymentsFn()) as any[],
  });
  const { data: bonuses = [] } = useQuery({
    queryKey: ["comm_bonuses"],
    queryFn: async () => (await fetchCommissionBonusesFn()) as any[],
  });
  const { data: overrides = [] } = useQuery({
    queryKey: ["comm_overrides"],
    queryFn: async () => (await fetchSaleOverridesFn()) as SaleOverride[],
  });

  const activePeriod = useMemo((): CommissionPeriod | null => {
    if (periods.length === 0) return null;
    if (periodId) return periods.find((p) => p.id === periodId) ?? periods[0];
    return periods[0];
  }, [periods, periodId]);

  // Cotação contratual do período. `null` quando não foi cadastrada — e nesse
  // caso a tela AVISA em vez de converter com um valor inventado. Ver a nota em
  // src/lib/eur-rate.ts.
  const cotacaoPeriodo = eurBrlRate(activePeriod);

  const { data: sales = [] } = useQuery({
    queryKey: ["comm_sales", activePeriod?.id],
    enabled: !!activePeriod,
    queryFn: async () => {
      if (!activePeriod) return [];
      return (await fetchSalesForCommissionFn({
        data: { from: activePeriod.data_inicio, to: activePeriod.data_fim },
      })) as any[];
    },
  });

  const { data: manualSales = [] } = useQuery({
    queryKey: ["comm_manual_sales", activePeriod?.id],
    enabled: !!activePeriod,
    queryFn: async () => {
      if (!activePeriod) return [];
      return (await fetchManualSalesForCommissionFn({
        data: { from: activePeriod.data_inicio, to: activePeriod.data_fim },
      })) as ManualSaleRow[];
    },
  });

  const { data: roletaSpins = [] } = useQuery({
    queryKey: ["roleta_spins"],
    queryFn: async () => (await fetchRoletaSpinsFn()) as RoletaSpinRow[],
  });

  const summary = useMemo(() => {
    if (!activePeriod || sellers.length === 0) return null;
    // Sem cotação cadastrada, calculateCommissions lança de propósito (ver
    // src/lib/eur-rate.ts). Aqui isso vira o aviso abaixo, não uma tela branca.
    if (cotacaoPeriodo === null) return null;
    return calculateCommissions(
      activePeriod,
      sellers,
      rates,
      sales,
      wisePayments,
      bonuses,
      manualSales,
      roletaSpins,
      overrides,
    );
  }, [
    activePeriod,
    cotacaoPeriodo,
    sellers,
    rates,
    sales,
    wisePayments,
    bonuses,
    manualSales,
    roletaSpins,
    overrides,
  ]);

  const weeks = useMemo(() => (activePeriod ? periodWeeks(activePeriod) : []), [activePeriod]);

  const addBonusMut = useMutation({
    mutationFn: async (d: any) => addCommissionBonusFn({ data: d }),
    onSuccess: () => {
      toast.success("Lançamento adicionado");
      qc.invalidateQueries({ queryKey: ["comm_bonuses"] });
      setBonusForm(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delBonusMut = useMutation({
    mutationFn: async (id: number) => deleteCommissionBonusFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Lançamento removido");
      qc.invalidateQueries({ queryKey: ["comm_bonuses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertRateMut = useMutation({
    mutationFn: async (d: any) => upsertCommissionRateFn({ data: d }),
    onSuccess: () => {
      toast.success("Taxa atualizada");
      qc.invalidateQueries({ queryKey: ["comm_rates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertPeriodMut = useMutation({
    mutationFn: async (d: any) => upsertCommissionPeriodFn({ data: d }),
    onSuccess: () => {
      toast.success("Período salvo");
      qc.invalidateQueries({ queryKey: ["comm_periods"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalAPagar = summary?.sellers.reduce((s, r) => s + r.total_a_pagar, 0) ?? 0;
  const totalFaturamento = summary?.sellers.reduce((s, r) => s + r.faturamento_total_brl, 0) ?? 0;
  const totalSplitHotmart =
    summary?.sellers.reduce((s, r) => s + r.comissao_hotmart_direto, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comissionamento</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vendas da Hotmart + recebimentos Wise do mês, com metas, bônus e roleta
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select
            value={String(activePeriod?.id ?? "")}
            onValueChange={(v) => setPeriodId(Number(v))}
          >
            <SelectTrigger className="w-[190px]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setShowConfig((v) => !v)}>
            <Settings className="h-4 w-4 mr-1" />
            {showConfig ? "Fechar config" : "Configurar"}
          </Button>
        </div>
      </div>

      {/* ── Alertas de auditoria do fechamento manual ── */}
      <CommissionAlertsCard />

      {/* ── Sem cotação do período não há como converter os valores em euro ── */}
      {activePeriod && cotacaoPeriodo === null && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-destructive-fg">
                {activePeriod.nome} está sem cotação EUR→BRL
              </p>
              <p className="max-w-2xl text-xs text-muted-foreground">{RATE_MISSING_MESSAGE}</p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                const val = prompt("Cotação EUR→BRL deste período:", "");
                if (val !== null && Number(val) > 0)
                  upsertPeriodMut.mutate({ ...activePeriod, cotacao_eur: Number(val) });
              }}
            >
              Definir cotação
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Resumo do mês ── */}
      {summary && activePeriod && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              {activePeriod.nome} · {fmtDate(activePeriod.data_inicio)} a{" "}
              {fmtDate(activePeriod.data_fim)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Kpi label="Faturamento do time" value={money(totalFaturamento)} />
              <Kpi
                label="Comissão paga pela Hotmart"
                value={money(totalSplitHotmart)}
                hint="split de afiliado — a empresa não paga"
              />
              <Kpi
                label="Total a pagar pela empresa"
                value={money(totalAPagar)}
                emphasis
                hint="comissões + bônus + metas + roleta"
              />
              <Kpi
                label="Cotação EUR do período"
                value={
                  cotacaoPeriodo === null ? "não cadastrada" : `R$ ${cotacaoPeriodo.toFixed(2)}`
                }
                hint={cotacaoPeriodo === null ? "clique para definir" : undefined}
                onClick={() => {
                  const val = prompt("Cotação EUR→BRL:", String(cotacaoPeriodo ?? ""));
                  if (val !== null && !isNaN(Number(val)))
                    upsertPeriodMut.mutate({ ...activePeriod, cotacao_eur: Number(val) });
                }}
              />
            </div>

            <div className="rounded-md border border-border/60 bg-background/60 p-3 text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Como o valor é calculado</strong> — Vendas da
              Hotmart entram líquidas da taxa da plataforma (× {TAXA_LIQUIDO_HOTMART}); recebimentos
              Wise entram cheios.
              <br />
              Quando o <em>Nome do afiliado</em> na Hotmart é o próprio vendedor, a Hotmart já paga
              a comissão direto e a empresa não paga nada nessa venda. Quando a venda é atribuída
              por SCK (link da equipe) ou vem por Wise, a comissão é paga pela empresa.
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tabela consolidada (igual à planilha) ── */}
      {summary && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resumo por vendedor</CardTitle>
            <p className="text-xs text-muted-foreground">
              Clique num vendedor para ver produto a produto
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2">Vendedor</th>
                  <th className="px-3 py-2 text-right">Hotmart (afiliado)</th>
                  <th className="px-3 py-2 text-right">Hotmart (SCK)</th>
                  <th className="px-3 py-2 text-right">Wise</th>
                  <th className="px-3 py-2 text-right">Faturamento</th>
                  <th className="px-3 py-2 text-right">Comissão total</th>
                  <th className="px-3 py-2 text-right">Já pago Hotmart</th>
                  <th className="px-3 py-2 text-right">Metas</th>
                  <th className="px-3 py-2 text-right">Roleta</th>
                  <th className="px-3 py-2 text-right">Bônus/Desc.</th>
                  <th className="px-4 py-2 text-right">A pagar</th>
                </tr>
              </thead>
              <tbody>
                {summary.sellers.map((s) => {
                  // Cada vendedor é exibido na sua moeda (Rita/João em EUR, os demais em BRL)
                  const mo = (s.moeda ?? "BRL").toUpperCase() === "EUR" ? "EUR" : "BRL";
                  const mm = (brl: number) =>
                    mo === "EUR" && cotacaoPeriodo === null
                      ? "—"
                      : money(mo === "EUR" ? brl / cotacaoPeriodo! : brl, mo);
                  return (
                    <tr
                      key={s.sellerName}
                      className="border-b border-border/40 last:border-0 cursor-pointer hover:bg-muted/30"
                      onClick={() =>
                        setExpandedSeller((v) => (v === s.sellerName ? null : s.sellerName))
                      }
                    >
                      <td className="px-4 py-2 font-medium">
                        {s.sellerName}
                        <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                          {mo}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {s.fat_hotmart ? mm(s.fat_hotmart) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {s.fat_sck ? mm(s.fat_sck) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {s.fat_wise ? mm(s.fat_wise) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {mm(s.faturamento_total_brl)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{mm(s.comissao_total)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {s.comissao_hotmart_direto ? `− ${mm(s.comissao_hotmart_direto)}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-success-fg">
                        {s.bonus_metas_brl ? mm(s.bonus_metas_brl) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-warning-fg">
                        {s.roleta_ganho_brl ? mm(s.roleta_ganho_brl) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {s.bonus_total || s.descontos ? mm(s.bonus_total - s.descontos) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-primary">
                        {mm(s.total_a_pagar)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/40 font-semibold">
                  <td className="px-4 py-2">Total</td>
                  <td colSpan={3} />
                  <td className="px-3 py-2 text-right tabular-nums">{money(totalFaturamento)}</td>
                  <td colSpan={5} />
                  <td className="px-4 py-2 text-right tabular-nums text-primary">
                    {money(totalAPagar)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Detalhe por vendedor ── */}
      {summary?.sellers.map((s) =>
        expandedSeller === s.sellerName ? (
          <SellerDetail
            key={s.sellerName}
            s={s}
            rates={rates}
            cotacao={cotacaoPeriodo}
            weeks={weeks.map((w) => w.label)}

            onClose={() => setExpandedSeller(null)}
            bonusForm={bonusForm}
            setBonusForm={setBonusForm}
            onAddBonus={(d) =>
              activePeriod && addBonusMut.mutate({ ...d, period_id: activePeriod.id })
            }
            onDelBonus={(id) => delBonusMut.mutate(id)}
          />
        ) : null,
      )}

      {/* ── Roleta ── */}
      {activePeriod && (
        <RoletaSpinsCard
          period={activePeriod}
          sellerNames={sellers.filter((x: any) => x.is_active).map((x: any) => x.seller_name)}
        />
      )}

      {/* ── Conferência das vendas ── */}
      {summary && (
        <VendasConferencia
          vendas={summary.vendas}
          sellers={sellers.filter((x: any) => x.is_active).map((x: any) => x.seller_name)}
        />
      )}

      {/* ── Configuração ── */}
      {showConfig && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Taxas de comissão por produto
              </CardTitle>
              <p className="text-xs text-muted-foreground">Clique no valor para editar</p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4">Vendedor</th>
                    <th className="py-2 pr-4">Produto</th>
                    <th className="py-2 text-right">% Vendedor</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((r: any) => (
                    <RateRow
                      key={`${r.seller_name}||${r.produto_grupo}`}
                      rate={r}
                      onSave={(d) => upsertRateMut.mutate(d)}
                    />
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Adicionar período</CardTitle>
            </CardHeader>
            <CardContent>
              <NewPeriodForm onSave={(d) => upsertPeriodMut.mutate(d)} />
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Recebimentos Wise ── */}
      <WiseRecebimentosCard payments={wisePayments as any} />
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  emphasis,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
  onClick?: () => void;
}) {
  return (
    <div onClick={onClick} className={onClick ? "cursor-pointer" : undefined}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-2xl font-bold tabular-nums ${emphasis ? "text-primary" : ""} ${
          onClick ? "hover:underline" : ""
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground/80 mt-0.5">{hint}</p>}
    </div>
  );
}

// ── Detalhe do vendedor ───────────────────────────────────────────────────────

function SellerDetail({
  s,
  rates,
  cotacao,
  onClose,
  bonusForm,
  setBonusForm,
  onAddBonus,
  onDelBonus,
}: {
  s: SellerCommission;
  weeks: string[];
  rates: { seller_name: string; produto_grupo: string; rate_pct: number }[];
  cotacao: number | null;
  onClose: () => void;
  bonusForm: any;
  setBonusForm: (v: any) => void;
  onAddBonus: (d: any) => void;
  onDelBonus: (id: number) => void;
}) {
  // Planilha: valores na moeda do vendedor (Rita/João em EUR, os demais em BRL)
  const moeda = (s.moeda ?? "BRL").toUpperCase() === "EUR" ? "EUR" : "BRL";
  // Sem cotação do período não há como converter para euro — a tela avisa em
  // vez de exibir um número inventado.
  const cv = (brl: number) => (moeda === "EUR" ? brl / (cotacao ?? Number.NaN) : brl);
  const m = (brl: number) => money(cv(brl), moeda);

  // Todas as linhas de produto do vendedor, mesmo com faturamento zero
  const linhas = useMemo(() => {
    const byId = new Map(s.byProduct.map((p) => [p.produto_grupo, p]));
    const ids = [
      ...new Set([
        ...rates.filter((r) => r.seller_name === s.sellerName).map((r) => r.produto_grupo),
        ...s.byProduct.map((p) => p.produto_grupo),
      ]),
    ];
    return ids.map((id) => {
      const p = byId.get(id);
      const rate =
        p?.rate_pct ??
        rates.find((r) => r.seller_name === s.sellerName && r.produto_grupo === id)?.rate_pct ??
        0;
      return {
        id,
        label: p?.label ?? PRODUCT_GROUPS.find((g) => g.id === id)?.label ?? id,
        wise: p?.faturamento_wise ?? 0,
        hotmart: p?.faturamento_hotmart ?? 0,
        sck: p?.faturamento_sck ?? 0,
        rate,
        recebido: p?.comissao_total ?? 0,
        pagar: p?.comissao_a_pagar ?? 0,
      };
    });
  }, [s, rates]);

  const roletaBrl = s.roleta_ganho_brl;
  const bonusBrl = s.bonus_metas_brl + s.bonus_total;
  const totalRecebido = s.comissao_total + roletaBrl + bonusBrl - s.descontos;

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">
          {s.sellerName} — detalhe{" "}
          <span className="text-xs font-normal text-muted-foreground">
            (valores em {moeda}
            {moeda === "EUR"
              ? cotacao === null
                ? " · sem câmbio cadastrado"
                : ` · câmbio ${cotacao.toFixed(2)}`
              : ""}
            )
          </span>
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <ChevronUp className="h-4 w-4 mr-1" /> Fechar
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Produtos — mesmo layout da planilha */}
        <div className="overflow-x-auto rounded border border-border/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2">Produto</th>
                <th className="px-3 py-2 text-right">Fat. Wise</th>
                <th className="px-3 py-2 text-right">Fat. Hotmart</th>
                <th className="px-3 py-2 text-right">Fat. SCK</th>
                <th className="px-3 py-2 text-right">% Comissão</th>
                <th className="px-3 py-2 text-right">Comissionamento total recebido</th>
                <th className="px-3 py-2 text-right">Comissionamento a ser pago</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((p) => (
                <tr key={p.id} className="border-b border-border/40">
                  <td className="px-3 py-1.5 font-medium">{p.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {m(p.wise)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {m(p.hotmart)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {m(p.sck)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{pct(p.rate)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{m(p.recebido)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{m(p.pagar)}</td>
                </tr>
              ))}
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-3 text-muted-foreground">
                    Nenhum produto configurado para este vendedor.
                  </td>
                </tr>
              )}

              {/* Roleta / Bônus / Descontos — como na planilha */}
              <tr className="border-b border-border/40 bg-warning/5">
                <td className="px-3 py-1.5 font-medium">Roleta</td>
                <td colSpan={4} />
                <td className="px-3 py-1.5 text-right tabular-nums">{m(roletaBrl)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">{m(roletaBrl)}</td>
              </tr>
              <tr className="border-b border-border/40 bg-sky-500/5">
                <td className="px-3 py-1.5 font-medium">Bônus (metas + manuais)</td>
                <td colSpan={4} />
                <td className="px-3 py-1.5 text-right tabular-nums">{m(bonusBrl)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">{m(bonusBrl)}</td>
              </tr>
              {s.descontos > 0 && (
                <tr className="border-b border-border/40 bg-destructive/5">
                  <td className="px-3 py-1.5 font-medium">Descontos</td>
                  <td colSpan={4} />
                  <td className="px-3 py-1.5 text-right tabular-nums">−{m(s.descontos)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                    −{m(s.descontos)}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{m(s.fat_wise)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m(s.fat_hotmart)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m(s.fat_sck)}</td>
                <td />
                <td className="px-3 py-2 text-right tabular-nums">{m(totalRecebido)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-primary">
                  {m(s.total_a_pagar)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Metas */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5" /> Metas · semanal €900 → €30 · €1.600 → €60 · mensal
            €3.200 → €30 · €6.400 → €60
          </p>
          <div className="flex flex-wrap gap-2">
            {s.metas.semanas.map((w) => (
              <div
                key={w.week}
                className={`rounded-md border px-3 py-2 text-xs ${
                  w.bateu_super
                    ? "border-success/50 bg-success/10"
                    : w.bateu_meta
                      ? "border-sky-500/50 bg-sky-500/10"
                      : "border-border/60 bg-muted/20"
                }`}
              >
                <p className="font-semibold">{w.label}</p>
                <p className="tabular-nums">{w.faturamento_eur.toFixed(0)} EUR</p>
                <p className="text-muted-foreground">
                  {w.bonus_eur ? `+${w.bonus_eur} EUR` : "sem bônus"}
                </p>
              </div>
            ))}
            <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
              <p className="font-semibold">Mês</p>
              <p className="tabular-nums">{s.metas.faturamento_mensal_eur.toFixed(0)} EUR</p>
              <p className="text-muted-foreground">
                {s.metas.bonus_mensal_eur ? `+${s.metas.bonus_mensal_eur} EUR` : "sem bônus"}
              </p>
            </div>
          </div>
        </div>

        {/* Roleta */}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5" /> Roleta
          </span>
          <Badge variant="secondary">{s.roleta_spins_normais} giros</Badge>
          {s.roleta_spins_wise > 0 && (
            <Badge variant="outline">{s.roleta_spins_wise} giros (Wise)</Badge>
          )}
          <span className="tabular-nums">{m(s.roleta_ganho_brl)}</span>
        </div>

        {/* Bônus e descontos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Bônus e descontos manuais
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() =>
                setBonusForm({
                  seller: s.sellerName,
                  tipo: "manual",
                  valor: "",
                  moeda: "BRL",
                  notas: "",
                })
              }
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
            </Button>
          </div>

          {s.bonuses.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-md border border-border/50 bg-secondary/20 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {b.tipo}
                </Badge>
                <span className="text-muted-foreground">{b.notas ?? "—"}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums font-medium">{money(b.valor, b.moeda)}</span>
                <button
                  onClick={() => onDelBonus(b.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          {bonusForm?.seller === s.sellerName && (
            <div className="flex flex-wrap gap-2 rounded-md border border-border p-3">
              <Select
                value={bonusForm.tipo}
                onValueChange={(v) => setBonusForm({ ...bonusForm, tipo: v })}
              >
                <SelectTrigger className="w-[120px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Bônus manual</SelectItem>
                  <SelectItem value="fixo">Fixo</SelectItem>
                  <SelectItem value="desconto">Desconto</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="w-[100px] h-8"
                placeholder="Valor"
                value={bonusForm.valor}
                onChange={(e) => setBonusForm({ ...bonusForm, valor: e.target.value })}
              />
              <Select
                value={bonusForm.moeda}
                onValueChange={(v) => setBonusForm({ ...bonusForm, moeda: v })}
              >
                <SelectTrigger className="w-[80px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">BRL</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="flex-1 min-w-[140px] h-8"
                placeholder="Observação"
                value={bonusForm.notas}
                onChange={(e) => setBonusForm({ ...bonusForm, notas: e.target.value })}
              />
              <Button
                size="sm"
                className="h-8"
                disabled={!bonusForm.valor}
                onClick={() =>
                  onAddBonus({
                    seller_name: bonusForm.seller,
                    tipo: bonusForm.tipo,
                    valor: Number(bonusForm.valor),
                    moeda: bonusForm.moeda,
                    notas: bonusForm.notas || null,
                  })
                }
              >
                Salvar
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setBonusForm(null)}>
                Cancelar
              </Button>
            </div>
          )}
        </div>

        {/* Fecho do vendedor */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 rounded-md border border-border/60 bg-muted/20 p-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Comissão vendas (empresa)</p>
            <p className="font-semibold tabular-nums">{m(s.comissao_a_pagar_vendas)}</p>
          </div>
          {s.comissao_gestora_brl > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">Comissão de gestora</p>
              <p className="font-semibold tabular-nums">{m(s.comissao_gestora_brl)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Bônus de metas</p>
            <p className="font-semibold tabular-nums">{m(s.bonus_metas_brl)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Roleta + bônus − descontos</p>
            <p className="font-semibold tabular-nums">
              {m(s.roleta_ganho_brl + s.bonus_total - s.descontos)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total a pagar</p>
            <p className="font-bold tabular-nums text-primary">{m(s.total_a_pagar)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Conferência de vendas + ajustes ───────────────────────────────────────────

function VendasConferencia({
  vendas,
  sellers,
}: {
  vendas: AttributedSaleRow[];
  sellers: string[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [filtroVendedor, setFiltroVendedor] = useState("todos");

  const mut = useMutation({
    mutationFn: async (d: any) => upsertSaleOverrideFn({ data: d }),
    onSuccess: () => {
      toast.success("Ajuste salvo");
      qc.invalidateQueries({ queryKey: ["comm_overrides"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return vendas.filter((v) => {
      if (filtroVendedor === "sem" && v.seller) return false;
      if (filtroVendedor !== "todos" && filtroVendedor !== "sem" && v.seller !== filtroVendedor)
        return false;
      if (!term) return true;
      return [v.nome_cliente, v.email_cliente, v.produto_original, v.transacao, v.nome_afiliado]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(term));
    });
  }, [vendas, q, filtroVendedor]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Conferência das vendas ({vendas.length})</CardTitle>
            <p className="text-xs text-muted-foreground">
              Ajuste o vendedor, exclua vendas ou deixe uma observação
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
            {open ? (
              <ChevronUp className="h-4 w-4 mr-1" />
            ) : (
              <ChevronDown className="h-4 w-4 mr-1" />
            )}
            {open ? "Ocultar" : "Ver vendas"}
          </Button>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="h-9 w-[240px] pl-7"
                placeholder="Cliente, produto, transação…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os vendedores</SelectItem>
                <SelectItem value="sem">Sem atribuição</SelectItem>
                {sellers.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto rounded border border-border/60 max-h-[520px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Produto</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2">Origem</th>
                  <th className="px-3 py-2">Vendedor</th>
                  <th className="px-3 py-2">Observação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <VendaRow
                    key={v.transacao}
                    v={v}
                    sellers={sellers}
                    onSave={(d) => mut.mutate(d)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function VendaRow({
  v,
  sellers,
  onSave,
}: {
  v: AttributedSaleRow;
  sellers: string[];
  onSave: (d: any) => void;
}) {
  const [obs, setObs] = useState(v.override?.observacao ?? "");
  const excluida = v.override?.excluir ?? false;

  const save = (patch: Record<string, unknown>) =>
    onSave({
      transacao: v.transacao,
      seller_name: v.override?.seller_name ?? null,
      produto_grupo: v.override?.produto_grupo ?? null,
      excluir: excluida,
      observacao: obs || null,
      ...patch,
    });

  return (
    <tr className={`border-b border-border/40 last:border-0 ${excluida ? "opacity-50" : ""}`}>
      <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
        {fmtDate(v.data_venda)}
      </td>
      <td className="px-3 py-1.5">{v.nome_cliente ?? "—"}</td>
      <td className="px-3 py-1.5 text-muted-foreground max-w-[220px] truncate">
        {v.produto_original ?? v.produto_grupo}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">{money(v.base_brl)}</td>
      <td className="px-3 py-1.5">
        {v.source ? (
          <Badge
            variant={v.source === "afiliado" ? "default" : "secondary"}
            className="text-[10px]"
          >
            {v.source}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        {v.conflito_afiliado ? (
          <Badge
            variant="destructive"
            className="ml-1 text-[10px]"
            title={`Conflito: afiliado Hotmart é ${v.conflito_afiliado}, mas o link (SCK) é de ${v.seller ?? "outro vendedor"} — vale o link. Conferir o split pago pela Hotmart ao afiliado.`}
          >
            conflito: {v.conflito_afiliado}
          </Badge>
        ) : null}
      </td>
      <td className="px-3 py-1.5">
        <Select
          value={excluida ? "__excluir" : (v.seller ?? "__nenhum")}
          onValueChange={(val) => {
            if (val === "__excluir") return save({ excluir: true });
            if (val === "__nenhum") return save({ excluir: false, seller_name: null });
            save({ excluir: false, seller_name: val });
          }}
        >
          <SelectTrigger className="h-7 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__nenhum">Automático</SelectItem>
            {sellers.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
            <SelectItem value="__excluir">Excluir do cálculo</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-1.5">
        <Input
          className="h-7 text-xs"
          placeholder="Observação…"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          onBlur={() => {
            if ((v.override?.observacao ?? "") !== obs) save({});
          }}
        />
      </td>
    </tr>
  );
}

// ── Rate Row (inline edit) ────────────────────────────────────────────────────

function RateRow({ rate, onSave }: { rate: any; onSave: (d: any) => void }) {
  const [editing, setEditing] = useState(false);
  const [rp, setRp] = useState(String(rate.rate_pct));
  const label =
    PRODUCT_GROUPS.find((p) => p.id === rate.produto_grupo)?.label ?? rate.produto_grupo;

  const save = () => {
    onSave({
      seller_name: rate.seller_name,
      produto_grupo: rate.produto_grupo,
      rate_pct: Number(rp),
      manager_rate_pct: 0,
    });
    setEditing(false);
  };

  return (
    <tr className="border-b border-border/40 last:border-0">
      <td className="py-1.5 pr-4">{rate.seller_name}</td>
      <td className="py-1.5 pr-4 text-muted-foreground">{label}</td>
      {editing ? (
        <td className="py-1">
          <div className="flex items-center justify-end gap-2">
            <Input
              className="h-7 w-20 text-right"
              value={rp}
              onChange={(e) => setRp(e.target.value)}
            />
            <Button size="sm" className="h-7 px-2" onClick={save}>
              ✓
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => setEditing(false)}
            >
              ✕
            </Button>
          </div>
        </td>
      ) : (
        <td
          className="py-1.5 text-right tabular-nums cursor-pointer hover:text-primary"
          onClick={() => setEditing(true)}
        >
          {pct(rate.rate_pct)}
        </td>
      )}
    </tr>
  );
}

// ── New Period Form ───────────────────────────────────────────────────────────

function NewPeriodForm({ onSave }: { onSave: (d: any) => void }) {
  const [nome, setNome] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [cotacao, setCotacao] = useState("");

  const handleCreate = () => {
    onSave({
      nome,
      data_inicio: inicio,
      data_fim: fim,
      roleta_pool_brl: 0,
      roleta_pool_eur: 0,
      cotacao_eur: Number(cotacao) || 0,
    });
    setNome("");
    setInicio("");
    setFim("");
    setCotacao("");
  };

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Nome</p>
        <Input
          className="w-[150px]"
          placeholder="Janeiro 2027"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Início</p>
        <Input
          type="date"
          className="w-[150px]"
          value={inicio}
          onChange={(e) => setInicio(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Fim</p>
        <Input
          type="date"
          className="w-[150px]"
          value={fim}
          onChange={(e) => setFim(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Cotação EUR (R$)</p>
        <Input
          className="w-[90px]"
          placeholder="ex.: 6.01"
          value={cotacao}
          onChange={(e) => setCotacao(e.target.value)}
        />
      </div>
      <Button disabled={!nome || !inicio || !fim} onClick={handleCreate}>
        Criar período
      </Button>
    </div>
  );
}
