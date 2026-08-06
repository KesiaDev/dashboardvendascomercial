import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { GraduationCap, Sparkles, Copy, RefreshCw, Quote, Users, Timer, Target, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listCaseCandidatesFn, generateTrainingCaseFn,
  type CaseCandidate, type TrainingCase,
} from "@/lib/coach-cases.functions";

function caseToText(c: TrainingCase): string {
  const L: string[] = [];
  L.push(`# ${c.titulo}`);
  L.push(`Vendedor: ${c.seller} · Duração: ${c.duracao_min} min`);
  L.push(`\n## Contexto\n${c.contexto}`);
  if (c.objetivo_aprendizagem.length) L.push(`\n## Objetivos\n` + c.objetivo_aprendizagem.map((o) => `- ${o}`).join("\n"));
  if (c.o_que_a_ia_viu.length)
    L.push(`\n## O que a IA identificou\n` + c.o_que_a_ia_viu.map((x) => `- ${x.tema}: ${x.o_que_aconteceu}\n  Impacto: ${x.impacto}\n  Evidência: "${x.evidencia}"`).join("\n"));
  L.push(`\n## Abertura da conversa\nO que foi feito: ${c.abertura.o_que_foi_feito}\nPor que não funciona: ${c.abertura.por_que_nao_funciona}\nModelo melhor: ${c.abertura.modelo_melhor}`);
  if (c.objecoes.length)
    L.push(`\n## Objeções\n` + c.objecoes.map((o) => `- Objeção: ${o.objecao}\n  Resposta dada: ${o.resposta_dada}\n  Resposta ideal (${o.tecnica}): ${o.resposta_ideal}`).join("\n"));
  if (c.trechos.length) L.push(`\n## Trechos para discutir\n` + c.trechos.map((t) => `- [${t.quem}] "${t.texto}"\n  → ${t.comentario_ia}`).join("\n"));
  if (c.roteiro.length)
    L.push(`\n## Roteiro da sessão\n` + c.roteiro.map((r) => `- (${r.minutos} min) ${r.bloco}: ${r.como_conduzir}\n  Perguntas: ${r.perguntas_para_equipe.join(" | ")}`).join("\n"));
  L.push(`\n## Role-play\nCenário: ${c.roleplay.cenario}\nPapel do cliente: ${c.roleplay.papel_cliente}\nObjeções: ${(c.roleplay.objecoes_do_cliente ?? []).join(" | ")}\nAvaliação: ${(c.roleplay.criterios_avaliacao ?? []).join(" | ")}`);
  if (c.mensagens_modelo.length) L.push(`\n## Mensagens modelo\n` + c.mensagens_modelo.map((m) => `- ${m.situacao}: ${m.texto}`).join("\n"));
  if (c.compromissos.length) L.push(`\n## Compromissos da equipe\n` + c.compromissos.map((x) => `- ${x}`).join("\n"));
  L.push(`\n## Indicador de acompanhamento\n${c.indicador_acompanhamento}`);
  return L.join("\n");
}

