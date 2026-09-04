import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchRoletaSpinsFn,
  upsertRoletaSpinFn,
  deleteRoletaSpinFn,
  generateRoletaSpinsFn,
  generateRoletaFromHotmartFn,
  type RoletaSpinRow,
} from "@/lib/commission.functions";
import type { CommissionPeriod } from "@/lib/commission";
import { eurBrlRate } from "@/lib/eur-rate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, RefreshCw, X } from "lucide-react";

const WHEELS = [
  { id: "mentoria", label: "Roleta Mentoria", url: "https://wheelofnames.com/4ef-m49" },
  {
    id: "accelerator",
    label: "Roleta Accelerator",
    url: "https://spinthewheel.io/wheels/sXC6cytBljW9JkKcKbR7cz0xJmU9MA%3D%3D",
  },
];

const SOURCES = [
  { id: "fechamento", label: "Fechamento" },
  { id: "hotmart", label: "Hotmart" },
  { id: "wise", label: "Wise / por fora" },
  { id: "manual", label: "Lançamento manual" },
];

const money = (v: number, c: "BRL" | "EUR" = "BRL") =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: c,
    maximumFractionDigits: 0,
  }).format(v || 0);

type FormState = {
  id?: string;
  seller_name: string;
  spin_date: string;
  wheel: string;
  source: string;
  client_name: string;
  product: string;
  prize_label: string;
  prize_value_eur: string;
  prize_value_brl: string;
  status: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  seller_name: "",
  spin_date: new Date().toISOString().slice(0, 10),
  wheel: "mentoria",
  source: "manual",
  client_name: "",
  product: "",
  prize_label: "",
  prize_value_eur: "",
  prize_value_brl: "",
  status: "pendente",
  notes: "",
});

