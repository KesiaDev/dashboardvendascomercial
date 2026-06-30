import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { createManualSale, listManualSales, PRODUCTS, FUNNELS, SELLERS } from "@/lib/manual-sales.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, LogIn, LogOut, Plus } from "lucide-react";

export const Route = createFileRoute("/_app/fechamento")({ component: FechamentoPage });

function todayBR() {
  const nowBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return nowBR.toISOString().slice(0, 10);
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

function FechamentoForm({ session }: { session: any }) {
  const email = session?.user?.email ?? "";
  const qc = useQueryClient();

  const [seller, setSeller] = useState<string>("");
  const [product, setProduct] = useState<string>("");
  const [funnel, setFunnel] = useState<string>("");
  const [value, setValue] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [saleDate, setSaleDate] = useState(todayBR());
  const [notes, setNotes] = useState("");

  const today = todayBR();

  const { data: sales = [] } = useQuery({
    queryKey: ["manual-sales", today.slice(0, 7)],
    queryFn: () => listManualSales({ data: { from: today.slice(0, 7) + "-01" } }),
  });

  const mutation = useMutation({
    mutationFn: () =>
      createManualSale({
        data: {
          seller_name: seller,
          product,
          funnel,
          value_eur: Number(value.replace(",", ".")),
          client_name: clientName || undefined,
          client_email: clientEmail || undefined,
          sale_date: saleDate,
          notes: notes || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Venda registrada! 🎉");
      setProduct(""); setFunnel(""); setValue(""); setClientName(""); setClientEmail(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["manual-sales"] });
      qc.invalidateQueries({ queryKey: ["clint-ranking"] });
    },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  const todaySales = sales.filter((s) => s.sale_date === today);
  const todayTotal = todaySales.reduce((acc, s) => acc + Number(s.value_eur), 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
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
              if (!seller || !product || !funnel || !value) {
                toast.error("Preencha vendedor, produto, funil e valor");
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
              <Label>Produto *</Label>
              <Select value={product} onValueChange={setProduct}>
                <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                <SelectContent>
                  {PRODUCTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
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
            <div className="space-y-1.5">
              <Label>Valor (EUR) *</Label>
              <Input type="text" inputMode="decimal" placeholder="ex: 1497.00" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Nome do cliente</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>E-mail do cliente</Label>
              <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observação</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={mutation.isPending} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                {mutation.isPending ? "Salvando..." : "Registrar venda"}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                O fechamento do dia aceita registros até 23:59 (horário de Brasília).
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

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
    </div>
  );
}
