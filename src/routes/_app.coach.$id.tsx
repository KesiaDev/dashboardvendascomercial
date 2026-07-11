import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, Sparkles, MessageSquare, Target, Clock, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getCoachConversationFn, analyzeConversationFn } from "@/lib/coach.functions";

export const Route = createFileRoute("/_app/coach/$id")({
  component: DetailPage,
});

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function scoreColor(n: number | null | undefined) {
  if (n == null) return "text-muted-foreground";
  if (n >= 8) return "text-emerald-600 dark:text-emerald-400";
  if (n >= 6) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}
function sentimentColor(s: string | null | undefined) {
  if (s === "positivo") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  if (s === "negativo") return "bg-rose-500/15 text-rose-700 dark:text-rose-400";
  return "bg-slate-500/15 text-slate-700 dark:text-slate-300";
}

function DetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["coach-conv", id],
    queryFn: () => getCoachConversationFn({ data: { id } }),
  });
  const reanalyze = useMutation({
    mutationFn: () => analyzeConversationFn({ data: { conversationId: id, force: true } }),
    onSuccess: () => { toast.success("Reanálise concluída"); qc.invalidateQueries({ queryKey: ["coach-conv", id] }); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  if (isLoading || !data) return <p className="p-6 text-sm text-muted-foreground">A carregar…</p>;
  const c: any = data.conversation;
  const a: any = data.analysis;
  const msgs: any[] = data.messages ?? [];

  const comps = a && a.status === "ok" ? [
    { k: "Qualidade", v: a.qualidade },
    { k: "Clareza", v: a.clareza },
    { k: "Empatia", v: a.empatia },
    { k: "Rapport", v: a.rapport },
    { k: "Descoberta", v: a.descoberta },
    { k: "Condução", v: a.conducao },
  ] : [];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/coach"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button></Link>
        <div className="flex-1" />
        <Button size="sm" onClick={() => reanalyze.mutate()} disabled={reanalyze.isPending}>
          <RefreshCw className={"h-4 w-4 mr-1 " + (reanalyze.isPending ? "animate-spin" : "")} />Reanalisar
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold">{c?.contact_name ?? "Contacto —"}</h2>
            {a?.sentimento && <span className={"text-xs px-2 py-0.5 rounded " + sentimentColor(a.sentimento)}>{a.sentimento}</span>}
            {a?.prob_fecho != null && <Badge variant="outline">Fecho {a.prob_fecho}%</Badge>}
            {a?.nivel_interesse && <Badge variant="secondary">Interesse {a.nivel_interesse}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            Vendedor: {c?.seller_name ?? c?.seller_email ?? "—"} · {c?.origin_name ?? "—"} · {c?.stage ?? "—"} · {msgs.length} msgs
          </p>
        </CardContent>
      </Card>

      {a?.status === "insufficient_data" && (
        <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">{a.resumo ?? "Dados insuficientes."}</CardContent></Card>
      )}

      {a?.status === "ok" && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">Nota geral</p>
                <p className={"text-5xl font-bold " + scoreColor(a.score_geral)}>{Number(a.score_geral).toFixed(1)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Target className="h-3 w-3" />Probabilidade de fecho</p>
                <p className="text-3xl font-bold mt-1">{a.prob_fecho ?? "—"}%</p>
                <Progress value={a.prob_fecho ?? 0} className="mt-2 h-1.5" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />Tempo médio resposta</p>
                <p className="text-3xl font-bold mt-1">{a.tempo_medio_resposta_min != null ? a.tempo_medio_resposta_min + " min" : "—"}</p>
                <p className="text-xs text-muted-foreground mt-1">Tentou fechar: {a.tentou_fechar ? "sim" : "não"}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" />Resumo IA</CardTitle></CardHeader>
            <CardContent><p className="text-sm">{a.resumo ?? "—"}</p></CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Competências</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {comps.map((c) => (
                  <div key={c.k}>
                    <div className="flex justify-between text-xs">
                      <span>{c.k}</span>
                      <span className={"font-bold " + scoreColor(c.v)}>{c.v ?? "—"}</span>
                    </div>
                    <Progress value={((c.v ?? 0) as number) * 10} className="h-1.5 mt-0.5" />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Objeções & oportunidades</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Objeções</p>
                  {(a.objecoes ?? []).length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma.</p>
                    : <ul className="list-disc pl-4 space-y-0.5">{(a.objecoes ?? []).map((o: string, i: number) => <li key={i}>{o}</li>)}</ul>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Oportunidades perdidas</p>
                  {(a.oportunidades_perdidas ?? []).length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma.</p>
                    : <ul className="list-disc pl-4 space-y-0.5">{(a.oportunidades_perdidas ?? []).map((o: string, i: number) => <li key={i}>{o}</li>)}</ul>}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Lightbulb className="h-4 w-4" />Próxima ação e sugestão</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Próxima ação recomendada</p>
                <p className="text-sm font-semibold">{a.proxima_acao ?? "—"}</p>
              </div>
              {a.sugestao_resposta && (
                <div>
                  <p className="text-xs text-muted-foreground">Sugestão de resposta pronta</p>
                  <div className="mt-1 p-3 rounded bg-muted text-sm whitespace-pre-wrap">{a.sugestao_resposta}</div>
                </div>
              )}
              {(a.sugestoes ?? []).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Sugestões de melhoria</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-sm">{(a.sugestoes ?? []).map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" />Linha do tempo ({msgs.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
          {msgs.map((m) => (
            <div key={m.id} className={"flex " + (m.direction === "outbound" ? "justify-end" : "justify-start")}>
              <div className={"max-w-[75%] rounded-lg p-2 " + (m.direction === "outbound" ? "bg-primary/10" : "bg-muted")}>
                <p className="text-[10px] text-muted-foreground mb-0.5">{m.sender_name ?? "—"} · {fmtDate(m.sent_at)}</p>
                <p className="text-sm whitespace-pre-wrap">{m.body}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