export function RoletaSpinsCard({
  period,
  sellerNames,
}: {
  period: CommissionPeriod | null;
  sellerNames: string[];
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [filtroRoleta, setFiltroRoleta] = useState<string>("todas");

  const { data: allSpins = [] } = useQuery({
    queryKey: ["roleta_spins"],
    queryFn: async () => (await fetchRoletaSpinsFn()) as RoletaSpinRow[],
  });

  const spins = useMemo(() => {
    if (!period) return [];
    return allSpins
      .filter((s) => s.spin_date >= period.data_inicio && s.spin_date <= period.data_fim)
      .filter((s) => filtroRoleta === "todas" || s.wheel === filtroRoleta);
  }, [allSpins, period, filtroRoleta]);

  const totals = useMemo(() => {
    // Sem cotação, os prêmios em euro não entram no total em BRL — melhor um
    // total menor e visivelmente incompleto que um número inventado.
    const cot = eurBrlRate(period) ?? 0;
    let brl = 0;
    let pendentes = 0;
    const porRoleta: Record<string, number> = { mentoria: 0, accelerator: 0 };
    for (const s of spins) {
      brl += Number(s.prize_value_brl ?? 0) + Number(s.prize_value_eur ?? 0) * cot;
      if (s.status !== "girada") pendentes += 1;
      porRoleta[s.wheel] = (porRoleta[s.wheel] ?? 0) + 1;
    }
    return { brl, pendentes, porRoleta };
  }, [spins, period]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["roleta_spins"] });
  };

  const saveMut = useMutation({
    mutationFn: async (f: FormState) =>
      upsertRoletaSpinFn({
        data: {
          id: f.id,
          period_id: period?.id ?? null,
          seller_name: f.seller_name,
          spin_date: f.spin_date,
          wheel: f.wheel,
          source: f.source,
          client_name: f.client_name || null,
          product: f.product || null,
          prize_label: f.prize_label || null,
          prize_value_eur: Number(f.prize_value_eur) || 0,
          prize_value_brl: Number(f.prize_value_brl) || 0,
          status: f.status,
          notes: f.notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Giro salvo");
      setForm(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => deleteRoletaSpinFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Giro removido");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const genMut = useMutation({
    mutationFn: async () => {
      if (!period) throw new Error("Selecione um período");
      // Duas fontes: as vendas da Hotmart (regra oficial desde 04/09/2026) e os
      // lançamentos do fechamento que ainda não foram confirmados na Hotmart.
      // Ambas são idempotentes, então reprocessar não duplica.
      const [hotmart, fechamento] = await Promise.all([
        generateRoletaFromHotmartFn({
          data: { from: period.data_inicio, to: period.data_fim },
        }),
        generateRoletaSpinsFn({
          data: { period_id: period.id, from: period.data_inicio, to: period.data_fim },
        }),
      ]);
      return { hotmart, fechamento };
    },
    onSuccess: (r) => {
      const total = r.hotmart.criados + r.fechamento.created;
      const avisos: string[] = [];
      if (r.hotmart.semCotacao > 0)
        avisos.push(`${r.hotmart.semCotacao} venda(s) sem cotação no período`);
      if (r.hotmart.semVendedor > 0)
        avisos.push(`${r.hotmart.semVendedor} sem vendedor identificado`);
      const sufixo = avisos.length ? ` · ${avisos.join(" · ")}` : "";
      if (total > 0) toast.success(`${total} giro(s) gerado(s)${sufixo}`);
      else if (avisos.length) toast.warning(`Nenhum giro novo${sufixo}`);
      else toast.success("Nenhum giro novo");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (s: RoletaSpinRow) =>
    setForm({
      id: s.id,
      seller_name: s.seller_name,
      spin_date: s.spin_date,
      wheel: s.wheel,
      source: s.source,
      client_name: s.client_name ?? "",
      product: s.product ?? "",
      prize_label: s.prize_label ?? "",
      prize_value_eur: s.prize_value_eur ? String(s.prize_value_eur) : "",
      prize_value_brl: s.prize_value_brl ? String(s.prize_value_brl) : "",
      status: s.status,
      notes: s.notes ?? "",
    });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Roleta — 1 giro por venda</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Cada venda nova gera um giro. <strong>Renovação não gera giro.</strong> Mentoria e
              Accelerator são roletas diferentes, com prêmios diferentes. Vendas por fora (Wise,
              outro link) podem ser lançadas manualmente aqui.
            </p>
            <div className="flex gap-3 mt-2 text-xs">
              {WHEELS.map((w) => (
                <a
                  key={w.id}
                  href={w.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  Abrir {w.label}
                </a>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filtroRoleta} onValueChange={setFiltroRoleta}>
              <SelectTrigger className="w-[170px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as roletas</SelectItem>
                {WHEELS.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => genMut.mutate()}
              disabled={genMut.isPending || !period}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Gerar giros do fechamento
            </Button>
            <Button size="sm" onClick={() => setForm(emptyForm())}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Novo giro
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <Badge variant="secondary" className="text-xs">
            {spins.length} giro(s) no período
          </Badge>
          <Badge variant="outline" className="text-xs">
            Mentoria: {totals.porRoleta.mentoria ?? 0}
          </Badge>
          <Badge variant="outline" className="text-xs">
            Accelerator: {totals.porRoleta.accelerator ?? 0}
          </Badge>
          {totals.pendentes > 0 && (
            <Badge className="text-xs bg-warning/15 text-warning-fg border-warning/30">
              {totals.pendentes} sem prêmio lançado
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs">
            Prêmios: {money(totals.brl)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {form && (
          <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{form.id ? "Editar giro" : "Novo giro"}</p>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setForm(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Vendedor</Label>
                <Select
                  value={form.seller_name || undefined}
                  onValueChange={(v) => setForm({ ...form, seller_name: v })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {sellerNames.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data da venda</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={form.spin_date}
                  onChange={(e) => setForm({ ...form, spin_date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Roleta</Label>
                <Select value={form.wheel} onValueChange={(v) => setForm({ ...form, wheel: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WHEELS.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Origem da venda</Label>
                <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cliente</Label>
                <Input
                  className="h-9"
                  value={form.client_name}
                  onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Produto</Label>
                <Input
                  className="h-9"
                  value={form.product}
                  onChange={(e) => setForm({ ...form, product: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Prêmio sorteado</Label>
                <Input
                  className="h-9"
                  placeholder="ex.: 50 EUR / Nada"
                  value={form.prize_label}
                  onChange={(e) => setForm({ ...form, prize_label: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Situação</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente (ainda não girou)</SelectItem>
                    <SelectItem value="girada">Girada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor do prêmio (EUR)</Label>
                <Input
                  type="number"
                  className="h-9"
                  value={form.prize_value_eur}
                  onChange={(e) => setForm({ ...form, prize_value_eur: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor do prêmio (BRL)</Label>
                <Input
                  type="number"
                  className="h-9"
                  value={form.prize_value_brl}
                  onChange={(e) => setForm({ ...form, prize_value_brl: e.target.value })}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Observações</Label>
                <Input
                  className="h-9"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setForm(null)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                Salvar giro
              </Button>
            </div>
          </div>
        )}

        <div className="max-h-[460px] overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 px-3">Data</th>
                <th className="py-2 px-3">Vendedor</th>
                <th className="py-2 px-3">Roleta</th>
                <th className="py-2 px-3">Origem</th>
                <th className="py-2 px-3">Cliente / produto</th>
                <th className="py-2 px-3">Prêmio</th>
                <th className="py-2 px-3 text-right">Valor</th>
                <th className="py-2 px-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {spins.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum giro no período. Use “Gerar giros do fechamento” ou lance manualmente.
                  </td>
                </tr>
              )}
              {spins.map((s) => (
                <tr key={s.id} className="border-b border-border/40 last:border-0">
                  <td className="py-1.5 px-3 whitespace-nowrap tabular-nums">
                    {new Date(`${s.spin_date}T12:00:00`).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="py-1.5 px-3 font-medium">{s.seller_name}</td>
                  <td className="py-1.5 px-3">
                    <Badge
                      variant="outline"
                      className={
                        s.wheel === "accelerator"
                          ? "text-xs border-violet-500/40 text-violet-600 dark:text-violet-400"
                          : "text-xs border-sky-500/40 text-sky-600 dark:text-sky-400"
                      }
                    >
                      {s.wheel === "accelerator" ? "Accelerator" : "Mentoria"}
                    </Badge>
                  </td>
                  <td className="py-1.5 px-3 text-xs text-muted-foreground">
                    {SOURCES.find((x) => x.id === s.source)?.label ?? s.source}
                  </td>
                  <td className="py-1.5 px-3">
                    <div>{s.client_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{s.product ?? ""}</div>
                  </td>
                  <td className="py-1.5 px-3">
                    {s.status === "girada" ? (
                      (s.prize_label ?? "—")
                    ) : (
                      <span className="text-xs text-warning-fg">pendente</span>
                    )}
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums">
                    {Number(s.prize_value_eur) > 0 && (
                      <div>{money(Number(s.prize_value_eur), "EUR")}</div>
                    )}
                    {Number(s.prize_value_brl) > 0 && <div>{money(Number(s.prize_value_brl))}</div>}
                    {!Number(s.prize_value_eur) && !Number(s.prize_value_brl) && "—"}
                  </td>
                  <td className="py-1.5 px-3 text-right whitespace-nowrap">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => startEdit(s)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => {
                        if (confirm("Excluir este giro?")) delMut.mutate(s.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
