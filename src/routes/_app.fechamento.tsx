import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import {
  createManualSale,
  listManualSales,
  listManualSalesAdmin,
  updateManualSale,
  deleteManualSale,
  lookupByEmailFn,
  confirmManualSaleFn,
  reconfirmAllPendingFn,
  markInstallmentPaidFn,
  PRODUCTS,
  FUNNELS,
  SELLERS,
  type HotmartMatch,
  type ManualSale,
} from "@/lib/manual-sales.functions";
import { isRenewalProduct } from "@/lib/product-groups";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  CheckCircle2, LogIn, LogOut, Pencil, Plus, Trash2, X,
  Search, AlertCircle, RefreshCw, CheckCheck, AlertTriangle, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/_app/fechamento")({ component: FechamentoPage });

function todayBR() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function moneyEur(v: number) {
  return `€${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function moneyBrl(v: number) {
  return `R$${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Badge de status de confirmação ──────────────────────────────────────────

function ConfirmBadge({ status }: { status: string }) {
  if (status === "confirmado_hotmart")
    return <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30 text-xs gap-1"><CheckCircle2 className="h-3 w-3" />Hotmart ✓</Badge>;
  if (status === "confirmado_wise")
    return <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30 text-xs gap-1"><CheckCircle2 className="h-3 w-3" />Wise ✓</Badge>;
  if (status === "nao_encontrado")
    return <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-xs gap-1"><AlertCircle className="h-3 w-3" />Não encontrado</Badge>;
  return <Badge className="bg-yellow-600/20 text-yellow-400 border-yellow-600/30 text-xs gap-1"><Search className="h-3 w-3" />Pendente</Badge>;
}

// ── Componente de lookup inline ──────────────────────────────────────────────

function EmailLookup({ email, saleDate }: { email: string; saleDate: string }) {
  const { data: matches, isFetching } = useQuery({
    queryKey: ["hotmart-lookup", email, saleDate],
    queryFn: () => lookupByEmailFn({ data: { email, sale_date: saleDate } }),
    enabled: !!email && email.includes("@"),
    staleTime: 30_000,
  });

  if (!email || !email.includes("@")) return null;
  if (isFetching) return <p className="text-xs text-muted-foreground mt-1">Buscando no Hotmart...</p>;

  if (!matches || matches.length === 0)
    return (
      <div className="mt-1 flex items-center gap-1.5 text-xs text-yellow-500">
        <AlertCircle className="h-3.5 w-3.5" />
        Não encontrado no Hotmart — verifique o email ou confirme pelo Wise
      </div>
    );

  return (
    <div className="mt-1 space-y-1">
      {matches.map((m) => (
        <div key={m.id} className="flex items-center gap-2 rounded-md bg-emerald-950/30 border border-emerald-800/40 px-2.5 py-1.5 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="text-emerald-300 font-medium">{m.produto_original}</span>
          <span className="text-muted-foreground">·</span>
          <span className="tabular-nums">{moneyBrl(m.faturamento_liquido_brl ?? 0)}</span>
          <span className="text-muted-foreground">·</span>
          <span>{fmtDate(m.data_venda ?? "")}</span>
          {m.nome_afiliado && <span className="text-muted-foreground">· {m.nome_afiliado}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────

function FechamentoPage() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) return <div className="text-sm text-muted-foreground">Carregando...</div>;
  if (!session) return <LoginCard />;
  return <FechamentoForm session={session} />;
}

function LoginCard() {
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Fechamento Diário</CardTitle>
          <CardDescription>Entre com seu Gmail para registrar suas vendas do dia.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" disabled={busy} onClick={async () => {
            setBusy(true);
            window.sessionStorage.setItem("dashcomercial_google_next", "/fechamento");
            const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
            if ((res as any)?.error) {
              const message = String((res as any).error?.message ?? (res as any).error);
              toast.error(message === "Sign in was cancelled" ? "Login cancelado ou interrompido. Toque em Entrar com Google novamente." : `Falha no login: ${message}`);
              setBusy(false);
            }
          }}>
            <LogIn className="mr-2 h-4 w-4" /> Entrar com Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

type SaleRow = ManualSale;

const ADMIN_EMAILS = ["kesia@llmidia.com", "kesiawnandi@gmail.com", "kesia@llmidiaco.com"];
function isAdminEmail(e: string) { return ADMIN_EMAILS.includes((e ?? "").trim().toLowerCase()); }

// Normaliza vendedor: mapeia e-mails corporativos para o nome canônico
const SELLER_CANONICAL: Record<string, string> = {
  "joaopessoa@lucianolarrossa.com": "João Pessoa",
  "giselegagliano@lucianolarrossa.com": "Gisele Pimentel",
  "fabionadal@lucianolarrossa.com": "Fabio Nadal",
  "ritabandeira@lucianolarrossa.com": "Rita Bandeira",
  "luana.guimaraes@lucianolarrossa.com": "Luana Guimarães",
};
function normalizeSeller(raw: string | null | undefined): string {
  if (!raw) return "—";
  const lower = raw.toLowerCase();
  for (const [email, name] of Object.entries(SELLER_CANONICAL)) {
    if (lower === email || lower.includes(email.split("@")[0])) return name;
  }
  return raw;
}

function FechamentoForm({ session }: { session: any }) {
  const email = session?.user?.email ?? "";
  const isAdmin = isAdminEmail(email);
  const qc = useQueryClient();

  const [seller, setSeller] = useState<string>("");
  const [funnel, setFunnel] = useState<string>("");
  const [saleDate, setSaleDate] = useState(todayBR());
  const [notes, setNotes] = useState("");

  type Item = {
    product: string;
    value: string;
    clientName: string;
    clientEmail: string;
    roleta: "" | "mentoria" | "accelerator";
    bonus: "" | "30" | "60";
    installments: "1" | "2" | "3";
  };
  const emptyItem = (): Item => ({ product: "", value: "", clientName: "", clientEmail: "", roleta: "", bonus: "", installments: "1" });
  const [items, setItems] = useState<Item[]>([emptyItem()]);

  const updateItem = (i: number, patch: Partial<Item>) =>
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((arr) => [...arr, emptyItem()]);
  const removeItem = (i: number) => setItems((arr) => arr.length === 1 ? arr : arr.filter((_, idx) => idx !== i));


  const [editing, setEditing] = useState<SaleRow | null>(null);
  const [deleting, setDeleting] = useState<SaleRow | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const today = todayBR();
  const monthFrom = today.slice(0, 7) + "-01";

  const { data: sales = [] } = useQuery({
    queryKey: ["manual-sales", monthFrom, isAdmin],
    queryFn: () => isAdmin
      ? listManualSalesAdmin({ data: { from: monthFrom } })
      : listManualSales({ data: { from: monthFrom } }),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(
        items.map((it) =>
          createManualSale({
            data: {
              seller_name: seller,
              product: it.product,
              funnel,
              value_eur: Number(it.value.replace(",", ".")),
              client_name: it.clientName || undefined,
              client_email: it.clientEmail,
              sale_date: saleDate,
              notes: notes || undefined,
              roleta_type: it.roleta || null,
              bonus_semanal_eur: it.bonus ? (Number(it.bonus) as 30 | 60) : null,
              installment_total: Number(it.installments),
            },
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length) throw new Error(`${failed.length} venda(s) falharam`);

      // Conta quantas foram confirmadas automaticamente
      const confirmed = results.filter(
        (r) => r.status === "fulfilled" && (r.value as any)?.confirmation === "confirmado_hotmart"
      ).length;
      return { count: results.length, confirmed };

    },
    onSuccess: ({ count, confirmed }) => {
      if (confirmed > 0)
        toast.success(`${count} venda(s) registrada(s)! ${confirmed} confirmada(s) automaticamente no Hotmart ✅`);
      else
        toast.success(`${count} venda(s) registrada(s)! Aguardando confirmação no Hotmart ⏳`);
      setItems([emptyItem()]); setNotes("");
      qc.invalidateQueries({ queryKey: ["manual-sales"] });
    },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => deleteManualSale({ data: { id } }),
    onSuccess: () => {
      toast.success("Venda apagada");
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["manual-sales"] });
    },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  const confirmMut = useMutation({
    mutationFn: (d: Parameters<typeof confirmManualSaleFn>[0]["data"]) =>
      confirmManualSaleFn({ data: d }),
    onSuccess: () => {
      toast.success("Status atualizado");
      setConfirmingId(null);
      qc.invalidateQueries({ queryKey: ["manual-sales"] });
    },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  const reconfirmMut = useMutation({
    mutationFn: () => reconfirmAllPendingFn(),
    onSuccess: (r: any) => {
      const extra = r.mismatches ? ` · ${r.mismatches} com afiliado divergente` : "";
      toast.success(`Re-confirmação: ${r.confirmed}/${r.total} confirmadas no Hotmart${extra}`);
      qc.invalidateQueries({ queryKey: ["manual-sales"] });
    },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  const markPaidMut = useMutation({
    mutationFn: (d: { id: string; paid: boolean }) => markInstallmentPaidFn({ data: d }),
    onSuccess: (_r, v) => {
      toast.success(v.paid ? "Parcela marcada como paga ✅" : "Parcela reaberta");
      qc.invalidateQueries({ queryKey: ["manual-sales"] });
    },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  // Parcelas futuras não pagas NÃO entram no total até serem confirmadas
  const paidSales = sales.filter((s) => s.installment_paid);
  const pendingInstallments = sales.filter((s) => !s.installment_paid);

  const todaySales = paidSales.filter((s) => s.sale_date === today);
  const todayTotal = todaySales.reduce((acc, s) => acc + Number(s.value_eur), 0);
  const monthTotal = paidSales.reduce((acc, s) => acc + Number(s.value_eur), 0);
  const formTotal = items.reduce((acc, it) => acc + (Number(it.value.replace(",", ".")) || 0), 0);

  // Separação Novas vs Renovações (renovações não contam como venda nova)
  const todayNovas = todaySales.filter((s) => !isRenewalProduct(s.product));
  const todayRenov = todaySales.filter((s) => isRenewalProduct(s.product));
  const todayNovasTotal = todayNovas.reduce((a, s) => a + Number(s.value_eur), 0);
  const todayRenovTotal = todayRenov.reduce((a, s) => a + Number(s.value_eur), 0);
  const monthNovas = paidSales.filter((s) => !isRenewalProduct(s.product));
  const monthRenov = paidSales.filter((s) => isRenewalProduct(s.product));
  const monthNovasTotal = monthNovas.reduce((a, s) => a + Number(s.value_eur), 0);
  const monthRenovTotal = monthRenov.reduce((a, s) => a + Number(s.value_eur), 0);

  const pendingCount = sales.filter((s) => s.confirmation_status === "pendente").length;
  const confirmedCount = sales.filter((s) => s.confirmation_status === "confirmado_hotmart" || s.confirmation_status === "confirmado_wise").length;
  const mismatchCount = sales.filter((s) => s.affiliate_mismatch).length;


  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Registrar venda</CardTitle>
              <CardDescription>Logado como {email}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </Button>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!seller || !funnel) { toast.error("Selecione vendedor e funil"); return; }
                const invalid = items.some((it) => !it.product || !it.value || !it.clientEmail);
                if (invalid) { toast.error("Produto, valor e e-mail do cliente são obrigatórios"); return; }
                mutation.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label>Vendedor *</Label>
                <Select value={seller} onValueChange={setSeller}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {SELLERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Data da venda *</Label>
                <Input type="date" value={saleDate} max={today} onChange={(e) => setSaleDate(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Funil onde deu ganho *</Label>
                <Select value={funnel} onValueChange={setFunnel}>
                  <SelectTrigger><SelectValue placeholder="Selecione o funil" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {FUNNELS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Produtos vendidos ({items.length})</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="mr-1 h-3 w-3" /> Adicionar produto
                  </Button>
                </div>

                {items.map((it, i) => (
                  <div key={i} className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Venda #{i + 1}</span>
                      {items.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-destructive hover:text-destructive" onClick={() => removeItem(i)}>
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs">Produto *</Label>
                        <Select value={it.product} onValueChange={(v) => updateItem(i, { product: v })}>
                          <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                          <SelectContent>
                            {PRODUCTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Valor (EUR) *</Label>
                        <Input type="text" inputMode="decimal" placeholder="ex: 1497.00" value={it.value} onChange={(e) => updateItem(i, { value: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Nome do cliente</Label>
                        <Input value={it.clientName} onChange={(e) => updateItem(i, { clientName: e.target.value })} />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs flex items-center gap-1">
                          E-mail do cliente *
                          <span className="text-muted-foreground font-normal">(usado para confirmar no Hotmart)</span>
                        </Label>
                        <Input
                          type="email"
                          required
                          placeholder="cliente@email.com"
                          value={it.clientEmail}
                          onChange={(e) => updateItem(i, { clientEmail: e.target.value })}
                        />
                        {/* Lookup em tempo real */}
                        <EmailLookup email={it.clientEmail} saleDate={saleDate} />
                      </div>


                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs">Parcelamento</Label>
                        <Select
                          value={it.installments}
                          onValueChange={(v) => updateItem(i, { installments: v as "1" | "2" | "3" })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">À vista (1x)</SelectItem>
                            <SelectItem value="2">2x — agenda +1 parcela no próximo mês</SelectItem>
                            <SelectItem value="3">3x — agenda +2 parcelas nos próximos meses</SelectItem>
                          </SelectContent>
                        </Select>
                        {it.installments !== "1" && it.value && (
                          <p className="text-xs text-muted-foreground">
                            Serão criadas <b>{Number(it.installments) - 1}</b> parcela(s) futura(s) de {moneyEur(Number(it.value.replace(",", ".")) || 0)} pendentes de pagamento.
                          </p>
                        )}
                      </div>


                      {/* Roleta e bônus semanal — visíveis só para admin (cálculo definido depois) */}
                      {isAdmin && (
                        <>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Giro de roleta? <span className="text-muted-foreground">(admin)</span></Label>
                            <Select
                              value={it.roleta || "none"}
                              onValueChange={(v) => updateItem(i, { roleta: v === "none" ? "" : (v as "mentoria" | "accelerator") })}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Não dá roleta</SelectItem>
                                <SelectItem value="mentoria">Roleta Mentoria</SelectItem>
                                <SelectItem value="accelerator">Roleta Accelerator</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Conta p/ bônus semanal? <span className="text-muted-foreground">(admin)</span></Label>
                            <Select
                              value={it.bonus || "none"}
                              onValueChange={(v) => updateItem(i, { bonus: v === "none" ? "" : (v as "30" | "60") })}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Não conta</SelectItem>
                                <SelectItem value="30">Sim · €30</SelectItem>
                                <SelectItem value="60">Sim · €60</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}


                <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Total deste fechamento</span>
                  <span className="font-bold tabular-nums">{items.length} venda(s) · {moneyEur(formTotal)}</span>
                </div>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Observação</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <div className="sm:col-span-2">
                <Button type="submit" disabled={mutation.isPending} className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  {mutation.isPending ? "Salvando..." : `Registrar ${items.length} venda(s)`}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  O e-mail do cliente é cruzado automaticamente com o Hotmart para confirmar a venda.
                </p>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Coluna lateral */}
        <div className="space-y-4">
          {/* Resumo do mês */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Status do mês</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-emerald-950/30 p-2">
                  <p className="text-lg font-bold text-emerald-400">{confirmedCount}</p>
                  <p className="text-xs text-muted-foreground">Confirmadas</p>
                </div>
                <div className="rounded-lg bg-yellow-950/30 p-2">
                  <p className="text-lg font-bold text-yellow-400">{pendingCount}</p>
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                </div>
                <div className="rounded-lg bg-secondary/50 p-2">
                  <p className="text-lg font-bold">{sales.length}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
              {pendingCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => reconfirmMut.mutate()}
                  disabled={reconfirmMut.isPending}
                >
                  <RefreshCw className={cn("mr-2 h-3.5 w-3.5", reconfirmMut.isPending && "animate-spin")} />
                  Re-verificar {pendingCount} pendente(s) no Hotmart
                </Button>
              )}
              {mismatchCount > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-orange-800/40 bg-orange-950/30 px-3 py-2 text-xs text-orange-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <b>{mismatchCount}</b> venda(s) com afiliado Hotmart diferente do vendedor lançado — revise abaixo (venda por link SCK ou lançamento no vendedor errado).
                  </span>
                </div>
              )}
            </CardContent>
          </Card>


          {/* Vendas de hoje */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vendas de hoje</CardTitle>
              <CardDescription>
                {todaySales.length} venda(s) · {moneyEur(todayTotal)}
              </CardDescription>
              <div className="mt-2 grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-md bg-emerald-950/30 p-2">
                  <p className="font-bold text-emerald-400 tabular-nums">{moneyEur(todayNovasTotal)}</p>
                  <p className="text-muted-foreground">Novas ({todayNovas.length})</p>
                </div>
                <div className="rounded-md bg-blue-950/30 p-2">
                  <p className="font-bold text-blue-400 tabular-nums">{moneyEur(todayRenovTotal)}</p>
                  <p className="text-muted-foreground">Renovações ({todayRenov.length})</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {todaySales.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma venda registrada hoje ainda.</p>
              )}
              {todaySales.map((s) => (
                <SaleCard key={s.id} sale={s} isAdmin={isAdmin} onEdit={() => setEditing(s)} onDelete={() => setDeleting(s)} onConfirm={() => setConfirmingId(s.id)} onMarkPaid={(paid) => markPaidMut.mutate({ id: s.id, paid })} />
              ))}
            </CardContent>
          </Card>

          {/* Parcelas pendentes do mês */}
          {pendingInstallments.length > 0 && (
            <Card className="border-yellow-800/40 bg-yellow-950/10">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-yellow-400" />
                  Parcelas pendentes ({pendingInstallments.length})
                </CardTitle>
                <CardDescription>
                  Parcelas agendadas cujo pagamento ainda não foi confirmado. Marque como paga assim que o cliente pagar.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingInstallments.map((s) => (
                  <SaleCard key={s.id} sale={s} isAdmin={isAdmin} onEdit={() => setEditing(s)} onDelete={() => setDeleting(s)} onConfirm={() => setConfirmingId(s.id)} onMarkPaid={(paid) => markPaidMut.mutate({ id: s.id, paid })} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Vendas do mês */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vendas do mês</CardTitle>
              <CardDescription>
                {paidSales.length} confirmada(s) · {moneyEur(monthTotal)}
              </CardDescription>
              <div className="mt-2 grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-md bg-emerald-950/30 p-2">
                  <p className="font-bold text-emerald-400 tabular-nums">{moneyEur(monthNovasTotal)}</p>
                  <p className="text-muted-foreground">Novas ({monthNovas.length})</p>
                </div>
                <div className="rounded-md bg-blue-950/30 p-2">
                  <p className="font-bold text-blue-400 tabular-nums">{moneyEur(monthRenovTotal)}</p>
                  <p className="text-muted-foreground">Renovações ({monthRenov.length})</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {sales.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma venda registrada neste mês.</p>
              )}
              {sales.map((s) => (
                <SaleCard key={s.id} sale={s} isAdmin={isAdmin} onEdit={() => setEditing(s)} onDelete={() => setDeleting(s)} onConfirm={() => setConfirmingId(s.id)} onMarkPaid={(paid) => markPaidMut.mutate({ id: s.id, paid })} />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <EditDialog sale={editing} isAdmin={isAdmin} onClose={() => setEditing(null)} />

      {/* Dialog de confirmação manual */}
      <Dialog open={!!confirmingId} onOpenChange={(o) => !o && setConfirmingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar status de confirmação</DialogTitle>
            <DialogDescription>Escolha o status desta venda manualmente.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {(["confirmado_hotmart", "confirmado_wise", "nao_encontrado", "pendente"] as const).map((st) => (
              <Button
                key={st}
                variant="outline"
                className="justify-start"
                onClick={() => confirmingId && confirmMut.mutate({ id: confirmingId, status: st })}
              >
                <ConfirmBadge status={st} />
                <span className="ml-2 capitalize">{st.replace(/_/g, " ")}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar venda?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <>Esta ação não pode ser desfeita. Venda de <b>{deleting.seller_name}</b> de {moneyEur(Number(deleting.value_eur))} em {fmtDate(deleting.sale_date)}.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && delMutation.mutate(deleting.id)}
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Card de venda individual ─────────────────────────────────────────────────

function SaleCard({ sale, isAdmin, onEdit, onDelete, onConfirm, onMarkPaid }: {
  sale: SaleRow;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onConfirm: () => void;
  onMarkPaid: (paid: boolean) => void;
}) {
  const isInstallment = sale.installment_total > 1;
  const isPendingInst = isInstallment && !sale.installment_paid;
  return (
    <div className="rounded-lg border border-border/50 bg-card/50 p-3 text-sm space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{normalizeSeller(sale.seller_name).split(" ")[0]}</span>
            <span className="tabular-nums font-bold">{moneyEur(Number(sale.value_eur))}</span>
            <ConfirmBadge status={sale.confirmation_status} />
            {sale.affiliate_mismatch && (
              <Badge className="bg-orange-600/20 text-orange-400 border-orange-600/30 text-xs gap-1">
                <AlertTriangle className="h-3 w-3" />Afiliado ≠
              </Badge>
            )}
            {isAdmin && sale.roleta_type && (
              <Badge variant="outline" className="text-xs">
                🎯 Roleta {sale.roleta_type === "mentoria" ? "Mentoria" : "Accelerator"}
              </Badge>
            )}
            {isAdmin && sale.bonus_semanal_eur && (
              <Badge variant="outline" className="text-xs">
                Bônus €{sale.bonus_semanal_eur}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate mt-0.5">{fmtDate(sale.sale_date)} · {sale.product}</div>
          <div className="text-xs text-muted-foreground truncate">{sale.funnel}</div>
          {(sale.client_name || sale.client_email) && (
            <div className="mt-1 text-xs">
              <span className="text-muted-foreground">Cliente: </span>
              <span className="font-medium">{sale.client_name || "—"}</span>
              {sale.client_email && <span className="text-muted-foreground"> · {sale.client_email}</span>}
            </div>
          )}
          {/* Mostra o valor BRL confirmado no Hotmart */}
          {sale.confirmation_status === "confirmado_hotmart" && sale.confirmed_hotmart_valor_brl && (
            <div className="mt-1 flex items-center gap-1 text-xs text-emerald-400">
              <CheckCheck className="h-3 w-3" />
              Hotmart: {moneyBrl(sale.confirmed_hotmart_valor_brl)}
            </div>
          )}
          {sale.affiliate_mismatch && sale.hotmart_nome_afiliado && (
            <div className="mt-1 flex items-center gap-1 text-xs text-orange-400">
              <AlertTriangle className="h-3 w-3" />
              Afiliado Hotmart: <b>{sale.hotmart_nome_afiliado}</b> — vendedor lançado: <b>{sale.seller_name}</b>
            </div>
          )}
          {sale.notes && <div className="mt-1 text-xs italic text-muted-foreground">"{sale.notes}"</div>}

        </div>
      </div>
      <div className="flex gap-1 flex-wrap">
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onEdit}>
          <Pencil className="mr-1 h-3 w-3" /> Editar
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onConfirm}>
          <CheckCircle2 className="mr-1 h-3 w-3" /> Status
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="mr-1 h-3 w-3" /> Apagar
        </Button>
      </div>
    </div>
  );
}

// ── Dialog de edição ─────────────────────────────────────────────────────────

function EditDialog({ sale, isAdmin, onClose }: { sale: SaleRow | null; isAdmin: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<SaleRow | null>(sale);

  useEffect(() => { setForm(sale); }, [sale]);

  const mut = useMutation({
    mutationFn: () => updateManualSale({
      data: {
        id: form!.id,
        seller_name: form!.seller_name,
        product: form!.product,
        funnel: form!.funnel,
        value_eur: Number(String(form!.value_eur).replace(",", ".")),
        client_name: form!.client_name ?? undefined,
        client_email: form!.client_email ?? "",
        sale_date: form!.sale_date,
        notes: form!.notes ?? undefined,
        roleta_type: form!.roleta_type ?? null,
        bonus_semanal_eur: form!.bonus_semanal_eur ?? null,
      },
    }),

    onSuccess: () => {
      toast.success("Venda atualizada");
      qc.invalidateQueries({ queryKey: ["manual-sales"] });
      onClose();
    },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  const today = todayBR();

  return (
    <Dialog open={!!sale} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar venda</DialogTitle>
          <DialogDescription>Atualize os dados e salve.</DialogDescription>
        </DialogHeader>
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Vendedor</Label>
              <Select value={form.seller_name} onValueChange={(v) => setForm({ ...form, seller_name: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SELLERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" max={today} value={form.sale_date} onChange={(e) => setForm({ ...form, sale_date: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Produto</Label>
              <Select value={form.product} onValueChange={(v) => setForm({ ...form, product: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRODUCTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Funil</Label>
              <Select value={form.funnel} onValueChange={(v) => setForm({ ...form, funnel: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FUNNELS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor (EUR)</Label>
              <Input value={String(form.value_eur)} onChange={(e) => setForm({ ...form, value_eur: e.target.value as any })} />
            </div>
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Input value={form.client_name ?? ""} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>E-mail do cliente *</Label>
              <Input type="email" required value={form.client_email ?? ""} onChange={(e) => setForm({ ...form, client_email: e.target.value })} />
              <EmailLookup email={form.client_email ?? ""} saleDate={form.sale_date} />
            </div>
            {isAdmin && (
              <>
                <div className="space-y-1.5">
                  <Label>Giro de roleta? <span className="text-muted-foreground text-xs">(admin)</span></Label>
                  <Select
                    value={form.roleta_type ?? "none"}
                    onValueChange={(v) => setForm({ ...form, roleta_type: v === "none" ? null : (v as "mentoria" | "accelerator") })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não dá roleta</SelectItem>
                      <SelectItem value="mentoria">Roleta Mentoria</SelectItem>
                      <SelectItem value="accelerator">Roleta Accelerator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Bônus semanal <span className="text-muted-foreground text-xs">(admin)</span></Label>
                  <Select
                    value={form.bonus_semanal_eur ? String(form.bonus_semanal_eur) : "none"}
                    onValueChange={(v) => setForm({ ...form, bonus_semanal_eur: v === "none" ? null : (Number(v) as 30 | 60) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não conta</SelectItem>
                      <SelectItem value="30">Sim · €30</SelectItem>
                      <SelectItem value="60">Sim · €60</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observação</Label>
              <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Salvando..." : "Salvar e re-verificar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
