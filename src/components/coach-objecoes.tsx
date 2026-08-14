import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Copy, Sparkles, TrendingDown } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  fetchObjecoesFn, generateObjecoesPlaybookFn, type ObjecoesPlaybook,
} from "@/lib/objecoes.functions";

const COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#06b6d4"];
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function ObjecoesTab() {
  const [from, setFrom] = useState(iso(new Date(Date.now() - 90 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const [seller, setSeller] = useState("all");
  const [funil, setFunil] = useState("all");
  const [playbook, setPlaybook] = useState<ObjecoesPlaybook | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["coach-objecoes", from, to, seller, funil],
    queryFn: () => fetchObjecoesFn({ data: { from, to, seller, funil } }),
  });

  const gerar = useMutation({
    mutationFn: () =>
      generateObjecoesPlaybookFn({
        data: {
          ranking: (data?.ranking ?? []).map((r) => ({
            objecao: r.objecao, total: r.total, avg_score: r.avg_score,
          })),
          contexto: `Período ${from} a ${to}. Conversas analisadas: ${data?.sample_size ?? 0}. Nota média: ${
            data?.avg_score?.toFixed(2) ?? "—"
          }. Vendedor: ${seller === "all" ? "todos" : seller}. Funil: ${funil === "all" ? "todos" : funil}.`,
        },
      }),
    onSuccess: (r) => { setPlaybook(r); toast.success("Playbook de objeções gerado"); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao gerar playbook"),
  });

  const chartData = useMemo(
    () => (data?.ranking ?? []).slice(0, 8).map((r) => ({ nome: r.objecao, total: r.total })),
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
            <Label className="text-[11px] text-muted-foreground">Vendedor</Label>
            <Select value={seller} onValueChange={setSeller}>
              <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os vendedores</SelectItem>
                {(data?.sellers ?? []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Funil</Label>
            <Select value={funil} onValueChange={setFunil}>
              <SelectTrigger className="h-9 w-[230px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os funis</SelectItem>
                {(data?.funis ?? []).map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button className="h-9 ml-auto" disabled={gerar.isPending || !data?.ranking.length} onClick={() => gerar.mutate()}>
            <Sparkles className="h-4 w-4 mr-1" />
            {gerar.isPending ? "Gerando..." : "Gerar contorno com IA"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Conversas com objeção" value={String(data?.sample_size ?? 0)} />
        <Kpi label="Objeções detectadas" value={String(data?.total_objecoes ?? 0)} />
        <Kpi label="Nota média dessas conversas" value={data?.avg_score != null ? data.avg_score.toFixed(2) : "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Ranking de objeções</CardTitle></CardHeader>
          <CardContent className="h-[280px]">
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground">{isLoading ? "Carregando..." : "Sem objeções no período."}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis type="number" fontSize={11} />
                  <YAxis type="category" dataKey="nome" width={150} fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="total" fill={COLORS[0]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Evolução mês a mês (top 5)</CardTitle></CardHeader>
          <CardContent className="h-[280px]">
            {(data?.evolucao?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Sem histórico suficiente.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data!.evolucao}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="mes" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {(data?.meses ?? []).map((m, i) => (
                    <Line key={m} type="monotone" dataKey={m} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Detalhe por objeção</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground border-b">
              <tr>
                <th className="text-left p-2">Objeção</th>
                <th className="text-right p-2">Casos</th>
                <th className="text-right p-2">% do total</th>
                <th className="text-right p-2">Nota média</th>
                <th className="text-left p-2">Mais frequente em</th>
              </tr>
            </thead>
            <tbody>
              {(data?.ranking ?? []).map((r, i) => (
                <Fragment key={r.objecao}>
                  <tr key={r.objecao} className={`border-b ${i < 2 ? "bg-muted/30 font-semibold" : ""}`}>
                    <td className="p-2 font-medium">{r.objecao}</td>
                    <td className="p-2 text-right">{r.total}</td>
                    <td className="p-2 text-right">{r.pct.toFixed(1)}%</td>
                    <td className={`p-2 text-right ${r.avg_score != null && r.avg_score < 6 ? "text-red-500 font-semibold" : ""}`}>
                      {r.avg_score != null ? r.avg_score.toFixed(2) : "—"}
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {r.sellers.slice(0, 3).map((s) => (
                          <Badge key={s.seller} variant="outline" className="text-[10px]">{s.seller} · {s.total}</Badge>
                        ))}
                        {r.funis.slice(0, 2).map((f) => (
                          <Badge key={f.funil} variant="secondary" className="text-[10px]">{f.funil} · {f.total}</Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                  {i === 1 && (
                    <tr><td colSpan={5} className="p-0">
                      <div className="h-[3px] bg-primary/40 w-full" />
                    </td></tr>
                  )}
                </>
              ))}
              {(data?.ranking?.length ?? 0) === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">{isLoading ? "Carregando..." : "Sem dados."}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {playbook && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Playbook de contorno (IA)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {playbook.resumo && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{playbook.resumo}</p>}
            <div className="grid gap-3 md:grid-cols-2">
              {playbook.itens.map((it) => (
                <div key={it.objecao} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{it.objecao}</span>
                    <Badge
                      variant="outline"
                      className={`ml-auto text-[10px] ${it.prioridade === "alta" ? "border-red-500/50 text-red-500" : ""}`}
                    >
                      {it.prioridade}
                    </Badge>
                  </div>
                  <Field titulo="Causa raiz" texto={it.causa_raiz} />
                  <Field titulo="Como contornar" texto={it.contorno} />
                  <div className="rounded-md bg-muted/50 p-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] uppercase text-muted-foreground">Script pronto</span>
                      <Button
                        size="sm" variant="ghost" className="h-6 px-2 ml-auto"
                        onClick={() => { navigator.clipboard.writeText(it.script); toast.success("Script copiado"); }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-xs whitespace-pre-wrap">{it.script}</p>
                  </div>
                  <Field titulo="Como prevenir" texto={it.prevencao} />
                </div>
              ))}
            </div>
            {playbook.acoes_gestao.length > 0 && (
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 mb-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4" /> Ações para a gestão
                </div>
                <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                  {playbook.acoes_gestao.map((a, i) => <li key={i}>{a}</li>)}
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
