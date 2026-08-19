import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Sparkles, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchPerfisLeadsFn, generatePerfisInsightFn, type PerfisInsight } from "@/lib/perfis.functions";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function PerfisTab() {
  const [from, setFrom] = useState(iso(new Date(Date.now() - 90 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const [origem, setOrigem] = useState<"todas" | "humano" | "ia">("todas");
  const [insight, setInsight] = useState<PerfisInsight | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["coach-perfis", from, to, origem],
    queryFn: () => fetchPerfisLeadsFn({ data: { from, to, origem } }),
  });

  const gerar = useMutation({
    mutationFn: () =>
      generatePerfisInsightFn({
        data: {
          ranking: (data?.ranking ?? []).map((r) => ({
            perfil: r.perfil, total: r.total, pct: r.pct, avg_score: r.avg_score,
          })),
          contexto: `Período ${from} a ${to}. Conversas com texto do lead: ${data?.total_conversas ?? 0}. Origem: ${
            origem === "todas" ? "equipe + agente IA" : origem === "ia" ? "agente IA" : "equipe comercial"
          }.`,
        },
      }),
    onSuccess: (r) => { setInsight(r); toast.success("Leitura de perfis gerada"); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao gerar leitura"),
  });

  const chartData = useMemo(
    () => (data?.ranking ?? []).slice(0, 10).map((r) => ({ nome: r.perfil, total: r.total })),
    [data],
  );

  return (
    <div className="space-y-4 pt-4">
      <Card>
        <CardContent className="pt-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Origem do atendimento</Label>
            <Select value={origem} onValueChange={(v) => setOrigem(v as any)}>
              <SelectTrigger className="h-9 w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Equipe + Agente IA</SelectItem>
                <SelectItem value="humano">Só equipe comercial</SelectItem>
                <SelectItem value="ia">Só Agente IA</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="h-9 ml-auto" disabled={gerar.isPending || !data?.ranking.length} onClick={() => gerar.mutate()}>
            <Sparkles className="h-4 w-4 mr-1" />
            {gerar.isPending ? "Gerando..." : "Ler perfis com IA"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Conversas analisadas" value={String(data?.total_conversas ?? 0)} />
        <Kpi label="Leads com perfil identificado" value={String(data?.classificadas ?? 0)} />
        <Kpi label="Sem perfil claro" value={String(data?.nao_identificados ?? 0)} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Perfis mais atendidos</CardTitle>
        </CardHeader>
        <CardContent className="h-[320px]">
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">{isLoading ? "Carregando..." : "Sem dados no período."}</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="nome" width={200} fontSize={11} />
                <Tooltip />
                <Bar dataKey="total" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Detalhe por perfil</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground border-b">
              <tr>
                <th className="text-left p-2">Perfil</th>
                <th className="text-right p-2">Leads</th>
                <th className="text-right p-2">%</th>
                <th className="text-right p-2">Equipe</th>
                <th className="text-right p-2">Agente IA</th>
                <th className="text-right p-2">Nota média</th>
                <th className="text-left p-2">Trecho real / vendedores</th>
              </tr>
            </thead>
            <tbody>
              {(data?.ranking ?? []).map((r) => (
                <tr key={r.perfil} className="border-b align-top">
                  <td className="p-2">
                    <p className="font-medium">{r.perfil}</p>
                    <p className="text-[11px] text-muted-foreground">{r.descricao}</p>
                  </td>
                  <td className="p-2 text-right font-semibold">{r.total}</td>
                  <td className="p-2 text-right">{r.pct.toFixed(1)}%</td>
                  <td className="p-2 text-right">{r.humano}</td>
                  <td className="p-2 text-right">{r.ia}</td>
                  <td className="p-2 text-right">{r.avg_score != null ? r.avg_score.toFixed(2) : "—"}</td>
                  <td className="p-2 max-w-[420px]">
                    {r.exemplos.slice(0, 2).map((e, i) => (
                      <p key={i} className="text-[11px] text-muted-foreground italic mb-1">{e}</p>
                    ))}
                    <div className="flex flex-wrap gap-1">
                      {r.sellers.map((s) => (
                        <Badge key={s.seller} variant="outline" className="text-[10px]">{s.seller} · {s.total}</Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {(data?.ranking?.length ?? 0) === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">{isLoading ? "Carregando..." : "Sem dados."}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {insight && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4" /> Leitura de perfis (IA)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {insight.resumo && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{insight.resumo}</p>}
            {insight.icp && (
              <div className="rounded-lg border p-3">
                <p className="text-[10px] uppercase text-muted-foreground">ICP identificado</p>
                <p className="text-sm">{insight.icp}</p>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {insight.perfis.map((p) => (
                <div key={p.perfil} className="rounded-lg border p-3 space-y-2">
                  <p className="font-medium text-sm">{p.perfil}</p>
                  <Field titulo="Dor central" texto={p.dor} />
                  <Field titulo="Gatilho" texto={p.gatilho} />
                  <Field titulo="Como abordar" texto={p.abordagem} />
                  {p.script && (
                    <div className="rounded-md bg-muted/50 p-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] uppercase text-muted-foreground">Script</span>
                        <Button
                          size="sm" variant="ghost" className="h-6 px-2 ml-auto"
                          onClick={() => { navigator.clipboard.writeText(p.script); toast.success("Script copiado"); }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs whitespace-pre-wrap">{p.script}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {insight.acoes.length > 0 && (
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium mb-2">Ações para a gestão</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                  {insight.acoes.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ titulo, texto }: { titulo: string; texto: string }) {
  if (!texto) return null;
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground">{titulo}</p>
      <p className="text-xs">{texto}</p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
