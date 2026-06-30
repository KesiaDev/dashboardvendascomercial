import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import {
  createManualSale,
  listManualSales,
  updateManualSale,
  deleteManualSale,
  PRODUCTS,
  FUNNELS,
  SELLERS,
} from "@/lib/manual-sales.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { CheckCircle2, LogIn, LogOut, Pencil, Plus, Trash2, X } from "lucide-react";

export const Route = createFileRoute("/_app/fechamento")({ component: FechamentoPage });

function todayBR() {
  const nowBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return nowBR.toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function FechamentoPage() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
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
          <Button
            className="w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const res = await lovable.auth.signInWithOAuth("google", {
                redirect_uri: `${window.location.origin}/fechamento`,
              });
              if ((res as any)?.error) {
                toast.error("Falha no login: " + String((res as any).error?.message ?? (res as any).error));
                setBusy(false);
              }
            }}
          >
            <LogIn className="mr-2 h-4 w-4" /> Entrar com Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

type SaleRow = Awaited<ReturnType<typeof listManualSales>>[number];

function FechamentoForm({ session }: { session: any }) {
  const email = session?.user?.email ?? "";
  const userId = session?.user?.id ?? "";
  const qc = useQueryClient();

  const [seller, setSeller] = useState<string>("");
  const [funnel, setFunnel] = useState<string>("");
  const [saleDate, setSaleDate] = useState(todayBR());
  const [notes, setNotes] = useState("");

  type Item = { product: string; value: string; clientName: string; clientEmail: string };
  const emptyItem = (): Item => ({ product: "", value: "", clientName: "", clientEmail: "" });
  const [items, setItems] = useState<Item[]>([emptyItem()]);

  const updateItem = (i: number, patch: Partial<Item>) =>
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((arr) => [...arr, emptyItem()]);
  const removeItem = (i: number) => setItems((arr) => (arr.length === 1 ? arr : arr.filter((_, idx) => idx !== i)));

  const [editing, setEditing] = useState<SaleRow | null>(null);
  const [deleting, setDeleting] = useState<SaleRow | null>(null);

  const today = todayBR();
  const monthFrom = today.slice(0, 7) + "-01";

  const { data: sales = [] } = useQuery({
    queryKey: ["manual-sales", monthFrom],
    queryFn: () => listManualSales({ data: { from: monthFrom } }),
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
              client_email: it.clientEmail || undefined,
              sale_date: saleDate,
              notes: notes || undefined,
            },
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length) throw new Error(`${failed.length} venda(s) falharam`);
      return { count: results.length };
    },
    onSuccess: ({ count }) => {
      toast.success(`${count} venda(s) registrada(s)! 🎉`);
      setItems([emptyItem()]); setNotes("");
      qc.invalidateQueries({ queryKey: ["manual-sales"] });
      qc.invalidateQueries({ queryKey: ["clint-ranking"] });
    },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => deleteManualSale({ data: { id } }),
    onSuccess: () => {
      toast.success("Venda apagada");
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["manual-sales"] });
      qc.invalidateQueries({ queryKey: ["clint-ranking"] });
    },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  const todaySales = sales.filter((s) => s.sale_date === today);
  const todayTotal = todaySales.reduce((acc, s) => acc + Number(s.value_eur), 0);
  const monthTotal = sales.reduce((acc, s) => acc + Number(s.value_eur), 0);

  const formTotal = items.reduce((acc, it) => acc + (Number(it.value.replace(",", ".")) || 0), 0);

  return (
    <>
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
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
              if (!seller || !funnel) {
                toast.error("Selecione vendedor e funil");
                return;
              }
              const invalid = items.some((it) => !it.product || !it.value);
              if (invalid) {
                toast.error("Cada produto precisa de produto e valor");
                return;
              }
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
                <SelectContent>
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
                      <Label className="text-xs">E-mail do cliente</Label>
                      <Input type="email" value={it.clientEmail} onChange={(e) => updateItem(i, { clientEmail: e.target.value })} />
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Total deste fechamento</span>
                <span className="font-bold tabular-nums">
                  {items.length} venda(s) · €{formTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
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
                O fechamento do dia aceita registros até 23:59 (horário de Brasília).
              </p>
            </div>
          </form>
        </CardContent>
      </Card>


      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vendas de hoje</CardTitle>
            <CardDescription>
              {todaySales.length} venda(s) · €{todayTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {todaySales.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma venda registrada hoje ainda.</p>
            )}
            {todaySales.map((s) => (
              <div key={s.id} className="flex items-start gap-2 rounded-lg border border-border/50 bg-card/50 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{s.seller_name.split(" ")[0]}</span>
                    <span className="tabular-nums font-bold">€{Number(s.value_eur).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{s.product}</div>
                  <div className="truncate text-xs text-muted-foreground">{s.funnel}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vendas do mês</CardTitle>
            <CardDescription>
              {sales.length} venda(s) · €{monthTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {sales.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma venda registrada neste mês.</p>
            )}
            {sales.map((s) => {
              const mine = s.created_by === userId;
              return (
                <div key={s.id} className="rounded-lg border border-border/50 bg-card/50 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{s.seller_name.split(" ")[0]}</span>
                    <span className="tabular-nums font-bold">€{Number(s.value_eur).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{fmtDate(s.sale_date)} · {s.product}</div>
                  <div className="truncate text-xs text-muted-foreground">{s.funnel}</div>
                  {mine && (
                    <div className="mt-2 flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditing(s)}>
                        <Pencil className="mr-1 h-3 w-3" /> Editar
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeleting(s)}>
                        <Trash2 className="mr-1 h-3 w-3" /> Apagar
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>

    <EditDialog sale={editing} onClose={() => setEditing(null)} />

    <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apagar venda?</AlertDialogTitle>
          <AlertDialogDescription>
            {deleting && (
              <>Esta ação não pode ser desfeita. Venda de <b>{deleting.seller_name}</b> de €{Number(deleting.value_eur).toFixed(2)} em {fmtDate(deleting.sale_date)}.</>
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

function EditDialog({ sale, onClose }: { sale: SaleRow | null; onClose: () => void }) {
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
        client_email: form!.client_email ?? undefined,
        sale_date: form!.sale_date,
        notes: form!.notes ?? undefined,
      },
    }),
    onSuccess: () => {
      toast.success("Venda atualizada");
      qc.invalidateQueries({ queryKey: ["manual-sales"] });
      qc.invalidateQueries({ queryKey: ["clint-ranking"] });
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
                <SelectContent>
                  {SELLERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
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
                <SelectContent>
                  {PRODUCTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Funil</Label>
              <Select value={form.funnel} onValueChange={(v) => setForm({ ...form, funnel: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FUNNELS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
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
              <Label>E-mail do cliente</Label>
              <Input type="email" value={form.client_email ?? ""} onChange={(e) => setForm({ ...form, client_email: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observação</Label>
              <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
