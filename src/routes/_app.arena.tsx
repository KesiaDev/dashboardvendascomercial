import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Swords, Flame, Trophy, Target, Sparkles, Play, RefreshCw, Award, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getArenaDashboardFn, generateDailyMissionFn, startSimulationFn } from "@/lib/arena.functions";

export const Route = createFileRoute("/_app/arena")({
  component: ArenaDashboard,
});

const DIFFICULTIES = ["Bronze", "Prata", "Ouro", "Diamante", "Elite", "Lenda"] as const;
const LEAGUE_COLOR: Record<string, string> = {
  Bronze: "bg-amber-700/20 text-amber-700 dark:text-amber-400 border-amber-700/40",
  Prata: "bg-slate-400/20 text-slate-600 dark:text-slate-300 border-slate-400/40",
  Ouro: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/40",
  Diamante: "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/40",
  Elite: "bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/40",
  Lenda: "bg-gradient-to-r from-amber-500/30 to-fuchsia-500/30 text-foreground border-fuchsia-500/50",
};

function ArenaDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [difficulty, setDifficulty] = useState<string>("Ouro");

  const { data, isLoading } = useQuery({
    queryKey: ["arena-dashboard"],
    queryFn: () => getArenaDashboardFn(),
  });

  const generateMission = useMutation({
    mutationFn: () => generateDailyMissionFn(),
    onSuccess: () => { toast.success("Missão gerada"); qc.invalidateQueries({ queryKey: ["arena-dashboard"] }); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const startMission = useMutation({
    mutationFn: (missionId: string) => startSimulationFn({ data: { missionId } }),
    onSuccess: (r: any) => navigate({ to: "/arena/sim/$id", params: { id: r.simulationId } }),
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const startFree = useMutation({
    mutationFn: () => startSimulationFn({ data: { difficulty: difficulty as any } }),
    onSuccess: (r: any) => navigate({ to: "/arena/sim/$id", params: { id: r.simulationId } }),
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  if (isLoading || !data) return <p className="p-6 text-sm text-muted-foreground">A carregar…</p>;

  const mission: any = data.mission;
  const spec: any = mission?.spec ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 border border-fuchsia-500/30">
          <Swords className="h-6 w-6 text-fuchsia-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Arena Comercial</h1>
          <p className="text-xs text-muted-foreground">Simulador profissional de vendas com clientes gerados por IA</p>
        </div>
      </div>

      {/* Progress cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Trophy className="h-3 w-3" />Liga</p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="outline" className={"text-sm px-3 py-1 " + (LEAGUE_COLOR[data.progress.league] ?? "")}>{data.progress.league}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Nível {data.progress.level}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Sparkles className="h-3 w-3" />XP total</p>
          <p className="text-3xl font-bold mt-1">{data.progress.xp}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Flame className="h-3 w-3" />Sequência</p>
          <p className="text-3xl font-bold mt-1">{data.progress.streak} <span className="text-sm font-normal text-muted-foreground">dias</span></p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Award className="h-3 w-3" />Nota média</p>
          <p className="text-3xl font-bold mt-1">{data.stats.avgScore}</p>
          <p className="text-xs text-muted-foreground mt-1">{data.stats.total} simulações · {data.stats.winRate}% sucesso</p>
        </CardContent></Card>
      </div>

      {/* Mission */}
      <Card className="border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/5 to-cyan-500/5">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4 text-fuchsia-500" />Missão de hoje</CardTitle>
            {!mission && (
              <Button size="sm" onClick={() => generateMission.mutate()} disabled={generateMission.isPending}>
                <RefreshCw className={"h-4 w-4 mr-1 " + (generateMission.isPending ? "animate-spin" : "")} />Gerar missão
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!spec ? (
            <p className="text-sm text-muted-foreground">Nenhuma missão gerada hoje. Clique em "Gerar missão" para começar.</p>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3 text-sm">
                <div><span className="text-muted-foreground text-xs">Produto</span><p className="font-semibold">{spec.produto}</p></div>
                <div><span className="text-muted-foreground text-xs">Canal</span><p className="font-semibold">{spec.canal}</p></div>
                <div><span className="text-muted-foreground text-xs">Perfil</span><p className="font-semibold">DISC {spec.perfil_disc}</p></div>
                <div><span className="text-muted-foreground text-xs">Dificuldade</span><p className="font-semibold">{spec.dificuldade}</p></div>
                <div><span className="text-muted-foreground text-xs">Objetivo</span><p className="font-semibold">{spec.objetivo}</p></div>
                <div><span className="text-muted-foreground text-xs">Recompensa</span><p className="font-semibold">{spec.recompensa_xp} XP</p></div>
              </div>
              {spec.missao_especial && (
                <div className="p-3 rounded bg-fuchsia-500/10 border border-fuchsia-500/30 text-sm">
                  <span className="text-xs font-semibold text-fuchsia-600 dark:text-fuchsia-400">MISSÃO ESPECIAL</span>
                  <p className="mt-0.5">{spec.missao_especial}</p>
                </div>
              )}
              {mission.completed_simulation_id ? (
                <Badge variant="secondary">✓ Concluída</Badge>
              ) : (
                <Button onClick={() => startMission.mutate(mission.id)} disabled={startMission.isPending}>
                  <Play className="h-4 w-4 mr-1" />Iniciar missão
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Simulação livre */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Simulação livre</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Treine com um cliente aleatório na dificuldade escolhida. Cada persona é única.</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{DIFFICULTIES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={() => startFree.mutate()} disabled={startFree.isPending}>
              <Play className="h-4 w-4 mr-1" />Iniciar simulação livre
            </Button>
            {data.openSim && (
              <Button variant="outline" onClick={() => navigate({ to: "/arena/sim/$id", params: { id: data.openSim!.id } })}>
                Retomar simulação aberta
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Competências */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-500" />Habilidades mais fortes</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {data.strongest.length === 0 ? <p className="text-xs text-muted-foreground">Sem dados ainda.</p> :
              data.strongest.map((c: any) => (
                <div key={c.k} className="flex justify-between text-sm"><span className="capitalize">{c.k.replace(/_/g," ")}</span><span className="font-semibold text-emerald-600 dark:text-emerald-400">{c.avg.toFixed(1)}</span></div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingDown className="h-4 w-4 text-rose-500" />A melhorar</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {data.weakest.length === 0 ? <p className="text-xs text-muted-foreground">Sem dados ainda.</p> :
              data.weakest.map((c: any) => (
                <div key={c.k} className="flex justify-between text-sm"><span className="capitalize">{c.k.replace(/_/g," ")}</span><span className="font-semibold text-rose-600 dark:text-rose-400">{c.avg.toFixed(1)}</span></div>
              ))}
          </CardContent>
        </Card>
      </div>

      {/* Histórico */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Últimas simulações</CardTitle></CardHeader>
        <CardContent>
          {data.recent.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma simulação ainda. Comece a treinar!</p> : (
            <div className="space-y-1">
              {data.recent.map((s: any) => (
                <button
                  key={s.id}
                  onClick={() => navigate({ to: "/arena/sim/$id", params: { id: s.id } })}
                  className="w-full flex items-center justify-between text-sm px-3 py-2 rounded hover:bg-secondary text-left"
                >
                  <span className="flex items-center gap-2">
                    <Badge variant={s.status === "open" ? "default" : "outline"} className="text-[10px]">{s.status === "open" ? "aberta" : s.outcome ?? "finalizada"}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(s.started_at).toLocaleString("pt-BR")}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    {s.score != null && <span className="font-bold">{Number(s.score).toFixed(0)}</span>}
                    {s.xp_earned > 0 && <span className="text-xs text-fuchsia-500">+{s.xp_earned} XP</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
