import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { isAdminUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Target, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  getOkrsFn,
  saveObjectiveFn,
  deleteObjectiveFn,
  saveKeyResultFn,
  deleteKeyResultFn,
  saveInitiativeFn,
  deleteInitiativeFn,
  type OkrObjective,
  type OkrKeyResult,
  type OkrMetric,
} from "@/lib/okr.functions";

const METRIC_LABEL: Record<string, string> = {
  none: "Manual (eu atualizo)",
  vendas_fe: "Vendas Front-End (auto)",
  vendas_ht: "Vendas High Ticket (auto)",
  vendas_mas: "Vendas MAS (auto)",
  renovacoes: "Renovações MGT (auto)",
  faturamento: "Faturamento do trimestre (auto)",
};

const STATUS_LABEL: Record<string, string> = {
  todo: "A fazer",
  doing: "Em andamento",
  done: "Concluída",
};
const STATUS_CLASS: Record<string, string> = {
  todo: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  doing: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
};

function currentQuarter() {
  const d = new Date();
  return { ano: d.getFullYear(), trimestre: Math.floor(d.getMonth() / 3) + 1 };
}

export function OkrBoard() {
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
  }, []);
  const admin = isAdminUser(user);

  const cq = currentQuarter();
  const [ano, setAno] = useState(cq.ano);
  const [trimestre, setTrimestre] = useState(cq.trimestre);

  const getOkrs = useServerFn(getOkrsFn);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["okrs", ano, trimestre],
    queryFn: () => getOkrs({ data: { ano, trimestre } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["okrs"] });

  const saveObj = useServerFn(saveObjectiveFn);
  const delObj = useServerFn(deleteObjectiveFn);
  const objMut = useMutation({
    mutationFn: (v: any) => saveObj({ data: v }),
    onSuccess: () => {
      invalidate();
      toast.success("Objetivo salvo");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const objDel = useMutation({
    mutationFn: (id: string) => delObj({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Objetivo removido");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [objDialog, setObjDialog] = useState<null | Partial<OkrObjective>>(null);

  const objectives = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">OKRs do trimestre</h2>
          <p className="text-sm text-muted-foreground">
            Objetivo → Key Results → Iniciativas. KRs ligados a uma métrica atualizam sozinhos com os
            fechamentos do trimestre.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">Ano</Label>
            <Input
              type="number"
              value={ano}
              onChange={(e) => setAno(Number(e.target.value) || cq.ano)}
              className="h-9 w-24"
            />
          </div>
          <div>
            <Label className="text-xs">Trimestre</Label>
            <Select value={String(trimestre)} onValueChange={(v) => setTrimestre(Number(v))}>
              <SelectTrigger className="h-9 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((t) => (
                  <SelectItem key={t} value={String(t)}>
                    Q{t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {admin && (
            <Button onClick={() => setObjDialog({ ano, trimestre, titulo: "" })}>
              <Plus className="mr-1 h-4 w-4" />
              Objetivo
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : objectives.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum objetivo cadastrado para Q{trimestre}/{ano}.
          </CardContent>
        </Card>
      ) : (
        objectives.map((o) => (
          <ObjectiveCard
            key={o.id}
            objective={o}
            admin={admin}
            onEdit={() => setObjDialog(o)}
            onDelete={() => objDel.mutate(o.id)}
            onChanged={invalidate}
          />
        ))
      )}

      {objDialog && (
        <ObjectiveDialog
          initial={objDialog}
          onClose={() => setObjDialog(null)}
          onSave={(v) => {
            objMut.mutate(v);
            setObjDialog(null);
          }}
        />
      )}
    </div>
  );
}

function ObjectiveCard({
  objective,
  admin,
  onEdit,
  onDelete,
  onChanged,
}: {
  objective: OkrObjective;
  admin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const saveKr = useServerFn(saveKeyResultFn);
  const delKr = useServerFn(deleteKeyResultFn);
  const [krDialog, setKrDialog] = useState<null | Partial<OkrKeyResult>>(null);

  const krMut = useMutation({
    mutationFn: (v: any) => saveKr({ data: v }),
    onSuccess: () => {
      onChanged();
      toast.success("KR salvo");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const krDel = useMutation({
    mutationFn: (id: string) => delKr({ data: { id } }),
    onSuccess: () => {
      onChanged();
      toast.success("KR removido");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const overall = useMemo(() => {
    const list = objective.keyResults.filter((k) => k.meta && k.meta > 0);
    if (list.length === 0) return 0;
    const sum = list.reduce(
      (acc, k) => acc + Math.min(100, ((k.realizado ?? 0) / (k.meta || 1)) * 100),
      0,
    );
    return Math.round(sum / list.length);
  }, [objective.keyResults]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4" />
              {objective.titulo}
            </CardTitle>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>Q{objective.trimestre}/{objective.ano}</span>
              {objective.lider && <span>• Líder: {objective.lider}</span>}
              {objective.equipes && <span>• Equipe: {objective.equipes}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-40">
              <Progress value={overall} className="h-2" />
              <div className="mt-1 text-right text-xs text-muted-foreground">{overall}% dos KRs</div>
            </div>
            {admin && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <KpiBox label="Vendas FE" value={objective.kpis.fe} />
          <KpiBox label="Vendas HT" value={objective.kpis.ht} />
          <KpiBox label="Vendas MAS" value={objective.kpis.mas} />
          <KpiBox label="Renovações MGT" value={objective.kpis.renov} />
          <KpiBox
            label="Faturamento"
            value={objective.kpis.faturamento.toLocaleString("pt-BR", {
              maximumFractionDigits: 0,
            })}
          />
        </div>

        <div className="space-y-2">
          {objective.keyResults.map((kr, idx) => (
            <KeyResultRow
              key={kr.id}
              index={idx + 1}
              kr={kr}
              admin={admin}
              onEdit={() => setKrDialog(kr)}
              onDelete={() => krDel.mutate(kr.id)}
              onChanged={onChanged}
            />
          ))}
          {admin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setKrDialog({ objective_id: objective.id, titulo: "" })}
            >
              <Plus className="mr-1 h-4 w-4" />
              Key Result
            </Button>
          )}
        </div>
      </CardContent>

      {krDialog && (
        <KeyResultDialog
          initial={{ ...krDialog, objective_id: objective.id }}
          onClose={() => setKrDialog(null)}
          onSave={(v) => {
            krMut.mutate(v);
            setKrDialog(null);
          }}
        />
      )}
    </Card>
  );
}

function KpiBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function KeyResultRow({
  index,
  kr,
  admin,
  onEdit,
  onDelete,
  onChanged,
}: {
  index: number;
  kr: OkrKeyResult;
  admin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const saveInit = useServerFn(saveInitiativeFn);
  const delInit = useServerFn(deleteInitiativeFn);
  const [initDialog, setInitDialog] = useState<null | any>(null);

  const initMut = useMutation({
    mutationFn: (v: any) => saveInit({ data: v }),
    onSuccess: () => {
      onChanged();
      toast.success("Iniciativa salva");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const initDel = useMutation({
    mutationFn: (id: string) => delInit({ data: { id } }),
    onSuccess: () => onChanged(),
    onError: (e: any) => toast.error(e.message),
  });

  const pct = kr.meta && kr.meta > 0 ? Math.min(100, Math.round(((kr.realizado ?? 0) / kr.meta) * 100)) : null;
  const doneCount = kr.iniciativas.filter((i) => i.status === "done").length;

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/40"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <Badge variant="secondary" className="shrink-0">KR {index}</Badge>
        <span className="flex-1 text-sm font-medium">{kr.titulo}</span>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {doneCount}/{kr.iniciativas.length} iniciativas
        </span>
        {kr.meta != null && (
          <span className="shrink-0 text-sm">
            <span className="font-semibold">
              {(kr.realizado ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
            </span>
            <span className="text-muted-foreground">
              {" "}
              / {kr.meta.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} {kr.unidade ?? ""}
            </span>
          </span>
        )}
        {pct != null && (
          <span className="w-24 shrink-0">
            <Progress value={pct} className="h-2" />
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t px-3 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Fonte: {METRIC_LABEL[kr.metrica ?? "none"]}</span>
            {admin && (
              <>
                <Button variant="ghost" size="sm" className="h-7" onClick={onEdit}>
                  <Pencil className="mr-1 h-3 w-3" /> Editar KR
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={onDelete}>
                  <Trash2 className="mr-1 h-3 w-3" /> Excluir
                </Button>
              </>
            )}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Iniciativa</TableHead>
                <TableHead className="w-40">Responsável</TableHead>
                <TableHead className="w-36">Status</TableHead>
                {admin && <TableHead className="w-24 text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {kr.iniciativas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={admin ? 5 : 4} className="text-sm text-muted-foreground">
                    Nenhuma iniciativa.
                  </TableCell>
                </TableRow>
              ) : (
                kr.iniciativas.map((i, n) => (
                  <TableRow key={i.id}>
                    <TableCell className="text-muted-foreground">{n + 1}</TableCell>
                    <TableCell className="font-medium">{i.titulo}</TableCell>
                    <TableCell>{i.responsavel ?? "—"}</TableCell>
                    <TableCell>
                      {admin ? (
                        <Select
                          value={i.status}
                          onValueChange={(v) =>
                            initMut.mutate({
                              id: i.id,
                              key_result_id: kr.id,
                              titulo: i.titulo,
                              responsavel: i.responsavel,
                              status: v,
                              prazo: i.prazo,
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_LABEL).map(([k, v]) => (
                              <SelectItem key={k} value={k}>
                                {v}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className={STATUS_CLASS[i.status]}>
                          {STATUS_LABEL[i.status] ?? i.status}
                        </Badge>
                      )}
                    </TableCell>
                    {admin && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setInitDialog(i)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => initDel.mutate(i.id)}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {admin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInitDialog({ key_result_id: kr.id, titulo: "", status: "todo" })}
            >
              <Plus className="mr-1 h-4 w-4" />
              Iniciativa
            </Button>
          )}
        </div>
      )}

      {initDialog && (
        <InitiativeDialog
          initial={{ ...initDialog, key_result_id: kr.id }}
          onClose={() => setInitDialog(null)}
          onSave={(v) => {
            initMut.mutate(v);
            setInitDialog(null);
          }}
        />
      )}
    </div>
  );
}

function ObjectiveDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: Partial<OkrObjective>;
  onClose: () => void;
  onSave: (v: any) => void;
}) {
  const [titulo, setTitulo] = useState(initial.titulo ?? "");
  const [lider, setLider] = useState(initial.lider ?? "");
  const [equipes, setEquipes] = useState(initial.equipes ?? "");
  const [ano, setAno] = useState(initial.ano ?? new Date().getFullYear());
  const [trimestre, setTrimestre] = useState(initial.trimestre ?? 1);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial.id ? "Editar objetivo" : "Novo objetivo"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Objetivo do trimestre</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="309 vendas FE / 143 HT / 85 MAS" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Líder</Label>
              <Input value={lider} onChange={(e) => setLider(e.target.value)} />
            </div>
            <div>
              <Label>Equipe(s)</Label>
              <Input value={equipes} onChange={(e) => setEquipes(e.target.value)} />
            </div>
            <div>
              <Label>Ano</Label>
              <Input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} />
            </div>
            <div>
              <Label>Trimestre</Label>
              <Select value={String(trimestre)} onValueChange={(v) => setTrimestre(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map((t) => (
                    <SelectItem key={t} value={String(t)}>
                      Q{t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!titulo.trim()}
            onClick={() => onSave({ id: initial.id, titulo, lider, equipes, ano, trimestre })}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KeyResultDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: Partial<OkrKeyResult> & { objective_id: string };
  onClose: () => void;
  onSave: (v: any) => void;
}) {
  const [titulo, setTitulo] = useState(initial.titulo ?? "");
  const [meta, setMeta] = useState(initial.meta != null ? String(initial.meta) : "");
  const [unidade, setUnidade] = useState(initial.unidade ?? "");
  const [metrica, setMetrica] = useState<string>(initial.metrica ?? "none");
  const [progresso, setProgresso] = useState(
    initial.progresso_manual != null ? String(initial.progresso_manual) : "",
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial.id ? "Editar Key Result" : "Novo Key Result"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Key Result</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Dobrar a conversão de FE" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Meta (número)</Label>
              <Input type="number" value={meta} onChange={(e) => setMeta(e.target.value)} />
            </div>
            <div>
              <Label>Unidade</Label>
              <Input value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="vendas, %, leads…" />
            </div>
          </div>
          <div>
            <Label>Como medir</Label>
            <Select value={metrica} onValueChange={setMetrica}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(METRIC_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {metrica === "none" && (
            <div>
              <Label>Realizado (manual)</Label>
              <Input type="number" value={progresso} onChange={(e) => setProgresso(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!titulo.trim()}
            onClick={() =>
              onSave({
                id: initial.id,
                objective_id: initial.objective_id,
                titulo,
                meta: meta === "" ? null : Number(meta),
                unidade: unidade || null,
                metrica: metrica === "none" ? null : (metrica as OkrMetric),
                progresso_manual: progresso === "" ? null : Number(progresso),
              })
            }
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InitiativeDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: any;
  onClose: () => void;
  onSave: (v: any) => void;
}) {
  const [titulo, setTitulo] = useState(initial.titulo ?? "");
  const [responsavel, setResponsavel] = useState(initial.responsavel ?? "");
  const [status, setStatus] = useState(initial.status ?? "todo");
  const [prazo, setPrazo] = useState(initial.prazo ?? "");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial.id ? "Editar iniciativa" : "Nova iniciativa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Iniciativa</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Responsável</Label>
              <Input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
            </div>
            <div>
              <Label>Prazo</Label>
              <Input type="date" value={prazo ?? ""} onChange={(e) => setPrazo(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!titulo.trim()}
            onClick={() =>
              onSave({
                id: initial.id,
                key_result_id: initial.key_result_id,
                titulo,
                responsavel: responsavel || null,
                status,
                prazo: prazo || null,
              })
            }
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
