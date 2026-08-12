import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchPlanoMetasFn,
  diagnosticoPlanoFn,
  type PlanoMetasData,
} from "@/lib/plano-metas.functions";
import type { FunilId } from "@/lib/plano-metas.server";
import { Target, Sparkles, RotateCcw, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/plano-metas")({
  component: PlanoMetasPage,
  head: () => ({
    meta: [
      { title: "Plano de Metas até 30/09 | Dashboard Comercial" },
      {
        name: "description",
        content:
          "Metas de conversão por funil convertidas em metas operacionais diárias, semanais e mensais por vendedor.",
      },
      { property: "og:title", content: "Plano de Metas até 30/09" },
      {
        property: "og:description",
        content: "Cálculo reverso do funil, cenários de volume e diagnóstico automático da equipe comercial.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

// ── Config ──────────────────────────────────────────────────────────────────
const STORE_KEY = "plano-metas-v1";
const IDS: FunilId[] = ["WEBINAR", "V3", "SESSAO"];

type Config = {
  metas: Record<FunilId, number>;
  dataFinal: string;
  desde: string;
  vendedores: string[];
  comparecimento: number; // % de reuniões agendadas que acontecem
  fechamento: number; // % de reuniões realizadas que viram venda
  proposta: number; // % de reuniões realizadas que geram proposta
};

const DEFAULT_CONFIG: Config = {
  metas: { WEBINAR: 1.5, V3: 5, SESSAO: 10 },
  dataFinal: "2026-09-30",
  desde: "2026-01-01",
  vendedores: ["Fábio Nadal", "Gisele", "Luana", "Rita", "João"],
  comparecimento: 48.6,
  fechamento: 33,
  proposta: 60,
};

function loadConfig(): Config {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const p = JSON.parse(raw) as Partial<Config>;
    return { ...DEFAULT_CONFIG, ...p, metas: { ...DEFAULT_CONFIG.metas, ...(p.metas ?? {}) } };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const pct = (v: number) => `${v.toFixed(2)}%`;
const int = (v: number) => Math.max(0, Math.ceil(v)).toLocaleString("pt-BR");
const num1 = (v: number) => v.toFixed(1);
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
const addDays = (iso: string, n: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const brDate = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

type Semaforo = "verde" | "amarelo" | "vermelho";
function semaforo(ritmoAtual: number, ritmoNecessario: number): Semaforo {
  if (ritmoNecessario <= 0) return "verde";
  const r = ritmoAtual / ritmoNecessario;
  if (r >= 0.95) return "verde";
  if (r >= 0.7) return "amarelo";
  return "vermelho";
}
const SEM_LABEL: Record<Semaforo, string> = {
  verde: "🟢 No ritmo",
  amarelo: "🟡 Atenção",
  vermelho: "🔴 Risco",
};
const SEM_CLS: Record<Semaforo, string> = {
  verde: "bg-emerald-500/15 text-emerald-500",
  amarelo: "bg-amber-500/15 text-amber-500",
  vermelho: "bg-red-500/15 text-red-500",
};

// ── Página ──────────────────────────────────────────────────────────────────
function PlanoMetasPage() {
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const [hoje] = useState(todayISO);
  const [filtroFunil, setFiltroFunil] = useState<FunilId | "TODOS">("TODOS");
  const [filtroVendedor, setFiltroVendedor] = useState<string>("");

  useEffect(() => setCfg(loadConfig()), []);
  const save = (next: Config) => {
    setCfg(next);
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["plano-metas", cfg.desde, hoje],
    queryFn: () => fetchPlanoMetasFn({ data: { desde: cfg.desde, hoje } }),
    staleTime: 5 * 60_000,
  });

  const eng = useMemo(() => (data ? engine(data, cfg, hoje) : null), [data, cfg, hoje]);

  const diag = useMutation({
    mutationFn: (resumo: string) => diagnosticoPlanoFn({ data: { resumo } }),
  });

  if (isLoading || !eng) {
    return <p className="p-6 text-sm text-muted-foreground">Carregando plano de metas…</p>;
  }

  const funisView = eng.funis.filter((f) => filtroFunil === "TODOS" || f.id === filtroFunil);
  const vendView = eng.vendedores.filter(
    (v) => !filtroVendedor || v.seller.toLowerCase().includes(filtroVendedor.toLowerCase()),
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Plano de Metas até {brDate(cfg.dataFinal)}
          </h1>
          <p className="text-sm text-muted-foreground">
            Acumulado desde {brDate(cfg.desde)} · faltam <strong>{eng.diasRestantes}</strong> dias (
            {num1(eng.semanasRestantes)} semanas)
          </p>
          <p className="text-xs text-muted-foreground">
            Considera apenas leads assumidos pelos 5 vendedores e vendas novas que contam meta (sem
            renovação, Accelerator, Master &amp; Scale e sem leads/vendas de marketing ou gestão).
          </p>
        </div>
        <div className="flex gap-2 flex-wrap text-xs">
          <select
            className="h-8 rounded-md border border-border bg-background px-2"
            value={filtroFunil}
            onChange={(e) => setFiltroFunil(e.target.value as FunilId | "TODOS")}
          >
            <option value="TODOS">Todos os funis</option>
            {IDS.map((id) => (
              <option key={id} value={id}>
                {eng.funis.find((f) => f.id === id)?.label}
              </option>
            ))}
          </select>
          <Input
            placeholder="Filtrar vendedor"
            value={filtroVendedor}
            onChange={(e) => setFiltroVendedor(e.target.value)}
            className="h-8 w-40 text-xs"
          />
        </div>
      </header>

      {/* 18. Definição de meta */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Definição de metas (recalcula tudo automaticamente)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 text-xs items-end">
          {IDS.map((id) => (
            <label key={id} className="flex flex-col gap-1">
              <span className="text-muted-foreground">Meta {eng.funis.find((f) => f.id === id)?.label}</span>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  step="0.1"
                  value={cfg.metas[id]}
                  onChange={(e) => save({ ...cfg, metas: { ...cfg.metas, [id]: Number(e.target.value) } })}
                  className="h-8 w-24 text-xs"
                />
                %
              </div>
            </label>
          ))}
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Data final</span>
            <Input
              type="date"
              value={cfg.dataFinal}
              onChange={(e) => save({ ...cfg, dataFinal: e.target.value })}
              className="h-8 w-36 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Início do acumulado</span>
            <Input
              type="date"
              value={cfg.desde}
              onChange={(e) => save({ ...cfg, desde: e.target.value })}
              className="h-8 w-36 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Vendedores (separados por vírgula)</span>
            <Input
              value={cfg.vendedores.join(", ")}
              onChange={(e) =>
                save({ ...cfg, vendedores: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
              }
              className="h-8 w-72 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Comparecimento %</span>
            <Input
              type="number"
              value={cfg.comparecimento}
              onChange={(e) => save({ ...cfg, comparecimento: Number(e.target.value) })}
              className="h-8 w-20 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Reunião → venda %</span>
            <Input
              type="number"
              value={cfg.fechamento}
              onChange={(e) => save({ ...cfg, fechamento: Number(e.target.value) })}
              className="h-8 w-20 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Reunião → proposta %</span>
            <Input
              type="number"
              value={cfg.proposta}
              onChange={(e) => save({ ...cfg, proposta: Number(e.target.value) })}
              className="h-8 w-20 text-xs"
            />
          </label>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => save(DEFAULT_CONFIG)}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Padrão
          </Button>
        </CardContent>
      </Card>

      {/* 16. Cards executivos */}
      <div className="grid gap-4 md:grid-cols-3">
        {funisView.map((f) => (
          <Card key={f.id}>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center justify-between">
                {f.label}
                <Badge className={`border-0 ${SEM_CLS[f.status]}`}>{SEM_LABEL[f.status]}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">{pct(f.conv)}</span>
                <span className="text-muted-foreground text-xs">atual · meta {pct(f.meta)}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full ${f.atingimento >= 95 ? "bg-emerald-500" : f.atingimento >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${Math.min(100, f.atingimento)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Gap: <strong>{f.gapPP.toFixed(2)} p.p.</strong> · crescimento necessário{" "}
                <strong>{f.conv > 0 ? `${((f.meta / f.conv - 1) * 100).toFixed(0)}%` : "—"}</strong> · meta atingida{" "}
                <strong>{f.atingimento.toFixed(0)}%</strong>
              </p>
              <p className="text-xs">
                {f.vendas} vendas em {f.leads} leads · faltam <strong>{int(f.vendasFaltamAcum)}</strong> vendas para a
                meta no volume atual
              </p>
              <p className="text-xs text-muted-foreground">
                Ritmo necessário: <strong>{num1(f.vendasSemana)}</strong> vendas/semana ({num1(f.vendasDia)}/dia) ·
                ritmo atual {num1(f.ritmoVendasSemanaAtual)}/semana
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 9. Gap + 1. Conversão detalhada */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Gap para a meta e cálculo reverso do funil</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-muted/40 text-muted-foreground">
                {[
                  "Funil",
                  "Leads",
                  "Vendas",
                  "Conv. atual",
                  "Meta",
                  "Gap p.p.",
                  "Vendas necessárias até a data",
                  "Leads necessários (A)",
                  "Reuniões realizadas",
                  "Reuniões a agendar",
                  "Propostas",
                ].map((h) => (
                  <th key={h} className="px-3 py-2 text-right first:text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {funisView.map((f) => (
                <tr key={f.id} className="border-t border-border/40">
                  <td className="px-3 py-2 font-medium">{f.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.leads.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-500">{f.vendas}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(f.conv)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(f.meta)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-500">{f.gapPP.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{int(f.vendasNecessarias)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{int(f.leadsNecessarios)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{int(f.reunioesRealizadas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{int(f.reunioesAgendar)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{int(f.propostas)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                <td className="px-3 py-2">Empresa</td>
                <td className="px-3 py-2 text-right tabular-nums">{eng.total.leads.toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{eng.total.vendas}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(eng.total.conv)}</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right tabular-nums">{int(eng.total.vendasNecessarias)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{int(eng.total.leadsNecessarios)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{int(eng.total.reunioesRealizadas)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{int(eng.total.reunioesAgendar)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{int(eng.total.propostas)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="px-3 py-2 text-[11px] text-muted-foreground">
            (A) Leads necessários = vendas desejadas ÷ meta de conversão. Reuniões/propostas usam as taxas
            configuradas acima (reunião→venda {cfg.fechamento}%, comparecimento {cfg.comparecimento}%,
            reunião→proposta {cfg.proposta}%).
          </p>
        </CardContent>
      </Card>

      {/* 4. Cenários */}
      <div className="grid gap-4 md:grid-cols-3">
        {eng.cenarios.map((c) => (
          <Card key={c.nome}>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">{c.nome}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p className="text-xs text-muted-foreground">{c.desc}</p>
              <p>
                Leads/dia: <strong>{num1(c.leadsDia)}</strong> · até {brDate(cfg.dataFinal)}:{" "}
                <strong>{int(c.leadsPeriodo)}</strong>
              </p>
              <p>
                Vendas projetadas na meta de conversão: <strong>{int(c.vendasProjetadas)}</strong>
              </p>
              <p className={c.atingeMeta ? "text-emerald-500" : "text-red-500"}>
                {c.atingeMeta ? "Suficiente para a meta" : `Faltam ${int(c.faltamVendas)} vendas`}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Onde está o problema?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          {eng.problemas.map((p) => (
            <p key={p}>• {p}</p>
          ))}
        </CardContent>
      </Card>

      {/* 5/6/12. Meta por vendedor */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            Meta por vendedor
            {eng.distribuicaoProvisoria && (
              <Badge className="bg-amber-500/15 text-amber-500 border-0">Meta provisória (divisão igual)</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-muted/40 text-muted-foreground">
                {[
                  "Vendedor",
                  "Leads",
                  "Reuniões",
                  "Propostas",
                  "Vendas",
                  "Conversão",
                  "Meta período",
                  "Gap",
                  "Meta mês",
                  "Meta semana",
                  "Meta dia",
                  "Leads/dia",
                  "Reuniões/dia",
                ].map((h) => (
                  <th key={h} className="px-3 py-2 text-right first:text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vendView.map((v) => (
                <tr key={v.seller} className="border-t border-border/40">
                  <td className="px-3 py-2 font-medium">{v.seller}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{v.leads}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{v.reunioesRealizadas || v.reunioesAgendadas}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{int(v.propostasFeitas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-500">{v.vendas}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(v.conv)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{int(v.metaPeriodo)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={v.gap > 0 ? "text-red-500" : "text-emerald-500"}>
                      {v.gap > 0 ? int(v.gap) : "no alvo"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{int(v.metaMes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{int(v.metaSemana)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num1(v.metaDia)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num1(v.leadsDia)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num1(v.reunioesDia)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                <td className="px-3 py-2">Empresa</td>
                <td className="px-3 py-2 text-right tabular-nums">{eng.total.leads}</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right tabular-nums">{eng.total.vendas}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(eng.total.conv)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{int(eng.total.vendasNecessarias)}</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right tabular-nums">{int(eng.total.vendasMes)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{int(eng.total.vendasSemana)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num1(eng.total.vendasDia)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num1(eng.total.leadsNecessarios / Math.max(1, eng.diasRestantes))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num1(eng.total.reunioesRealizadas / Math.max(1, eng.diasRestantes))}</td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {/* 7. Semanas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Plano semanal até {brDate(cfg.dataFinal)}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-muted/40 text-muted-foreground">
                {["Semana", "Período", "Leads", "Reuniões", "Propostas", "Vendas", "Vendas/vendedor"].map((h) => (
                  <th key={h} className="px-3 py-2 text-right first:text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {eng.semanas.map((s) => (
                <tr key={s.n} className="border-t border-border/40">
                  <td className="px-3 py-2">Semana {s.n}</td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                    {brDate(s.inicio)} – {brDate(s.fim)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{int(s.leads)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{int(s.reunioes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{int(s.propostas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{int(s.vendas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num1(s.vendasPorVendedor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-muted-foreground">
            As semanas restantes são recalculadas a cada novo lead, venda ou dia que passa.
          </p>
        </CardContent>
      </Card>

      {/* 8. Meses */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Plano mensal (realizado x meta)</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-muted/40 text-muted-foreground">
                {[
                  "Mês",
                  "Meta leads",
                  "Meta reuniões",
                  "Meta propostas",
                  "Meta vendas",
                  "Conv. necessária",
                  "Leads realizados",
                  "Vendas realizadas",
                  "Gap vendas",
                ].map((h) => (
                  <th key={h} className="px-3 py-2 text-right first:text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {eng.meses.map((m) => (
                <tr key={m.mes} className="border-t border-border/40">
                  <td className="px-3 py-2 font-medium">{m.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{int(m.metaLeads)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{int(m.metaReunioes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{int(m.metaPropostas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{int(m.metaVendas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(m.convNecessaria)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.leadsReal}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-500">{m.vendasReal}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={m.gap > 0 ? "text-red-500" : "text-emerald-500"}>
                      {m.gap > 0 ? int(m.gap) : "no alvo"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* 11. Diagnóstico IA */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Diagnóstico da IA
            </span>
            <Button size="sm" className="h-8 text-xs" disabled={diag.isPending} onClick={() => diag.mutate(eng.resumo)}>
              {diag.isPending ? "Analisando…" : "Gerar diagnóstico"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm whitespace-pre-wrap">
          {diag.data?.texto ??
            (diag.isError
              ? "Não consegui gerar o diagnóstico agora. Tente de novo."
              : "Clique em “Gerar diagnóstico” para a IA analisar funis, ritmo e vendedores.")}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Motor de cálculo ────────────────────────────────────────────────────────
function engine(data: PlanoMetasData, cfg: Config, hoje: string) {
  const diasRestantes = Math.max(1, daysBetween(hoje, cfg.dataFinal));
  const semanasRestantes = diasRestantes / 7;
  const diasDecorridos = Math.max(1, daysBetween(cfg.desde, hoje));
  const fech = Math.max(1, cfg.fechamento) / 100;
  const comp = Math.max(1, cfg.comparecimento) / 100;
  const prop = Math.max(1, cfg.proposta) / 100;

  const funis = data.funis.map((f) => {
    const meta = cfg.metas[f.id] ?? 0;
    const conv = f.leads > 0 ? (f.vendas / f.leads) * 100 : 0;
    const leadsDiaBase = f.leads30 / 30;
    const leadsFuturos = leadsDiaBase * diasRestantes;
    const leadsFinal = f.leads + leadsFuturos;
    // vendas necessárias para a conversão acumulada atingir a meta na data final
    const vendasNecessarias = Math.max(0, (leadsFinal * meta) / 100 - f.vendas);
    const vendasFaltamAcum = Math.max(0, (f.leads * meta) / 100 - f.vendas);
    const leadsNecessarios = meta > 0 ? vendasNecessarias / (meta / 100) : 0;
    const reunioesRealizadas = vendasNecessarias / fech;
    const reunioesAgendar = reunioesRealizadas / comp;
    const propostas = reunioesRealizadas * prop;
    const vendasDia = vendasNecessarias / diasRestantes;
    const vendasSemana = vendasDia * 7;
    const ritmoVendasSemanaAtual = (f.vendas30 / 30) * 7;
    return {
      ...f,
      meta,
      conv,
      gapPP: meta - conv,
      atingimento: meta > 0 ? (conv / meta) * 100 : 0,
      vendasNecessarias,
      vendasFaltamAcum,
      leadsNecessarios,
      reunioesRealizadas,
      reunioesAgendar,
      propostas,
      vendasDia,
      vendasSemana,
      leadsDiaBase,
      leadsDia7: f.leads7 / 7,
      ritmoVendasSemanaAtual,
      status: semaforo(ritmoVendasSemanaAtual, vendasSemana),
    };
  });

  const sum = (fn: (f: (typeof funis)[number]) => number) => funis.reduce((a, f) => a + fn(f), 0);
  const totalLeads = sum((f) => f.leads);
  const totalVendas = sum((f) => f.vendas);
  const total = {
    leads: totalLeads,
    vendas: totalVendas,
    conv: totalLeads > 0 ? (totalVendas / totalLeads) * 100 : 0,
    vendasNecessarias: sum((f) => f.vendasNecessarias),
    leadsNecessarios: sum((f) => f.leadsNecessarios),
    reunioesRealizadas: sum((f) => f.reunioesRealizadas),
    reunioesAgendar: sum((f) => f.reunioesAgendar),
    propostas: sum((f) => f.propostas),
    vendasDia: sum((f) => f.vendasDia),
    vendasSemana: sum((f) => f.vendasSemana),
    vendasMes: sum((f) => f.vendasDia) * 30,
  };

  // Cenários de volume
  const leadsDia7 = sum((f) => f.leadsDia7);
  const leadsDia30 = sum((f) => f.leadsDiaBase);
  const metaMedia = totalLeads > 0 ? sum((f) => (f.meta * f.leads) / totalLeads) : 5;
  const leadsDiaMeta = total.leadsNecessarios / diasRestantes;
  const cenario = (nome: string, desc: string, leadsDia: number) => {
    const leadsPeriodo = leadsDia * diasRestantes;
    const vendasProjetadas = (leadsPeriodo * metaMedia) / 100;
    const faltamVendas = Math.max(0, total.vendasNecessarias - vendasProjetadas);
    return { nome, desc, leadsDia, leadsPeriodo, vendasProjetadas, faltamVendas, atingeMeta: faltamVendas <= 0 };
  };
  const cenarios = [
    cenario("Conservador", "Ritmo dos últimos 7 dias", leadsDia7),
    cenario("Base", "Média dos últimos 30 dias", leadsDia30),
    cenario("Meta", "Volume necessário para bater a conversão até a data final", leadsDiaMeta),
  ];

  // Diagnóstico rápido de causa
  const problemas: string[] = [];
  if (leadsDia30 < leadsDiaMeta * 0.9)
    problemas.push(
      `Falta volume: entram ${num1(leadsDia30)} leads/dia, seriam necessários ${num1(leadsDiaMeta)}/dia.`,
    );
  const funilPiorConv = [...funis].sort((a, b) => b.gapPP - a.gapPP)[0];
  if (funilPiorConv && funilPiorConv.gapPP > 0)
    problemas.push(
      `Baixa conversão: ${funilPiorConv.label} está ${funilPiorConv.gapPP.toFixed(2)} p.p. abaixo da meta (${pct(funilPiorConv.conv)} vs ${pct(funilPiorConv.meta)}).`,
    );
  const ritmoAtualSemana = sum((f) => f.ritmoVendasSemanaAtual);
  if (ritmoAtualSemana < total.vendasSemana * 0.9)
    problemas.push(
      `Baixa produtividade: ritmo atual ${num1(ritmoAtualSemana)} vendas/semana vs ${num1(total.vendasSemana)} necessárias.`,
    );
  if (problemas.length === 0) problemas.push("Ritmo compatível com a meta. Manter o volume e a conversão atuais.");
  if (problemas.length >= 3) problemas.push("Combinação dos três: volume, conversão e produtividade.");

  // Distribuição por vendedor
  const nomesCfg = cfg.vendedores;
  const base = data.vendedores.filter(
    (v) => nomesCfg.length === 0 || nomesCfg.some((n) => similar(v.seller, n)),
  );
  const lista = base.length > 0 ? base : data.vendedores;
  const pesoTotal = lista.reduce((a, v) => a + v.leads + v.vendas * 10, 0);
  const distribuicaoProvisoria = pesoTotal === 0 || lista.length === 0;
  const nVend = Math.max(1, lista.length || nomesCfg.length);
  const vendedores = (
    lista.length > 0
      ? lista
      : nomesCfg.map((seller) => ({
          seller,
          leads: 0,
          vendas: 0,
          reunioesAgendadas: 0,
          reunioesRealizadas: 0,
          porFunil: { WEBINAR: 0, V3: 0, SESSAO: 0 },
        }))
  ).map((v) => {
    const peso = distribuicaoProvisoria ? 1 / nVend : (v.leads + v.vendas * 10) / pesoTotal;
    const metaPeriodo = total.vendasNecessarias * peso;
    const metaDia = metaPeriodo / diasRestantes;
    const conv = v.leads > 0 ? (v.vendas / v.leads) * 100 : 0;
    const reunioesNec = metaPeriodo / fech;
    return {
      ...v,
      conv,
      peso,
      propostasFeitas: (v.reunioesRealizadas || v.reunioesAgendadas * comp) * prop,
      metaPeriodo,
      gap: metaPeriodo,
      metaMes: metaDia * 30,
      metaSemana: metaDia * 7,
      metaDia,
      leadsDia: (metaPeriodo / (metaMedia / 100 || 1)) / diasRestantes,
      reunioesDia: reunioesNec / diasRestantes,
    };
  });

  // Semanas restantes
  const semanas: {
    n: number;
    inicio: string;
    fim: string;
    leads: number;
    reunioes: number;
    propostas: number;
    vendas: number;
    vendasPorVendedor: number;
  }[] = [];
  const nSemanas = Math.max(1, Math.ceil(diasRestantes / 7));
  for (let i = 0; i < nSemanas; i++) {
    const inicio = addDays(hoje, i * 7);
    const fimRaw = addDays(hoje, Math.min(diasRestantes, (i + 1) * 7 - 1));
    const dias = Math.min(7, diasRestantes - i * 7);
    const fator = dias / diasRestantes;
    semanas.push({
      n: i + 1,
      inicio,
      fim: fimRaw,
      leads: total.leadsNecessarios * fator,
      reunioes: total.reunioesRealizadas * fator,
      propostas: total.propostas * fator,
      vendas: total.vendasNecessarias * fator,
      vendasPorVendedor: (total.vendasNecessarias * fator) / nVend,
    });
  }

  // Meses restantes
  const meses: {
    mes: string;
    label: string;
    metaLeads: number;
    metaReunioes: number;
    metaPropostas: number;
    metaVendas: number;
    convNecessaria: number;
    leadsReal: number;
    vendasReal: number;
    gap: number;
  }[] = [];
  const MESES_PT = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  let cursor = hoje.slice(0, 7);
  const fimMes = cfg.dataFinal.slice(0, 7);
  while (cursor <= fimMes) {
    const [y, m] = cursor.split("-").map(Number);
    const ultimoDia = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const inicioMes = `${cursor}-01`;
    const de = inicioMes > hoje ? inicioMes : hoje;
    const ate = ultimoDia < cfg.dataFinal ? ultimoDia : cfg.dataFinal;
    const dias = Math.max(0, daysBetween(de, ate) + 1);
    const fator = dias / diasRestantes;
    const leadsReal = data.funis.reduce((a, f) => a + (f.meses[cursor]?.leads ?? 0), 0);
    const vendasReal = data.funis.reduce((a, f) => a + (f.meses[cursor]?.vendas ?? 0), 0);
    const metaVendas = total.vendasNecessarias * fator;
    meses.push({
      mes: cursor,
      label: `${MESES_PT[m - 1]} ${y}`,
      metaLeads: total.leadsNecessarios * fator,
      metaReunioes: total.reunioesRealizadas * fator,
      metaPropostas: total.propostas * fator,
      metaVendas,
      convNecessaria: metaMedia,
      leadsReal,
      vendasReal,
      gap: Math.max(0, metaVendas - vendasReal),
    });
    cursor = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }

  const resumo = [
    `Data de hoje: ${hoje}. Data final da meta: ${cfg.dataFinal}. Dias restantes: ${diasRestantes}. Acumulado desde ${cfg.desde} (${diasDecorridos} dias).`,
    ...funis.map(
      (f) =>
        `${f.label}: ${f.leads} leads, ${f.vendas} vendas, conversão ${pct(f.conv)}, meta ${pct(f.meta)}, gap ${f.gapPP.toFixed(2)} p.p., precisa ${int(f.vendasNecessarias)} vendas e ${int(f.leadsNecessarios)} leads até a data, ritmo atual ${num1(f.ritmoVendasSemanaAtual)} vendas/semana vs ${num1(f.vendasSemana)} necessárias, status ${f.status}.`,
    ),
    `Empresa: ${total.leads} leads, ${total.vendas} vendas, conversão ${pct(total.conv)}, precisa ${int(total.vendasNecessarias)} vendas (${num1(total.vendasSemana)}/semana, ${num1(total.vendasDia)}/dia).`,
    `Cenários de leads/dia: conservador ${num1(leadsDia7)}, base ${num1(leadsDia30)}, meta ${num1(leadsDiaMeta)}.`,
    ...vendedores.map(
      (v) =>
        `${v.seller}: ${v.leads} leads, ${v.reunioesAgendadas} reuniões agendadas, ${v.vendas} vendas, conversão ${pct(v.conv)}, meta no período ${int(v.metaPeriodo)} (${num1(v.metaDia)}/dia).`,
    ),
  ].join("\n");

  return {
    diasRestantes,
    semanasRestantes,
    funis,
    total,
    cenarios,
    problemas,
    vendedores,
    distribuicaoProvisoria,
    semanas,
    meses,
    resumo,
  };
}

function similar(a: string, b: string) {
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const x = norm(a);
  const y = norm(b);
  return x.includes(y) || y.includes(x) || x.split(" ")[0] === y.split(" ")[0];
}
