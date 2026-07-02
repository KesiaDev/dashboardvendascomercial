import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchCommissionPeriodsFn,
  fetchSellerConfigFn,
  fetchCommissionRatesFn,
  fetchWisePaymentsFn,
  fetchCommissionBonusesFn,
  addCommissionBonusFn,
  deleteCommissionBonusFn,
  upsertCommissionRateFn,
  upsertCommissionPeriodFn,
} from "@/lib/commission.functions";
import { fetchAllSalesFn } from "@/lib/data.functions";
import {
  calculateCommissions,
  countSalesBySellerWeek,
  periodWeeks,
  type CommissionPeriod,
  type CommissionBonus,
} from "@/lib/commission";
import { PRODUCT_GROUPS } from "@/lib/product-groups";
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
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Settings,
  Plus,
  Trash2,
} from "lucide-react";

export const Route = createFileRoute("/_app/comissionamento")({
  component: ComissionamentoPage,
});

const ADMIN_KEY = "comm_admin_v1";
const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN ?? "1234";

// ── PIN Gate ──────────────────────────────────────────────────────────────────

function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);

  const submit = () => {
    if (pin === ADMIN_PIN) {
      localStorage.setItem(ADMIN_KEY, "1");
      onUnlock();
    } else {
      setErr(true);
      setPin("");
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-xs">
        <CardHeader className="text-center space-y-1">
          <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
          <CardTitle className="text-base">Área restrita</CardTitle>
          <p className="text-xs text-muted-foreground">Digite o PIN de administrador</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="password"
            placeholder="PIN"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setErr(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className={err ? "border-destructive" : ""}
          />
          {err && <p className="text-xs text-destructive">PIN incorreto</p>}
          <Button className="w-full" onClick={submit}>
            Entrar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function money(v: number, moeda = "BRL") {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: moeda === "EUR" ? "EUR" : "BRL",
  });
}

function pct(v: number) {
  return `${v.toFixed(1)}%`;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function ComissionamentoPage() {
  const [unlocked, setUnlocked] = useState(
    () => localStorage.getItem(ADMIN_KEY) === "1",
  );
  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />;
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
  const { data: sales = [] } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => (await fetchAllSalesFn()) as any[],
  });

  const activePeriod = useMemo(() => {
    if (periods.length === 0) return null;
    if (periodId) return periods.find((p) => p.id === periodId) ?? periods[0];
    return periods[0];
  }, [periods, periodId]);

  const summary = useMemo(() => {
    if (!activePeriod || sellers.length === 0) return null;
    return calculateCommissions(activePeriod, sellers, rates, sales, wisePayments, bonuses);
  }, [activePeriod, sellers, rates, sales, wisePayments, bonuses]);

  const weekSales = useMemo(() => {
    if (!activePeriod || sellers.length === 0) return [];
    return countSalesBySellerWeek(activePeriod, sellers, sales);
  }, [activePeriod, sellers, sales]);

  const weeks = useMemo(
    () => (activePeriod ? periodWeeks(activePeriod) : []),
    [activePeriod],
  );

  const addBonusMut = useMutation({
    mutationFn: async (d: any) => addCommissionBonusFn({ data: d }),
    onSuccess: () => {
      toast.success("Bônus adicionado");
      qc.invalidateQueries({ queryKey: ["comm_bonuses"] });
      setBonusForm(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delBonusMut = useMutation({
    mutationFn: async (id: number) => deleteCommissionBonusFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Bônus removido");
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

  const managerTotal =
    (summary?.manager_total_brl ?? 0) +
    (summary?.manager_bonuses.reduce((s, b) => s + b.valor, 0) ?? 0);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Comissionamento</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Cálculo automático · período de 5 semanas
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select
            value={String(activePeriod?.id ?? "")}
            onValueChange={(v) => setPeriodId(Number(v))}
          >
            <SelectTrigger className="w-[180px]">
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfig((v) => !v)}
          >
            <Settings className="h-4 w-4 mr-1" />
            {showConfig ? "Fechar config" : "Configurar"}
          </Button>
        </div>
      </div>

      {/* ── Meu comissionamento ── */}
      {summary && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Meu comissionamento — {activePeriod?.nome}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">% adicional sobre vendedores</p>
                <p className="text-2xl font-bold tabular-nums">
                  {money(summary.manager_total_brl)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Bônus meus</p>
                <p className="text-2xl font-bold tabular-nums">
                  {money(summary.manager_bonuses.reduce((s, b) => s + b.valor, 0))}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total a receber</p>
                <p className="text-2xl font-bold tabular-nums text-primary">
                  {money(managerTotal)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Faturamento total time</p>
                <p className="text-2xl font-bold tabular-nums">
                  {money(summary.sellers.reduce((s, r) => s + r.faturamento_total_brl, 0))}
                </p>
              </div>
            </div>

            {/* De onde vem minha comissão */}
            <div className="overflow-x-auto rounded border border-border/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-muted-foreground">
                    <th className="px-3 py-2">Vendedor</th>
                    <th className="px-3 py-2 text-right">Faturamento</th>
                    <th className="px-3 py-2 text-right">Minha % adicional</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.sellers.map((s) => (
                    <tr key={s.sellerName} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-1.5 font-medium">{s.sellerName}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {money(s.faturamento_total_brl)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-primary">
                        {money(s.comissao_manager_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Roleta ── */}
      {summary && weekSales.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <CardTitle className="text-base">Roleta — vendas por semana</CardTitle>
              {activePeriod && (
                <div className="text-right text-xs text-muted-foreground">
                  <span>Pool: {money(activePeriod.roleta_pool_brl)} · {money(activePeriod.roleta_pool_eur, "EUR")}</span>
                  <button
                    className="ml-2 text-primary underline"
                    onClick={() => {
                      const brl = prompt("Pool BRL:", String(activePeriod.roleta_pool_brl));
                      const eur = prompt("Pool EUR:", String(activePeriod.roleta_pool_eur));
                      if (brl !== null && eur !== null) {
                        upsertPeriodMut.mutate({
                          ...activePeriod,
                          roleta_pool_brl: Number(brl),
                          roleta_pool_eur: Number(eur),
                        });
                      }
                    }}
                  >
                    editar
                  </button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4">Vendedor</th>
                  {weeks.map((w) => (
                    <th key={w.week} className="py-2 pr-3 text-right">
                      {w.label}
                    </th>
                  ))}
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {weekSales.map((ws) => (
                  <tr key={ws.sellerName} className="border-b border-border/40 last:border-0">
                    <td className="py-1.5 pr-4 font-medium">{ws.sellerName}</td>
                    {ws.weeks.map((c, i) => (
                      <td key={i} className="py-1.5 pr-3 text-right tabular-nums">
                        {c || "—"}
                      </td>
                    ))}
                    <td className="py-1.5 text-right tabular-nums font-semibold">{ws.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Vendedores ── */}
      {summary && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Comissão dos vendedores
          </h3>

          {summary.sellers.map((s) => (
            <Card key={s.sellerName}>
              <CardHeader
                className="cursor-pointer select-none py-3"
                onClick={() =>
                  setExpandedSeller(expandedSeller === s.sellerName ? null : s.sellerName)
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{s.sellerName}</Badge>
                    <span className="text-xs text-muted-foreground">
                      Fat. {money(s.faturamento_total_brl)}
                    </span>
                    {s.wise_eur > 0 && (
                      <span className="text-xs text-muted-foreground">
                        · Wise {money(s.wise_eur, "EUR")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Vendedor recebe</p>
                      <p className="font-semibold tabular-nums">{money(s.total_a_pagar)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Minha % adicional</p>
                      <p className="font-semibold tabular-nums text-primary">
                        {money(s.comissao_manager_total)}
                      </p>
                    </div>
                    {expandedSeller === s.sellerName ? (
                      <ChevronUp className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    )}
                  </div>
                </div>
              </CardHeader>

              {expandedSeller === s.sellerName && (
                <CardContent className="space-y-5 pt-0">
                  {/* Por produto */}
                  {s.byProduct.length > 0 && (
                    <div className="overflow-x-auto rounded border border-border/50">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/30 text-left text-muted-foreground">
                            <th className="px-3 py-2">Produto</th>
                            <th className="px-3 py-2 text-right">Hotmart</th>
                            <th className="px-3 py-2 text-right">Wise</th>
                            <th className="px-3 py-2 text-right">% seller</th>
                            <th className="px-3 py-2 text-right">Comissão</th>
                            <th className="px-3 py-2 text-right">% Késia</th>
                            <th className="px-3 py-2 text-right">Minha parte</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.byProduct.map((p) => (
                            <tr
                              key={p.produto_grupo}
                              className="border-b border-border/40 last:border-0"
                            >
                              <td className="px-3 py-1.5 max-w-[160px] truncate">{p.label}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">
                                {money(p.faturamento)}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                                {p.faturamento_wise > 0 ? money(p.faturamento_wise) : "—"}
                              </td>
                              <td className="px-3 py-1.5 text-right">{pct(p.rate_pct)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                                {money(p.comissao_seller)}
                              </td>
                              <td className="px-3 py-1.5 text-right">{pct(p.manager_rate_pct)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-primary">
                                {money(p.comissao_manager)}
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-muted/20 font-semibold">
                            <td className="px-3 py-2" colSpan={4}>
                              Total
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {money(s.comissao_seller_total)}
                            </td>
                            <td />
                            <td className="px-3 py-2 text-right tabular-nums text-primary">
                              {money(s.comissao_manager_total)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  {s.byProduct.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma venda Hotmart/Wise encontrada neste período para este vendedor.
                    </p>
                  )}

                  {/* Bônus */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Bônus
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
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Adicionar
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
                          <span className="tabular-nums font-medium">
                            {money(b.valor, b.moeda)}
                          </span>
                          <button
                            onClick={() => delBonusMut.mutate(b.id)}
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
                          onValueChange={(v) => setBonusForm((f) => f && { ...f, tipo: v })}
                        >
                          <SelectTrigger className="w-[110px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="roleta">Roleta</SelectItem>
                            <SelectItem value="fixo">Fixo</SelectItem>
                            <SelectItem value="manual">Manual</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          className="w-[100px] h-8"
                          placeholder="Valor"
                          value={bonusForm.valor}
                          onChange={(e) => setBonusForm((f) => f && { ...f, valor: e.target.value })}
                        />
                        <Select
                          value={bonusForm.moeda}
                          onValueChange={(v) => setBonusForm((f) => f && { ...f, moeda: v })}
                        >
                          <SelectTrigger className="w-[75px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BRL">BRL</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          className="flex-1 min-w-[120px] h-8"
                          placeholder="Notas"
                          value={bonusForm.notas}
                          onChange={(e) => setBonusForm((f) => f && { ...f, notas: e.target.value })}
                        />
                        <Button
                          size="sm"
                          className="h-8"
                          disabled={!bonusForm.valor || addBonusMut.isPending}
                          onClick={() =>
                            activePeriod &&
                            addBonusMut.mutate({
                              period_id: activePeriod.id,
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
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          onClick={() => setBonusForm(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ── Configuração de taxas ── */}
      {showConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Taxas de comissão
            </CardTitle>
            <p className="text-xs text-muted-foreground">Clique nos valores para editar</p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4">Vendedor</th>
                  <th className="py-2 pr-4">Produto</th>
                  <th className="py-2 pr-4 text-right">% Vendedor</th>
                  <th className="py-2 text-right">% Késia (adicional)</th>
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
      )}

      {/* ── Novo período ── */}
      {showConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Adicionar período</CardTitle>
          </CardHeader>
          <CardContent>
            <NewPeriodForm onSave={(d) => upsertPeriodMut.mutate(d)} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Rate Row (inline edit) ─────────────────────────────────────────────────────

function RateRow({ rate, onSave }: { rate: any; onSave: (d: any) => void }) {
  const [editing, setEditing] = useState(false);
  const [rp, setRp] = useState(String(rate.rate_pct));
  const [mp, setMp] = useState(String(rate.manager_rate_pct));
  const label =
    PRODUCT_GROUPS.find((p) => p.id === rate.produto_grupo)?.label ?? rate.produto_grupo;

  const save = () => {
    onSave({
      seller_name: rate.seller_name,
      produto_grupo: rate.produto_grupo,
      rate_pct: Number(rp),
      manager_rate_pct: Number(mp),
    });
    setEditing(false);
  };

  return (
    <tr className="border-b border-border/40 last:border-0">
      <td className="py-1.5 pr-4">{rate.seller_name}</td>
      <td className="py-1.5 pr-4 text-muted-foreground">{label}</td>
      {editing ? (
        <>
          <td className="py-1 pr-4">
            <Input
              className="h-7 w-20 text-right"
              value={rp}
              onChange={(e) => setRp(e.target.value)}
            />
          </td>
          <td className="py-1">
            <div className="flex items-center gap-2">
              <Input
                className="h-7 w-20 text-right"
                value={mp}
                onChange={(e) => setMp(e.target.value)}
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
        </>
      ) : (
        <>
          <td
            className="py-1.5 pr-4 text-right tabular-nums cursor-pointer hover:text-primary"
            onClick={() => setEditing(true)}
          >
            {pct(rate.rate_pct)}
          </td>
          <td
            className="py-1.5 text-right tabular-nums cursor-pointer hover:text-primary"
            onClick={() => setEditing(true)}
          >
            {pct(rate.manager_rate_pct)}
          </td>
        </>
      )}
    </tr>
  );
}

// ── New Period Form ────────────────────────────────────────────────────────────

function NewPeriodForm({ onSave }: { onSave: (d: any) => void }) {
  const [nome, setNome] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");

  const handleCreate = () => {
    onSave({ nome, data_inicio: inicio, data_fim: fim, roleta_pool_brl: 0, roleta_pool_eur: 0 });
    setNome("");
    setInicio("");
    setFim("");
  };

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Nome</p>
        <Input
          className="w-[150px]"
          placeholder="Agosto 2026"
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
        <p className="text-xs text-muted-foreground">Fim (5 semanas = 34 dias)</p>
        <Input
          type="date"
          className="w-[150px]"
          value={fim}
          onChange={(e) => setFim(e.target.value)}
        />
      </div>
      <Button disabled={!nome || !inicio || !fim} onClick={handleCreate}>
        Criar período
      </Button>
    </div>
  );
}
