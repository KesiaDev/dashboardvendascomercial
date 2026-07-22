import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Flag, Loader2, Sparkles, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { getSimulationFn, sendArenaMessageFn, finishSimulationFn } from "@/lib/arena.functions";

export const Route = createFileRoute("/_app/arena/sim/$id")({
  component: SimPage,
});

const EMOTION_META: Record<string, { emoji: string; color: string }> = {
  animado: { emoji: "😊", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  neutro: { emoji: "😐", color: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  desconfiado: { emoji: "🤔", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  irritado: { emoji: "😡", color: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
  ocupado: { emoji: "😴", color: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  frustrado: { emoji: "😢", color: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
  interessado: { emoji: "😍", color: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-400" },
  seguro: { emoji: "😎", color: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400" },
};

function SimPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["arena-sim", id],
    queryFn: () => getSimulationFn({ data: { id } }),
    refetchOnWindowFocus: false,
  });

  const send = useMutation({
    mutationFn: (body: string) => sendArenaMessageFn({ data: { simulationId: id, body } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["arena-sim", id] }); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const finish = useMutation({
    mutationFn: () => finishSimulationFn({ data: { simulationId: id } }),
    onSuccess: (r: any) => {
      toast.success(`Avaliação: ${Math.round(r.score)} · +${r.xp_earned} XP`);
      qc.invalidateQueries({ queryKey: ["arena-sim", id] });
      qc.invalidateQueries({ queryKey: ["arena-dashboard"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [data?.messages?.length, send.isPending]);

  if (isLoading || !data) return <p className="p-6 text-sm text-muted-foreground">A carregar…</p>;

  const sim: any = data.simulation;
  const persona: any = sim.arena_personas?.persona ?? {};
  const messages: any[] = data.messages;
  const finished = sim.status === "finished";
  const emotion = sim.current_emotion ?? "neutro";
  const emoMeta = EMOTION_META[emotion] ?? EMOTION_META.neutro;
  const evaluation: any = sim.evaluation;

  function handleSend() {
    const body = text.trim();
    if (!body) return;
    setText("");
    send.mutate(body);
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-2">
        <Link to="/arena"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button></Link>
        <div className="flex-1" />
        {!finished && (
          <Button size="sm" variant="destructive" onClick={() => finish.mutate()} disabled={finish.isPending}>
            {finish.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Flag className="h-4 w-4 mr-1" />}Encerrar e avaliar
          </Button>
        )}
      </div>

      {/* Persona header */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/30 flex items-center justify-center text-lg font-bold">
              {(persona.nome ?? "?").slice(0, 1)}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold">{persona.nome ?? "Cliente"}</h2>
                <Badge variant="outline">{sim.arena_personas?.difficulty}</Badge>
                <Badge variant="secondary">{sim.arena_personas?.channel}</Badge>
                <span className={"text-xs px-2 py-0.5 rounded " + emoMeta.color}>{emoMeta.emoji} {emotion}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {persona.idade} anos · {persona.profissao ?? "—"} · {persona.cidade ?? "—"}, {persona.pais ?? "—"} · DISC {persona.disc ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Interesse: {persona.interesse ?? "—"} · Urgência: {persona.urgencia ?? "—"} · Produto: {sim.arena_personas?.product}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chat (WhatsApp style) */}
      <Card className="overflow-hidden">
        <div
          ref={scrollRef}
          className="h-[500px] overflow-y-auto p-4 space-y-2"
          style={{ background: "repeating-linear-gradient(45deg, hsl(var(--muted)/0.3), hsl(var(--muted)/0.3) 12px, transparent 12px, transparent 24px)" }}
        >
          {messages.map((m) => {
            const isSeller = m.role === "seller";
            const comment = m.ai_comment as any;
            return (
              <div key={m.id} className={"flex " + (isSeller ? "justify-end" : "justify-start")}>
                <div className={"max-w-[75%] " + (isSeller ? "items-end" : "items-start") + " flex flex-col gap-1"}>
                  <div className={"rounded-2xl px-3 py-2 shadow-sm text-sm whitespace-pre-wrap " + (isSeller ? "bg-emerald-500 text-white rounded-br-sm" : "bg-card border rounded-bl-sm")}>
                    {m.body}
                    <div className={"text-[10px] mt-1 " + (isSeller ? "text-emerald-50/80 text-right" : "text-muted-foreground")}>
                      {new Date(m.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  {finished && isSeller && comment && (
                    <div className={"text-xs flex items-start gap-1 px-2 " + (
                      comment.tag === "positivo" ? "text-emerald-600 dark:text-emerald-400" :
                      comment.tag === "alerta" ? "text-amber-600 dark:text-amber-400" :
                      "text-rose-600 dark:text-rose-400"
                    )}>
                      {comment.tag === "positivo" ? <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" /> :
                       comment.tag === "alerta" ? <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> :
                       <XCircle className="h-3 w-3 mt-0.5 shrink-0" />}
                      <span>{comment.comentario}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {send.isPending && (
            <div className="flex justify-start">
              <div className="bg-card border rounded-2xl rounded-bl-sm px-3 py-2 text-sm text-muted-foreground">
                digitando…
              </div>
            </div>
          )}
        </div>

        {!finished && (
          <div className="border-t p-3 flex items-end gap-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Escreva sua mensagem…"
              className="min-h-[44px] max-h-[120px] resize-none"
              disabled={send.isPending}
            />
            <Button onClick={handleSend} disabled={send.isPending || !text.trim()} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        )}
      </Card>

      {/* Avaliação */}
      {finished && evaluation && (
        <>
          <Card className="border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/5 to-cyan-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-fuchsia-500" />Avaliação da simulação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline gap-3 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground">Nota final</p>
                  <p className="text-5xl font-bold">{Number(sim.score ?? 0).toFixed(0)}<span className="text-lg text-muted-foreground">/100</span></p>
                </div>
                <Badge variant="outline" className="text-sm">{sim.outcome}</Badge>
                <Badge className="bg-fuchsia-500 text-white">+{sim.xp_earned} XP</Badge>
              </div>
              <p className="text-sm">{evaluation.resumo}</p>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Competências</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(evaluation.competencias ?? {}).map(([k, v]: any) => (
                  <div key={k}>
                    <div className="flex justify-between text-xs">
                      <span className="capitalize">{k.replace(/_/g, " ")}</span>
                      <span className="font-bold">{v}</span>
                    </div>
                    <Progress value={(Number(v) ?? 0) * 10} className="h-1.5 mt-0.5" />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Feedback</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1">Pontos fortes</p>
                  <ul className="list-disc pl-4 space-y-0.5">{(evaluation.pontos_fortes ?? []).map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 mb-1">A melhorar</p>
                  <ul className="list-disc pl-4 space-y-0.5">{(evaluation.melhorias ?? []).map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