export function CasesTab() {
  const [days, setDays] = useState(30);
  const [duracao, setDuracao] = useState(35);
  const [foco, setFoco] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [caso, setCaso] = useState<TrainingCase | null>(null);

  const { data: candidates = [], isFetching, refetch } = useQuery({
    queryKey: ["coach-case-candidates", days],
    queryFn: () => listCaseCandidatesFn({ data: { days } }),
  });

  const gen = useMutation({
    mutationFn: (conversationId: string) =>
      generateTrainingCaseFn({ data: { conversationId, duracao, foco: foco.trim() || undefined } }),
    onSuccess: (c) => { setCaso(c); toast.success("Case gerado"); },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GraduationCap className="h-4 w-4" /> Cases de treinamento em equipe
            <Badge variant="outline" className="ml-2 text-[10px]">visível só para você</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            A IA pega conversas reais com pior avaliação e monta um case detalhado para conduzir com o time em 30–40 minutos:
            abertura, condução, objeções, role-play e compromissos.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div>
            <Label className="text-xs">Janela (dias)</Label>
            <Input type="number" value={days} onChange={(e) => setDays(Number(e.target.value) || 30)} />
          </div>
          <div>
            <Label className="text-xs">Duração do case (min)</Label>
            <Input type="number" value={duracao} onChange={(e) => setDuracao(Number(e.target.value) || 35)} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Foco (opcional)</Label>
            <Input value={foco} onChange={(e) => setFoco(e.target.value)} placeholder="ex.: objeção de preço, abertura fria, follow-up" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm">Conversas candidatas (pior nota primeiro)</CardTitle>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {candidates.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhuma conversa analisada nessa janela. Analise conversas na aba Conversas primeiro.
            </p>
          )}
          {candidates.map((c: CaseCandidate) => (
            <div
              key={c.conversation_id}
              className={`rounded-md border p-3 text-sm flex gap-3 items-start cursor-pointer transition ${
                selected === c.conversation_id ? "border-primary bg-primary/5" : "hover:bg-muted/40"
              }`}
              onClick={() => setSelected(c.conversation_id)}
            >
              <div className={`text-lg font-bold w-10 shrink-0 ${(c.score ?? 10) < 6 ? "text-rose-600" : (c.score ?? 10) < 8 ? "text-amber-600" : "text-emerald-600"}`}>
                {c.score ?? "—"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">
                  {c.seller} <span className="text-muted-foreground font-normal">· {c.contact_name ?? "lead"}</span>
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2">{c.resumo ?? "—"}</div>
                {c.pontos_melhoria.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.pontos_melhoria.map((p, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px] font-normal">{p}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <Button
                size="sm"
                disabled={gen.isPending}
                onClick={(e) => { e.stopPropagation(); setSelected(c.conversation_id); gen.mutate(c.conversation_id); }}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                {gen.isPending && selected === c.conversation_id ? "Gerando..." : "Gerar case"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {caso && <CaseView caso={caso} />}
    </div>
  );
}

function Section({ icon, title, children }: { icon?: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold flex items-center gap-2">{icon}{title}</h4>
      {children}
    </div>
  );
}

function CaseView({ caso }: { caso: TrainingCase }) {
  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">{caso.titulo}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{caso.seller}</span>
            <span className="flex items-center gap-1"><Timer className="h-3 w-3" />{caso.duracao_min} min</span>
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => { navigator.clipboard.writeText(caseToText(caso)); toast.success("Case copiado"); }}
        >
          <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
        </Button>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <p className="text-muted-foreground">{caso.contexto}</p>

        {caso.objetivo_aprendizagem.length > 0 && (
          <Section icon={<Target className="h-4 w-4" />} title="Objetivos da sessão">
            <ul className="list-disc pl-5 space-y-1">{caso.objetivo_aprendizagem.map((o, i) => <li key={i}>{o}</li>)}</ul>
          </Section>
        )}

        {caso.o_que_a_ia_viu.length > 0 && (
          <Section title="O que a IA identificou de errado">
            <div className="space-y-2">
              {caso.o_que_a_ia_viu.map((x, i) => (
                <div key={i} className="rounded-md border-l-4 border-rose-500/60 bg-rose-500/5 p-3">
                  <div className="font-medium">{x.tema}</div>
                  <div>{x.o_que_aconteceu}</div>
                  <div className="text-xs text-muted-foreground mt-1">Impacto: {x.impacto}</div>
                  {x.evidencia && <div className="text-xs italic mt-1">"{x.evidencia}"</div>}
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="Abertura da conversa">
          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground mb-1">O que foi feito</div>{caso.abertura.o_que_foi_feito}</div>
            <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground mb-1">Por que não funciona</div>{caso.abertura.por_que_nao_funciona}</div>
            <div className="rounded-md border p-3 bg-emerald-500/5"><div className="text-xs text-muted-foreground mb-1">Modelo melhor</div>{caso.abertura.modelo_melhor}</div>
          </div>
        </Section>

        {caso.objecoes.length > 0 && (
          <Section title="Objeções — o que foi dito x o que deveria">
            <div className="space-y-2">
              {caso.objecoes.map((o, i) => (
                <div key={i} className="rounded-md border p-3 space-y-1">
                  <div className="font-medium">{o.objecao}</div>
                  <div className="text-rose-700 dark:text-rose-400 text-xs">Resposta dada: {o.resposta_dada}</div>
                  <div className="text-emerald-700 dark:text-emerald-400 text-xs">Resposta ideal: {o.resposta_ideal}</div>
                  {o.tecnica && <Badge variant="secondary" className="text-[10px]">{o.tecnica}</Badge>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {caso.trechos.length > 0 && (
          <Section icon={<Quote className="h-4 w-4" />} title="Trechos reais para discutir">
            <div className="space-y-2">
              {caso.trechos.map((t, i) => (
                <div key={i} className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs uppercase text-muted-foreground">{t.quem}</div>
                  <div className="italic">"{t.texto}"</div>
                  <div className="text-xs mt-1">→ {t.comentario_ia}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {caso.roteiro.length > 0 && (
          <Section icon={<Timer className="h-4 w-4" />} title="Roteiro minuto a minuto">
            <div className="space-y-2">
              {caso.roteiro.map((r, i) => (
                <div key={i} className="rounded-md border p-3">
                  <div className="font-medium flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{r.minutos} min</Badge> {r.bloco}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{r.como_conduzir}</div>
                  {r.perguntas_para_equipe?.length > 0 && (
                    <ul className="list-disc pl-5 text-xs mt-1 space-y-0.5">
                      {r.perguntas_para_equipe.map((q, k) => <li key={k}>{q}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="Role-play">
          <div className="rounded-md border p-3 space-y-1">
            <div>{caso.roleplay.cenario}</div>
            <div className="text-xs text-muted-foreground">Papel do cliente: {caso.roleplay.papel_cliente}</div>
            {caso.roleplay.objecoes_do_cliente?.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {caso.roleplay.objecoes_do_cliente.map((o, i) => <Badge key={i} variant="secondary" className="text-[10px] font-normal">{o}</Badge>)}
              </div>
            )}
            {caso.roleplay.criterios_avaliacao?.length > 0 && (
              <ul className="list-disc pl-5 text-xs pt-1">{caso.roleplay.criterios_avaliacao.map((c, i) => <li key={i}>{c}</li>)}</ul>
            )}
          </div>
        </Section>

        {caso.mensagens_modelo.length > 0 && (
          <Section title="Mensagens modelo (prontas para usar)">
            <div className="space-y-2">
              {caso.mensagens_modelo.map((m, i) => (
                <div key={i} className="rounded-md border p-3 flex items-start gap-2">
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground">{m.situacao}</div>
                    <div className="whitespace-pre-wrap">{m.texto}</div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(m.texto); toast.success("Copiado"); }}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </Section>
        )}

        {caso.compromissos.length > 0 && (
          <Section icon={<CheckCircle2 className="h-4 w-4" />} title="Compromissos da equipe">
            <ul className="list-disc pl-5 space-y-1">{caso.compromissos.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </Section>
        )}

        {caso.indicador_acompanhamento && (
          <Section title="Como medir se melhorou">
            <p className="text-muted-foreground">{caso.indicador_acompanhamento}</p>
          </Section>
        )}
      </CardContent>
    </Card>
  );
}
