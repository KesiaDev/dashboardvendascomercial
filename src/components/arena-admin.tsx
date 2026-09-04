import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Activity, Gauge, AlertTriangle, Eye, Swords } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { getArenaTeamOverviewFn, getArenaSellerDetailFn, getArenaSimAdminFn } from "@/lib/arena-admin.functions";

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

export function ArenaAdminPanel() {
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [simId, setSimId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["arena-team-overview"],
    queryFn: () => getArenaTeamOverviewFn(),
  });

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">A carregar…</p>;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />Vendedores na Arena</p>
          <p className="text-3xl font-bold mt-1">{data.team.sellers}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Activity className="h-3 w-3" />Ativos (7 dias)</p>
          <p className="text-3xl font-bold mt-1">{data.team.active7}</p>
          <p className="text-xs text-muted-foreground mt-1">de {data.team.sellers} no total</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Swords className="h-3 w-3" />Simulações</p>
          <p className="text-3xl font-bold mt-1">{data.team.totalSims}</p>
          <p className="text-xs text-muted-foreground mt-1">{data.team.finished} concluídas</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Gauge className="h-3 w-3" />Nota média da equipa</p>
          <p className="text-3xl font-bold mt-1">{data.team.avgScore}</p>
        </CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning-fg" />Competências mais fracas da equipa</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {data.team.weakest.length === 0 ? <p className="text-xs text-muted-foreground">Sem dados ainda.</p> :
              data.team.weakest.map((c) => (
                <div key={c.k} className="space-y-1">
                  <div className="flex justify-between text-sm"><span className="capitalize">{c.k.replace(/_/g, " ")}</span><span className="font-semibold">{c.avg}</span></div>
                  <Progress value={c.avg * 10} className="h-1.5" />
                </div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Pontos a trabalhar mais repetidos</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {data.team.commonImprovements.length === 0 ? <p className="text-xs text-muted-foreground">Sem dados ainda.</p> :
              data.team.commonImprovements.map((i) => (
                <div key={i.text} className="flex items-start justify-between gap-2 text-sm">
                  <span>{i.text}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{i.n}×</Badge>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Uso da ferramenta por vendedor</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {data.sellers.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum vendedor usou a Arena ainda.</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Liga</TableHead>
                  <TableHead className="text-right">XP</TableHead>
                  <TableHead className="text-right">Sims</TableHead>
                  <TableHead className="text-right">7d</TableHead>
                  <TableHead className="text-right">30d</TableHead>
                  <TableHead className="text-right">Nota</TableHead>
                  <TableHead className="text-right">Sucesso</TableHead>
                  <TableHead className="text-right">Missões</TableHead>
                  <TableHead>Último treino</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sellers.map((s) => (
                  <TableRow key={s.userId}>
                    <TableCell>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.email}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{s.league}</Badge></TableCell>
                    <TableCell className="text-right">{s.xp}</TableCell>
                    <TableCell className="text-right">{s.total}</TableCell>
                    <TableCell className="text-right">{s.last7}</TableCell>
                    <TableCell className="text-right">{s.last30}</TableCell>
                    <TableCell className="text-right font-semibold">{s.avgScore || "—"}</TableCell>
                    <TableCell className="text-right">{s.finished ? `${s.winRate}%` : "—"}</TableCell>
                    <TableCell className="text-right">{s.missionsCompleted}/{s.missionsGenerated}</TableCell>
                    <TableCell>
                      <span className="text-xs">{fmtDate(s.lastPlayedAt)}</span>
                      {s.daysSinceLastPlay != null && s.daysSinceLastPlay >= 7 && (
                        <Badge variant="outline" className="ml-2 text-[10px] border-warning/50 text-warning-fg">{s.daysSinceLastPlay}d parado</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setSelected({ id: s.userId, name: s.name })}>
                        <Eye className="h-4 w-4 mr-1" />Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SellerDetailDialog seller={selected} onClose={() => setSelected(null)} onOpenSim={(id) => setSimId(id)} />
      <SimTranscriptDialog simId={simId} onClose={() => setSimId(null)} />
    </div>
  );
}

function SellerDetailDialog({
  seller,
  onClose,
  onOpenSim,
}: {
  seller: { id: string; name: string } | null;
  onClose: () => void;
  onOpenSim: (id: string) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["arena-seller-detail", seller?.id],
    queryFn: () => getArenaSellerDetailFn({ data: { userId: seller!.id } }),
    enabled: !!seller,
  });

  return (
    <Dialog open={!!seller} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Arena — {seller?.name}</DialogTitle></DialogHeader>
        {isLoading || !data ? <p className="text-sm text-muted-foreground">A carregar…</p> : (
          <ScrollArea className="max-h-[70vh] pr-3">
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold mb-2">Competências (média 0-10)</h3>
                  {data.competencies.length === 0 ? <p className="text-xs text-muted-foreground">Sem avaliações.</p> :
                    data.competencies.map((c) => (
                      <div key={c.k} className="space-y-1 mb-2">
                        <div className="flex justify-between text-sm"><span className="capitalize">{c.k.replace(/_/g, " ")}</span><span className="font-semibold">{c.avg}</span></div>
                        <Progress value={c.avg * 10} className="h-1.5" />
                      </div>
                    ))}
                </div>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold mb-1">Pontos fortes recorrentes</h3>
                    {data.strengths.length === 0 ? <p className="text-xs text-muted-foreground">Sem dados.</p> :
                      <ul className="list-disc pl-4 text-sm space-y-0.5">{data.strengths.map((s) => <li key={s.text}>{s.text} <span className="text-xs text-muted-foreground">({s.n}×)</span></li>)}</ul>}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-1">A trabalhar</h3>
                    {data.improvements.length === 0 ? <p className="text-xs text-muted-foreground">Sem dados.</p> :
                      <ul className="list-disc pl-4 text-sm space-y-0.5">{data.improvements.map((s) => <li key={s.text}>{s.text} <span className="text-xs text-muted-foreground">({s.n}×)</span></li>)}</ul>}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Simulações</h3>
                {data.sims.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma simulação.</p> : (
                  <div className="space-y-1">
                    {data.sims.map((s) => (
                      <button key={s.id} onClick={() => onOpenSim(s.id)} className="w-full text-left px-3 py-2 rounded hover:bg-secondary">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 min-w-0">
                            <Badge variant={s.status === "open" ? "default" : "outline"} className="text-[10px]">{s.status === "open" ? "aberta" : s.outcome ?? "finalizada"}</Badge>
                            <span className="text-xs text-muted-foreground truncate">{fmtDate(s.started_at)} · {s.product ?? "—"} · {s.difficulty ?? "—"}</span>
                          </span>
                          <span className="flex items-center gap-3 shrink-0">
                            {s.score != null && <span className="font-bold text-sm">{Number(s.score).toFixed(0)}</span>}
                            {!!s.xp_earned && <span className="text-xs text-fuchsia-500">+{s.xp_earned} XP</span>}
                          </span>
                        </div>
                        {s.resumo && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.resumo}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Missões diárias</h3>
                {data.missions.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma missão gerada.</p> : (
                  <div className="space-y-1 text-sm">
                    {data.missions.map((m: any) => (
                      <div key={m.id} className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{m.mission_date} · {(m.spec as any)?.produto ?? "—"}</span>
                        <Badge variant={m.completed_simulation_id ? "secondary" : "outline"} className="text-[10px]">{m.completed_simulation_id ? "concluída" : "pendente"}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SimTranscriptDialog({ simId, onClose }: { simId: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["arena-sim-admin", simId],
    queryFn: () => getArenaSimAdminFn({ data: { id: simId! } }),
    enabled: !!simId,
  });

  const evaluation: any = (data?.simulation as any)?.evaluation ?? null;
  const persona: any = (data?.simulation as any)?.arena_personas?.persona ?? null;

  return (
    <Dialog open={!!simId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Simulação — transcrição e avaliação</DialogTitle></DialogHeader>
        {isLoading || !data ? <p className="text-sm text-muted-foreground">A carregar…</p> : (
          <ScrollArea className="max-h-[70vh] pr-3">
            <div className="space-y-4">
              {persona && (
                <p className="text-xs text-muted-foreground">
                  Cliente: <strong>{persona.nome}</strong> · {persona.profissao ?? "—"} · {persona.cidade ?? "—"} · dificuldade {(data.simulation as any)?.arena_personas?.difficulty}
                </p>
              )}
              {evaluation && (
                <div className="rounded border p-3 space-y-2">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-bold text-lg">{Math.round(Number(evaluation.score_geral ?? 0))}</span>
                    <Badge variant="outline">{evaluation.outcome ?? "—"}</Badge>
                  </div>
                  {evaluation.resumo && <p className="text-sm">{evaluation.resumo}</p>}
                  {Array.isArray(evaluation.melhorias) && (
                    <ul className="list-disc pl-4 text-sm space-y-0.5">{evaluation.melhorias.map((m: string, i: number) => <li key={i}>{m}</li>)}</ul>
                  )}
                </div>
              )}
              <div className="space-y-2">
                {data.messages.map((m: any) => (
                  <div key={m.id} className={m.role === "seller" ? "flex justify-end" : "flex justify-start"}>
                    <div className={"max-w-[80%] rounded-lg px-3 py-2 text-sm " + (m.role === "seller" ? "bg-primary text-primary-foreground" : "bg-secondary")}>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      {m.ai_comment && (
                        <p className="mt-1 text-[11px] opacity-80">💡 {(m.ai_comment as any).comentario}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
