import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchLeadsDiaSemanaFn } from "@/lib/leads-dia-semana.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  CalendarRange,
  Loader2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Hand,
} from "lucide-react";

export const Route = createFileRoute("/_app/leads-dia")({
  component: LeadsDiaPage,
  head: () => ({
    meta: [
      { title: "Leads por dia da semana | Painel Comercial" },
      {
        name: "description",
        content:
          "Análise de quais dias da semana chegam mais e menos leads no comercial, com discrepâncias e picos atípicos.",
      },
      { property: "og:title", content: "Leads por dia da semana | Painel Comercial" },
      {
        property: "og:description",
        content:
          "Descubra o melhor e o pior dia de captação de leads e detecte discrepâncias semanais.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const DOW_SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const COLORS = ["#6366f1", "#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#f97316", "#ef4444"];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function LeadsDiaPage() {
  const today = new Date();
  const [to, setTo] = useState(iso(today));
  const [from, setFrom] = useState(
    iso(new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1))),
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["leads-dia-semana", from, to],
    queryFn: () => fetchLeadsDiaSemanaFn({ data: { from, to } }),
    staleTime: 5 * 60 * 1000,
  });

  const chart = useMemo(
    () =>
      (data?.dows ?? []).map((d, i) => ({
        name: DOW_SHORT[i],
        media: Number(d.media.toFixed(2)),
        leads: d.leads,
        share: d.share,
      })),
    [data],
  );

  const maxHeat = useMemo(
    () => Math.max(1, ...(data?.semanas ?? []).flatMap((s) => s.valores)),
    [data],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 shadow-lg shadow-sky-500/25">
          <CalendarRange className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Leads por dia da semana</h1>
          <p className="text-sm text-muted-foreground">
            Sessão Estratégica · Minicurso V3 · Ebook V3 — horário de Lisboa
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedMonth}
            onChange={(e) => applyMonth(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="Escolher mês"
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
            <option value="custom">Período personalizado</option>
          </select>
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setSelectedMonth("custom");
            }}
            className="w-[150px]"
          />
          <span className="text-muted-foreground text-sm">até</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setSelectedMonth("custom");
            }}
            className="w-[150px]"
          />
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Analisando leads do período…</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-destructive text-sm">
          Erro ao carregar: {String(error)}
        </div>
      )}

      {data && !isLoading && (
        <>
          {/* Resumo */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground">Total de leads</p>
                <p className="text-3xl font-black tabular-nums">{data.total}</p>
                <p className="text-xs text-muted-foreground mt-0.5">no período selecionado</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-4 w-4 text-success-fg" /> Dia que mais chega
                </p>
                <p className="text-3xl font-black text-success-fg">{data.melhor?.label ?? "—"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  média de {data.melhor?.media.toFixed(1) ?? 0} leads/dia
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <TrendingDown className="h-4 w-4 text-destructive-fg" /> Dia que menos chega
                </p>
                <p className="text-3xl font-black text-destructive-fg">{data.pior?.label ?? "—"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  média de {data.pior?.media.toFixed(1) ?? 0} leads/dia
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Hand className="h-4 w-4 text-sky-500" /> Levantada de mão
                </p>
                <p className="text-3xl font-black tabular-nums">{data.totalAtendidos}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {data.total ? ((data.totalAtendidos / data.total) * 100).toFixed(1) : "0"}% dos
                  leads viraram responsabilidade do vendedor
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground">Discrepância entre dias</p>
                <p className="text-3xl font-black tabular-nums">
                  {data.pior && data.pior.media > 0 && data.melhor
                    ? `${(data.melhor.media / data.pior.media).toFixed(1)}x`
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  desvio-padrão entre dias: {data.desvio.toFixed(1)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Média por dia da semana */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Média de leads por dia da semana
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chart} margin={{ left: 0, right: 8 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(v: any, k: any) => [v, k === "media" ? "Média/dia" : k]}
                    labelFormatter={(l) => `Dia: ${l}`}
                  />
                  <Bar dataKey="media" radius={[6, 6, 0, 0]}>
                    {chart.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Tabela detalhada */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Detalhamento por dia da semana</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-4 font-medium">Dia</th>
                    <th className="pb-2 pr-4 font-medium text-right">Leads</th>
                    <th className="pb-2 pr-4 font-medium text-right">Dias no período</th>
                    <th className="pb-2 pr-4 font-medium text-right">Média/dia</th>
                    <th className="pb-2 pr-4 font-medium text-right">% do total</th>
                    <th className="pb-2 pr-4 font-medium text-right">Levantada de mão</th>
                    <th className="pb-2 font-medium">Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dows.map((d) => (
                    <tr key={d.dow} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="py-2.5 pr-4 font-medium">{d.label}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums font-bold">{d.leads}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                        {d.dias}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{d.media.toFixed(1)}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{d.share.toFixed(1)}%</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {d.atendidos}{" "}
                        <span className="text-muted-foreground text-xs">
                          ({d.taxaAtendimento.toFixed(0)}%)
                        </span>
                      </td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(d.porBucket)
                            .sort((a, b) => b[1] - a[1])
                            .map(([b, n]) => (
                              <Badge key={b} variant="secondary" className="text-xs">
                                {b} ({n})
                              </Badge>
                            ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Estágios na Clint */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Hand className="h-4 w-4 text-sky-500" /> Onde o lead parou na Clint
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <p className="text-xs text-muted-foreground mb-3">
                Contamos como “levantada de mão” o lead que saiu da automação (base, nutrição,
                abertura) e passou a ser conduzido pelo vendedor — respondeu template, foi
                contactado, agendou reunião ou recebeu proposta.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-4 font-medium">Estágio</th>
                    <th className="pb-2 pr-4 font-medium text-right">Leads</th>
                    <th className="pb-2 pr-4 font-medium text-right">% do total</th>
                    <th className="pb-2 font-medium">Conta como levantada de mão?</th>
                  </tr>
                </thead>
                <tbody>
                  {data.porEstagio.map((e) => (
                    <tr key={e.estagio} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="py-2 pr-4 font-medium">{e.estagio}</td>
                      <td className="py-2 pr-4 text-right tabular-nums font-bold">{e.leads}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {data.total ? ((e.leads / data.total) * 100).toFixed(1) : "0"}%
                      </td>
                      <td className="py-2">
                        <Badge variant={e.atendido ? "default" : "secondary"} className="text-xs">
                          {e.atendido ? "Sim — vendedor assumiu" : "Não — ainda na automação"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Heatmap semana × dia */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Mapa semanal (semana × dia)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium text-left">Semana</th>
                    {DOW_SHORT.map((d) => (
                      <th key={d} className="pb-2 px-2 font-medium text-center w-14">
                        {d}
                      </th>
                    ))}
                    <th className="pb-2 pl-3 font-medium text-center">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.semanas.map((s) => (
                    <tr key={s.semana}>
                      <td className="py-1 pr-4 text-muted-foreground whitespace-nowrap">
                        {s.semana.slice(8, 10)}/{s.semana.slice(5, 7)}
                      </td>
                      {s.valores.map((v, i) => (
                        <td key={i} className="py-1 px-1 text-center">
                          <div
                            className="rounded-md py-1 text-xs font-semibold tabular-nums"
                            style={{
                              background: v
                                ? `hsl(243 75% 59% / ${0.12 + (v / maxHeat) * 0.75})`
                                : "transparent",
                              color: v / maxHeat > 0.55 ? "#fff" : undefined,
                            }}
                          >
                            {v || "·"}
                          </div>
                        </td>
                      ))}
                      <td className="py-1 pl-3 text-center font-bold tabular-nums">{s.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Discrepâncias */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning-fg" /> Dias fora do padrão (±2
                desvios)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.outliers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  Nenhuma discrepância relevante — a captação está estável dentro de cada dia da
                  semana.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="pb-2 pr-4 font-medium">Data</th>
                      <th className="pb-2 pr-4 font-medium">Dia</th>
                      <th className="pb-2 pr-4 font-medium text-right">Leads</th>
                      <th className="pb-2 pr-4 font-medium text-right">Média do dia</th>
                      <th className="pb-2 font-medium text-right">Desvio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.outliers.map((o) => (
                      <tr key={o.data} className="border-b border-border/50">
                        <td className="py-2 pr-4 tabular-nums">
                          {o.data.slice(8, 10)}/{o.data.slice(5, 7)}
                        </td>
                        <td className="py-2 pr-4">{o.dow}</td>
                        <td className="py-2 pr-4 text-right tabular-nums font-bold">{o.leads}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                          {o.mediaDow.toFixed(1)}
                        </td>
                        <td
                          className={`py-2 text-right tabular-nums font-semibold ${
                            o.desvio > 0 ? "text-success-fg" : "text-destructive-fg"
                          }`}
                        >
                          {o.desvio > 0 ? "+" : ""}
                          {o.desvio.toFixed(1)}σ
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Por hora */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Horário de chegada dos leads (Lisboa)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.porHora} margin={{ left: 0, right: 8 }}>
                  <XAxis dataKey="hora" tick={{ fontSize: 11 }} tickFormatter={(h) => `${h}h`} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [v, "Leads"]} labelFormatter={(h) => `${h}h`} />
                  <Bar dataKey="leads" radius={[4, 4, 0, 0]} fill="#0ea5e9" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
