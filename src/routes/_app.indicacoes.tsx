import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus, Copy, MessageSquare, Trash2, TrendingUp, Users, CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  listReferralsFn, createReferralFn, updateReferralStatusFn,
  deleteReferralFn, buildReferralMessage, buildReferralMessageNaoFechou,
  REFERRAL_STATUSES, type ReferralStatus,
} from "@/lib/referrals.functions";
import { SELLERS, PRODUCTS } from "@/lib/manual-sales.functions";

export const Route = createFileRoute("/_app/indicacoes")({
  component: ReferralsPage,
});

const STATUS_LABEL: Record<ReferralStatus, string> = {
  novo: "Novo",
  contactado: "Contactado",
  em_negociacao: "Em negociação",
  convertido: "Convertido",
  perdido: "Perdido",
};

const STATUS_COLOR: Record<ReferralStatus, string> = {
  novo: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  contactado: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  em_negociacao: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  convertido: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  perdido: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
};

function fmtEur(n: number | null | undefined) {
  if (n == null) return "—";
  return "€" + n.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function ReferralsPage() {
  const qc = useQueryClient();
  const { data: referrals = [] } = useQuery({
    queryKey: ["referrals"],
    queryFn: () => listReferralsFn(),
  });

  const kpis = useMemo(() => {
    const total = referrals.length;
    const convertidos = referrals.filter((r) => r.status === "convertido").length;
    const receita = referrals
      .filter((r) => r.status === "convertido")
      .reduce((s, r) => s + Number(r.converted_value_eur ?? 0), 0);
    const emAndamento = referrals.filter((r) =>
      ["novo", "contactado", "em_negociacao"].includes(r.status),
    ).length;
    const taxaConversao = total > 0 ? (convertidos / total) * 100 : 0;

    const bySeller = new Map<string, { total: number; convertidos: number; receita: number }>();
    for (const r of referrals) {
      const cur = bySeller.get(r.seller_name) ?? { total: 0, convertidos: 0, receita: 0 };
      cur.total += 1;
      if (r.status === "convertido") {
        cur.convertidos += 1;
        cur.receita += Number(r.converted_value_eur ?? 0);
      }
      bySeller.set(r.seller_name, cur);
    }
    const ranking = Array.from(bySeller.entries())
      .map(([seller, v]) => ({ seller, ...v }))
      .sort((a, b) => b.total - a.total);

    return { total, convertidos, receita, emAndamento, taxaConversao, ranking };
  }, [referrals]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Programa de Indicações</h1>
          <p className="text-sm text-muted-foreground">
            Novo funil: cada cliente fechado pode gerar 3 a 5 novos leads qualificados.
          </p>
        </div>
        <NovaIndicacaoDialog onCreated={() => qc.invalidateQueries({ queryKey: ["referrals"] })} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard icon={Users} label="Indicações totais" value={String(kpis.total)} />
        <KpiCard icon={Clock} label="Em andamento" value={String(kpis.emAndamento)} />
        <KpiCard icon={CheckCircle2} label="Convertidas" value={`${kpis.convertidos} (${kpis.taxaConversao.toFixed(0)}%)`} />
        <KpiCard icon={TrendingUp} label="Receita gerada" value={fmtEur(kpis.receita)} />
      </div>

      <Tabs defaultValue="lista">
        <TabsList>
          <TabsTrigger value="lista">Indicações</TabsTrigger>
          <TabsTrigger value="ranking">Ranking por vendedor</TabsTrigger>
          <TabsTrigger value="mensagem">Mensagem padrão</TabsTrigger>
          <TabsTrigger value="como">Como funciona</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="mt-6">
          <ReferralsTable
            referrals={referrals}
            onChange={() => qc.invalidateQueries({ queryKey: ["referrals"] })}
          />
        </TabsContent>

        <TabsContent value="ranking" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Ranking</CardTitle></CardHeader>
            <CardContent>
              {kpis.ranking.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem indicações ainda.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Indicações</TableHead>
                      <TableHead className="text-right">Convertidas</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kpis.ranking.map((r) => (
                      <TableRow key={r.seller}>
                        <TableCell className="font-medium">{r.seller}</TableCell>
                        <TableCell className="text-right">{r.total}</TableCell>
                        <TableCell className="text-right">{r.convertidos}</TableCell>
                        <TableCell className="text-right">{fmtEur(r.receita)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mensagem" className="mt-6">
          <MensagemPadraoCard />
        </TabsContent>

        <TabsContent value="como" className="mt-6">
          <ComoFuncionaCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NovaIndicacaoDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    seller_name: "",
    client_name: "",
    client_email: "",
    referred_name: "",
    referred_phone: "",
    referred_email: "",
    product_interest: "",
    notes: "",
  });

  const create = useMutation({
    mutationFn: (payload: typeof form) => createReferralFn({ data: payload as any }),
    onSuccess: () => {
      toast.success("Indicação registrada");
      setForm({
        seller_name: form.seller_name,
        client_name: "",
        client_email: "",
        referred_name: "",
        referred_phone: "",
        referred_email: "",
        product_interest: "",
        notes: "",
      });
      onCreated();
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  function submit() {
    if (!form.seller_name || !form.client_name || !form.referred_name) {
      toast.error("Vendedor, cliente e indicado são obrigatórios");
      return;
    }
    create.mutate(form);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><UserPlus className="mr-2 h-4 w-4" />Nova indicação</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Registrar indicação</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Vendedor *</Label>
            <Select value={form.seller_name} onValueChange={(v) => setForm({ ...form, seller_name: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {SELLERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Cliente que indicou *</Label>
            <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>E-mail do cliente</Label>
            <Input value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Nome do indicado *</Label>
              <Input value={form.referred_name} onChange={(e) => setForm({ ...form, referred_name: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>WhatsApp</Label>
              <Input value={form.referred_phone} onChange={(e) => setForm({ ...form, referred_phone: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>E-mail do indicado</Label>
            <Input value={form.referred_email} onChange={(e) => setForm({ ...form, referred_email: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Produto de interesse</Label>
            <Select value={form.product_interest} onValueChange={(v) => setForm({ ...form, product_interest: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
              <SelectContent>
                {PRODUCTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Contexto / notas</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ex.: sócio do cliente, já viu conteúdo nosso, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReferralsTable({
  referrals, onChange,
}: { referrals: any[]; onChange: () => void }) {
  const [statusFilter, setStatusFilter] = useState<string>("todos");

  const filtered = referrals.filter((r) =>
    statusFilter === "todos" ? true : r.status === statusFilter,
  );

  const updateStatus = useMutation({
    mutationFn: (v: { id: string; status: ReferralStatus; converted_value_eur?: number }) =>
      updateReferralStatusFn({ data: v }),
    onSuccess: () => { toast.success("Status atualizado"); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteReferralFn({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Indicações</CardTitle>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {REFERRAL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma indicação {statusFilter !== "todos" ? "nesse status" : "registrada"} ainda.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Indicado</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Indicado por</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">{fmtDate(r.created_at)}</TableCell>
                  <TableCell className="font-medium">{r.referred_name}</TableCell>
                  <TableCell className="text-xs">
                    {r.referred_phone && <div>{r.referred_phone}</div>}
                    {r.referred_email && <div className="text-muted-foreground">{r.referred_email}</div>}
                  </TableCell>
                  <TableCell className="text-xs">{r.client_name}</TableCell>
                  <TableCell className="text-xs">{r.seller_name}</TableCell>
                  <TableCell className="text-xs">{r.product_interest ?? "—"}</TableCell>
                  <TableCell>
                    <Select
                      value={r.status}
                      onValueChange={(v) => {
                        if (v === "convertido") {
                          const raw = window.prompt("Valor convertido em € (opcional):", "");
                          const val = raw ? Number(raw.replace(",", ".")) : undefined;
                          updateStatus.mutate({ id: r.id, status: v as ReferralStatus, converted_value_eur: val });
                        } else {
                          updateStatus.mutate({ id: r.id, status: v as ReferralStatus });
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 w-36">
                        <Badge variant="secondary" className={STATUS_COLOR[r.status as ReferralStatus]}>
                          {STATUS_LABEL[r.status as ReferralStatus]}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {REFERRAL_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right text-xs">{fmtEur(r.converted_value_eur)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => { if (confirm("Remover indicação?")) del.mutate(r.id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function MensagemPadraoCard() {
  const [clientName, setClientName] = useState("");
  const [sellerName, setSellerName] = useState("");
  const msg = buildReferralMessage({
    clientName: clientName || "[nome do cliente]",
    sellerName: sellerName || "[seu nome]",
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Personalizar</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-1.5">
            <Label>Nome do cliente</Label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Ex.: Marina" />
          </div>
          <div className="grid gap-1.5">
            <Label>Seu nome (vendedor)</Label>
            <Select value={sellerName} onValueChange={setSellerName}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {SELLERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Melhor momento para enviar: nas primeiras 24–48h após o fechamento, quando a energia do cliente ainda está alta.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Mensagem
          </CardTitle>
          <Button
            variant="outline" size="sm"
            onClick={() => { navigator.clipboard.writeText(msg); toast.success("Copiado"); }}
          >
            <Copy className="mr-2 h-3 w-3" /> Copiar
          </Button>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm">{msg}</pre>
        </CardContent>
      </Card>
    </div>
  );
}

function ComoFuncionaCard() {
  return (
    <Card>
      <CardHeader><CardTitle>Como funciona o programa</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <p className="font-semibold">1. Após cada venda fechada</p>
          <p className="text-muted-foreground">
            O vendedor envia a mensagem padrão pelo WhatsApp pedindo 3 a 5 nomes ao cliente novo.
          </p>
        </div>
        <div>
          <p className="font-semibold">2. Cadastrar aqui</p>
          <p className="text-muted-foreground">
            Cada nome recebido vira uma indicação em "Nova indicação" — com contato, produto de interesse e contexto.
          </p>
        </div>
        <div>
          <p className="font-semibold">3. Novo funil (não obrigatório)</p>
          <p className="text-muted-foreground">
            As indicações formam um funil próprio: Novo → Contactado → Em negociação → Convertido / Perdido.
            Assim medimos a taxa real de conversão da fonte "indicação".
          </p>
        </div>
        <div>
          <p className="font-semibold">4. Recompensa</p>
          <p className="text-muted-foreground">
            A definir. Sugestões para você escolher depois: (a) % em cash sobre a venda convertida,
            (b) desconto na próxima renovação, (c) bônus não-monetário (mentoria extra, acesso VIP).
          </p>
        </div>
        <div>
          <p className="font-semibold">5. Métricas acompanhadas</p>
          <p className="text-muted-foreground">
            Nº de indicações por vendedor, taxa de conversão do funil, receita gerada e ranking mensal.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
