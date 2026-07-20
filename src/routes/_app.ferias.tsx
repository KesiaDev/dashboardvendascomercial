import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Plane, Plus, Trash2, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isAdminUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { listVacationsFn, upsertVacationFn, deleteVacationFn, type Vacation } from "@/lib/vacations.functions";

export const Route = createFileRoute("/_app/ferias")({
  component: FeriasPage,
});

const TYPE_LABEL: Record<string, string> = {
  ferias: "Férias",
  folga: "Folga",
  licenca: "Licença",
  outro: "Outro",
};
const TYPE_COLORS: Record<string, string> = {
  ferias: "bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/40",
  folga: "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40",
  licenca: "bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/40",
  outro: "bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-500/40",
};
const STATUS_LABEL: Record<string, string> = {
  aprovado: "Aprovado",
  pendente: "Pendente",
  cancelado: "Cancelado",
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseYmd(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function fmtBR(s: string) {
  return parseYmd(s).toLocaleDateString("pt-BR");
}
function daysBetween(a: string, b: string) {
  const diff = (parseYmd(b).getTime() - parseYmd(a).getTime()) / 86400000;
  return Math.round(diff) + 1;
}

function FeriasPage() {
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
  }, []);
  const admin = isAdminUser(user);

  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const rangeStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const rangeEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

  const list = useServerFn(listVacationsFn);
  const upsert = useServerFn(upsertVacationFn);
  const del = useServerFn(deleteVacationFn);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["vacations", ymd(rangeStart), ymd(rangeEnd)],
    queryFn: () => list({ data: { from: ymd(rangeStart), to: ymd(rangeEnd) } }),
  });
  const items: Vacation[] = data?.items ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Vacation> | null>(null);

  const upsertMut = useMutation({
    mutationFn: (v: Partial<Vacation>) => upsert({ data: v }),
    onSuccess: () => {
      toast.success("Salvo");
      setDialogOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["vacations"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["vacations"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  // Build calendar grid
  const grid = useMemo(() => {
    const first = new Date(rangeStart);
    const startWeekday = first.getDay(); // 0=Sun
    const daysInMonth = rangeEnd.getDate();
    const cells: { date: Date | null; iso: string }[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ date: null, iso: "" });
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      cells.push({ date: dt, iso: ymd(dt) });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, iso: "" });
    return cells;
  }, [cursor, rangeStart, rangeEnd]);

  function itemsOnDay(iso: string) {
    if (!iso) return [];
    return items.filter((v) => iso >= v.start_date && iso <= v.end_date);
  }

  function openNew() {
    const today = ymd(new Date());
    setEditing({
      seller_email: "",
      seller_name: "",
      start_date: today,
      end_date: today,
      vacation_type: "ferias",
      status: "aprovado",
      notes: "",
    });
    setDialogOpen(true);
  }
  function openEdit(v: Vacation) {
    setEditing({ ...v });
    setDialogOpen(true);
  }

  const todayIso = ymd(new Date());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Plane className="h-6 w-6" /> Férias da Equipe
          </h1>
          <p className="text-sm text-muted-foreground">
            Organize o calendário de férias, folgas e licenças da equipe comercial.
          </p>
        </div>
        {admin && (
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Nova ausência
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="capitalize text-base">{monthLabel}</CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => { const n = new Date(); setCursor(new Date(n.getFullYear(), n.getMonth(), 1)); }}>
              Hoje
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-xs">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <div key={d} className="text-center font-semibold text-muted-foreground py-1">{d}</div>
            ))}
            {grid.map((cell, i) => {
              const dayItems = cell.iso ? itemsOnDay(cell.iso) : [];
              const isToday = cell.iso === todayIso;
              return (
                <div
                  key={i}
                  className={
                    "min-h-[90px] rounded-md border p-1 " +
                    (cell.date ? "bg-card" : "bg-muted/30 border-transparent") +
                    (isToday ? " ring-2 ring-primary" : "")
                  }
                >
                  {cell.date && (
                    <>
                      <div className="text-[10px] font-semibold text-muted-foreground mb-1">
                        {cell.date.getDate()}
                      </div>
                      <div className="space-y-0.5">
                        {dayItems.slice(0, 3).map((v) => (
                          <button
                            key={v.id}
                            onClick={() => admin && openEdit(v)}
                            className={
                              "w-full truncate text-left text-[10px] px-1 py-0.5 rounded border " +
                              (TYPE_COLORS[v.vacation_type] ?? TYPE_COLORS.outro)
                            }
                            title={`${v.seller_name ?? v.seller_email} — ${TYPE_LABEL[v.vacation_type] ?? v.vacation_type}`}
                          >
                            {v.seller_name ?? v.seller_email}
                          </button>
                        ))}
                        {dayItems.length > 3 && (
                          <div className="text-[10px] text-muted-foreground px-1">+{dayItems.length - 3}</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ausências no mês ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma ausência registrada para este período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 pr-2">Vendedor</th>
                    <th className="py-2 pr-2">Tipo</th>
                    <th className="py-2 pr-2">Início</th>
                    <th className="py-2 pr-2">Fim</th>
                    <th className="py-2 pr-2">Dias</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2 pr-2">Observações</th>
                    {admin && <th className="py-2 pr-2 text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((v) => (
                    <tr key={v.id} className="border-b last:border-0">
                      <td className="py-2 pr-2">
                        <div className="font-medium">{v.seller_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{v.seller_email}</div>
                      </td>
                      <td className="py-2 pr-2">
                        <span className={"text-xs px-2 py-0.5 rounded border " + (TYPE_COLORS[v.vacation_type] ?? TYPE_COLORS.outro)}>
                          {TYPE_LABEL[v.vacation_type] ?? v.vacation_type}
                        </span>
                      </td>
                      <td className="py-2 pr-2">{fmtBR(v.start_date)}</td>
                      <td className="py-2 pr-2">{fmtBR(v.end_date)}</td>
                      <td className="py-2 pr-2">{daysBetween(v.start_date, v.end_date)}</td>
                      <td className="py-2 pr-2">
                        <Badge variant={v.status === "aprovado" ? "default" : v.status === "cancelado" ? "destructive" : "secondary"}>
                          {STATUS_LABEL[v.status] ?? v.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-2 text-xs text-muted-foreground max-w-[220px] truncate" title={v.notes ?? ""}>
                        {v.notes ?? "—"}
                      </td>
                      {admin && (
                        <td className="py-2 pr-2 text-right whitespace-nowrap">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(v)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Remover esta ausência?")) delMut.mutate(v.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar ausência" : "Nova ausência"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nome do vendedor</Label>
                  <Input
                    value={editing.seller_name ?? ""}
                    onChange={(e) => setEditing({ ...editing, seller_name: e.target.value })}
                    placeholder="Ex: Gisele Pimentel"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={editing.seller_email ?? ""}
                    onChange={(e) => setEditing({ ...editing, seller_email: e.target.value })}
                    placeholder="vendedor@empresa.com"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Início</Label>
                  <Input
                    type="date"
                    value={editing.start_date ?? ""}
                    onChange={(e) => setEditing({ ...editing, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Fim</Label>
                  <Input
                    type="date"
                    value={editing.end_date ?? ""}
                    onChange={(e) => setEditing({ ...editing, end_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select
                    value={editing.vacation_type ?? "ferias"}
                    onValueChange={(v) => setEditing({ ...editing, vacation_type: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ferias">Férias</SelectItem>
                      <SelectItem value="folga">Folga</SelectItem>
                      <SelectItem value="licenca">Licença</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={editing.status ?? "aprovado"}
                    onValueChange={(v) => setEditing({ ...editing, status: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aprovado">Aprovado</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea
                  rows={3}
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  placeholder="Ex: cobertura pela Ana durante o período"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            {editing?.id && (
              <Button
                variant="outline"
                className="mr-auto"
                onClick={() => {
                  if (confirm("Remover esta ausência?")) {
                    delMut.mutate(editing.id as string);
                    setDialogOpen(false);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Remover
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => editing && upsertMut.mutate(editing)}
              disabled={upsertMut.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
