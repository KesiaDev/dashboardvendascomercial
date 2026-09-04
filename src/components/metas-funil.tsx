import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fetchConversaoFunilFn, type ConversaoRow } from "@/lib/conversao-funil.functions";
import { Gauge, RotateCcw, Save, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MetasTrimestreCard } from "@/components/metas-trimestre";


/**
 * Metas de aproveitamento (conversão lead→venda) por funil.
 * Metas do TRIMESTRE definidas pela liderança (agosto/2026):
 *  - WGT - Perpétuo ............. 1,5%
 *  - PIPELINE_COMERCIAL-V3 ...... 10%
 *  - Sessão Estratégica ......... 10%
 *  - Captação (Minicurso, Ebook, Sessão) ... 5% combinado
 */
function normalizeFunnel(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Meta % do trimestre por funil (match por trecho do nome). */
const META_TRIMESTRE_RULES: { match: (n: string) => boolean; meta: number }[] = [
  { match: (n) => n.includes("wgt"), meta: 1.5 },
  { match: (n) => n.includes("pipeline_comercial") || n.includes("pipeline comercial"), meta: 10 },
  { match: (n) => n.includes("sessao estrategica"), meta: 10 },
  { match: (n) => n.includes("minicurso"), meta: 5 },
  { match: (n) => n.includes("ebook"), meta: 5 },
];
const DEFAULT_META_FALLBACK = 4;

function metaTrimestral(funnel: string) {
  const n = normalizeFunnel(funnel);
  return META_TRIMESTRE_RULES.find((r) => r.match(n))?.meta ?? DEFAULT_META_FALLBACK;
}

/** Grupo de captação: meta combinada de 5% (minicurso + ebook + sessão estratégica). */
const CAPTACAO_META = 5;
function isCaptacao(funnel: string) {
  const n = normalizeFunnel(funnel);
  return n.includes("minicurso") || n.includes("ebook") || n.includes("sessao estrategica");
}

const STORE_KEY = "metas-funil-v2";

type Config = {
  baselines: Record<string, number>;
  metas: Record<string, number>; // meta do MÊS por funil (fonte da verdade)
  metasSemana: Record<string, number>; // override opcional da meta da semana
  /** modo de edição das metas: percentual de aproveitamento ou quantidade de vendas */
  modo: "pct" | "qtd";
  metasQtd: Record<string, number>; // meta do MÊS em nº de vendas
  metasQtdSemana: Record<string, number>; // meta da SEMANA em nº de vendas
  metaGeralQtd: number | null; // meta geral em nº de vendas (quando modo = qtd)
  comparecimento: number; // % de reuniões agendadas que acontecem
  fechamento: number; // % de reuniões realizadas que viram venda
  metaGeral: number; // % de aproveitamento alvo somando todos os funis (mês)
  metaCaptacao: number; // % combinado de minicurso + ebook + sessão
  vendedores: number; // nº de vendedores para dividir a meta
};

const DEFAULT_CONFIG: Config = {
  baselines: {},
  metas: {},
  metasSemana: {},
  modo: "pct",
  metasQtd: {},
  metasQtdSemana: {},
  metaGeralQtd: null,
  comparecimento: 48.6,
  fechamento: 33,
  metaGeral: 5,
  metaCaptacao: CAPTACAO_META,
  vendedores: 5,
};



function loadConfig(): Config {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Config) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function fmtPct(v: number) {
  return `${v.toFixed(2)}%`;
}
function ceil(v: number) {
  return Math.ceil(v);
}

function weeksBetween(from: string, to: string) {
  const ms = new Date(`${to}T23:59:59Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.max(1, ms / (7 * 24 * 3600 * 1000));
}

export function MetasFunilCard({ from, to, title, period = "mes" }: { from: string; to: string; title: string; period?: "semana" | "mes" }) {
  const isWeek = period === "semana";
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const [view, setView] = useState<"periodo" | "trimestre">("trimestre");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setCfg(loadConfig()), []);
  /** Altera os valores em tela (recalcula na hora), mas só persiste ao clicar em Salvar. */
  const save = (next: Config) => {
    setCfg(next);
    setDirty(true);
  };
  const persist = () => {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
      setDirty(false);
      setSavedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    } catch {
      /* ignore */
    }
  };


  const { data, isLoading } = useQuery({
    queryKey: ["conversao-funil", from, to],
    queryFn: () => fetchConversaoFunilFn({ data: { from, to } }),
    staleTime: 5 * 60_000,
  });

  const rows = useMemo(() => {
    const map = new Map<string, { funnel: string; leads: number; vendas: number; valor: number }>();
    for (const r of (data ?? []) as ConversaoRow[]) {
      const cur = map.get(r.funnel) ?? { funnel: r.funnel, leads: 0, vendas: 0, valor: 0 };
      cur.leads += r.leads;
      cur.vendas += r.vendas;
      cur.valor += r.valor;
      map.set(r.funnel, cur);
    }
    const semanas = weeksBetween(from, to);
    return Array.from(map.values())
      .map((f) => {
        const baseline = cfg.baselines[f.funnel] ?? metaTrimestral(f.funnel);
        const metaPctMes = cfg.metas[f.funnel] ?? metaTrimestral(f.funnel);

        // Na visão semanal usa a meta da semana (herda a do mês salvo override); na mensal usa a do mês
        const metaPct = isWeek ? (cfg.metasSemana[f.funnel] ?? metaPctMes) : metaPctMes;
        const real = f.leads > 0 ? (f.vendas / f.leads) * 100 : 0;

        // Meta em quantidade de vendas: ou digitada direto, ou derivada do %
        const qtdMes = cfg.metasQtd[f.funnel] ?? ceil((f.leads * metaPctMes) / 100);
        const qtdSemana = cfg.metasQtdSemana[f.funnel] ?? qtdMes;
        const isQtd = cfg.modo === "qtd";
        const vendasMeta = isQtd
          ? (isWeek ? qtdSemana : qtdMes)
          : ceil((f.leads * metaPct) / 100);
        // Quando a meta é em quantidade, o % passa a ser derivado dela
        const meta = isQtd ? (f.leads > 0 ? (vendasMeta / f.leads) * 100 : 0) : metaPct;
        const metaMes = isQtd ? (f.leads > 0 ? (qtdMes / f.leads) * 100 : 0) : metaPctMes;

        const gap = f.vendas - vendasMeta;
        // Reuniões necessárias: vendas alvo ÷ taxa de fechamento, e agendamentos ÷ comparecimento
        const reunioesRealizadas = ceil(cfg.fechamento > 0 ? vendasMeta / (cfg.fechamento / 100) : 0);
        const agendamentos = ceil(cfg.comparecimento > 0 ? reunioesRealizadas / (cfg.comparecimento / 100) : 0);
        return {
          ...f,
          baseline,
          metaMes,
          meta,
          qtdMes,
          qtdSemana,
          real,
          vendasMeta,
          gap,
          atingimento: meta > 0 ? (real / meta) * 100 : 0,
          reunioesSemana: isWeek ? ceil(reunioesRealizadas / semanas) : reunioesRealizadas,
          agendamentosSemana: isWeek ? ceil(agendamentos / semanas) : agendamentos,
        };
      })

      .filter((f) => f.leads > 0 || f.vendas > 0)
      .sort((a, b) => b.leads - a.leads);
  }, [data, cfg, from, to, isWeek]);

  const totals = rows.reduce(
    (a, r) => ({
      leads: a.leads + r.leads,
      vendas: a.vendas + r.vendas,
      vendasMeta: a.vendasMeta + r.vendasMeta,
      reunioesSemana: a.reunioesSemana + r.reunioesSemana,
      agendamentosSemana: a.agendamentosSemana + r.agendamentosSemana,
    }),
    { leads: 0, vendas: 0, vendasMeta: 0, reunioesSemana: 0, agendamentosSemana: 0 },
  );

  const statusBadge = (atg: number) => {
    if (atg >= 100) return <Badge className="bg-success/15 text-success-fg border-0">No alvo</Badge>;
    if (atg >= 70) return <Badge className="bg-warning/15 text-warning-fg border-0">Atenção</Badge>;
    return <Badge className="bg-destructive/15 text-destructive-fg border-0">Abaixo</Badge>;
  };

  const toggle = (
    <div className="inline-flex rounded-md border border-border p-0.5">
      {(["periodo", "trimestre"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setView(v)}
          className={`px-2.5 py-1 text-[11px] rounded-sm transition-colors ${
            view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {v === "periodo" ? (isWeek ? "Semana" : "Mês") : "Trimestre"}
        </button>
      ))}
    </div>
  );

  if (view === "trimestre") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="text-sm font-semibold flex items-center gap-1.5 transition-opacity hover:opacity-80"
          >
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`} />
            <Gauge className="h-4 w-4 text-muted-foreground" />
            Meta de Aproveitamento — visão trimestral
          </button>
          <div className="flex items-center gap-2">
            {collapsed && (
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="rounded-md border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted"
              >
                Mostrar
              </button>
            )}
            {toggle}
          </div>
        </div>
        {!collapsed && <MetasTrimestreCard refDate={to} />}
      </div>
    );
  }

  return (
    <Card className={collapsed ? "overflow-hidden" : "overflow-hidden"}>

      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="text-base font-semibold tracking-tight flex items-center gap-2 transition-opacity hover:opacity-80"
          >
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`} />
            <Gauge className="h-4 w-4 text-primary" />
            {title}
          </button>
          <div className="flex items-center gap-3 flex-wrap text-xs">
            <label className="flex items-center gap-1 text-muted-foreground">
              Comparecimento
              <Input
                type="number"
                value={cfg.comparecimento}
                onChange={(e) => save({ ...cfg, comparecimento: Number(e.target.value) })}
                className="h-7 w-16 text-xs"
              />
              %
            </label>
            <label className="flex items-center gap-1 text-muted-foreground">
              Fechamento reunião
              <Input
                type="number"
                value={cfg.fechamento}
                onChange={(e) => save({ ...cfg, fechamento: Number(e.target.value) })}
                className="h-7 w-16 text-xs"
              />
              %
            </label>
            <label className="flex items-center gap-1 text-muted-foreground">
              Vendedores
              <Input
                type="number"
                min={1}
                value={cfg.vendedores}
                onChange={(e) => save({ ...cfg, vendedores: Math.max(1, Number(e.target.value) || 1) })}
                className="h-7 w-14 text-xs"
              />
            </label>
            <div className="inline-flex rounded-md border border-border p-0.5" title="Definir as metas em % de aproveitamento ou em quantidade de vendas">
              {(["pct", "qtd"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => save({ ...cfg, modo: m })}
                  className={`px-2.5 py-1 text-[11px] rounded-sm transition-colors ${
                    cfg.modo === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {m === "pct" ? "Meta em %" : "Meta em vendas"}
                </button>
              ))}
            </div>
            {collapsed ? (
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="rounded-md border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted"
              >
                Mostrar
              </button>
            ) : (
              <>
                {toggle}
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => save(DEFAULT_CONFIG)}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Metas do trimestre
                </Button>
                <Button size="sm" className="h-7 text-xs" disabled={!dirty} onClick={persist}>
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {dirty ? "Salvar metas" : "Salvo"}
                </Button>
                {dirty ? (
                  <span className="text-[11px] text-warning-fg">alterações não salvas</span>
                ) : savedAt ? (
                  <span className="text-[11px] text-success-fg">salvo às {savedAt}</span>
                ) : null}
              </>
            )}

          </div>
        </div>
      </CardHeader>
      {!collapsed && <CardContent className="p-0">
        {isLoading ? (
          <p className="text-sm text-muted-foreground px-4 py-6">Carregando metas…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground px-4 py-6">Sem dados no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[11%]" />
                <col className="w-[9%]" />
                <col className="w-[17%]" />
                <col className="w-[8%]" />
                <col className="w-[7%]" />
              </colgroup>
              <thead>
                <tr className="border-t border-border bg-muted/30 align-bottom">
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    Funil
                  </th>
                  <th className="px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap border-l border-border/40">Leads</th>
                  <th className="px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Vendas</th>
                  <th className="px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap border-l border-border/40">
                    {cfg.modo === "qtd"
                      ? isWeek ? "Meta vendas semana" : "Meta vendas mês"
                      : isWeek ? "Meta % semana" : "Meta % mês"}
                  </th>

                  <th className="px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Realizado</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Atingimento</th>
                  <th className="px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap border-l border-border/40">Vendas meta</th>
                  <th className="px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Faltam</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r) => (
                  <tr key={r.funnel} className="border-t border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-3 font-medium text-[13px] whitespace-nowrap truncate" title={r.funnel}>{r.funnel}</td>
                    <td className="px-2 py-3 text-right tabular-nums text-base font-semibold border-l border-border/30">{r.leads}</td>
                    <td className="px-2 py-3 text-right tabular-nums text-base font-bold text-success-fg">{r.vendas}</td>
                    <td className="px-2 py-3 text-right border-l border-border/30">
                      {cfg.modo === "qtd" ? (
                        <>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={
                              drafts[`q:${r.funnel}`] ??
                              String(isWeek ? r.qtdSemana : r.qtdMes)
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              setDrafts((d) => ({ ...d, [`q:${r.funnel}`]: v }));
                              const n = Math.max(0, Math.round(Number(v.replace(",", "."))));
                              if (v.trim() !== "" && Number.isFinite(n)) {
                                if (isWeek) {
                                  save({ ...cfg, metasQtdSemana: { ...cfg.metasQtdSemana, [r.funnel]: n } });
                                } else {
                                  const semana = { ...cfg.metasQtdSemana };
                                  delete semana[r.funnel];
                                  save({ ...cfg, metasQtd: { ...cfg.metasQtd, [r.funnel]: n }, metasQtdSemana: semana });
                                }
                              }
                            }}
                            onBlur={() => setDrafts((d) => { const n = { ...d }; delete n[`q:${r.funnel}`]; return n; })}
                            className={`h-7 w-full text-xs text-right ${isWeek && cfg.metasQtdSemana[r.funnel] != null ? "border-warning" : ""}`}
                          />
                          <span className="block text-[9px] opacity-60">= {fmtPct(r.meta)}</span>
                        </>
                      ) : isWeek ? (
                        <>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={drafts[`s:${r.funnel}`] ?? String(Number(r.meta.toFixed(2)))}
                            onChange={(e) => {
                              const v = e.target.value;
                              setDrafts((d) => ({ ...d, [`s:${r.funnel}`]: v }));
                              const n = Number(v.replace(",", "."));
                              if (v.trim() !== "" && Number.isFinite(n)) {
                                save({ ...cfg, metasSemana: { ...cfg.metasSemana, [r.funnel]: n } });
                              }
                            }}
                            onBlur={() => setDrafts((d) => { const n = { ...d }; delete n[`s:${r.funnel}`]; return n; })}
                            className={`h-7 w-full text-xs text-right ${cfg.metasSemana[r.funnel] != null ? "border-warning" : ""}`}
                          />
                          {cfg.metasSemana[r.funnel] != null && (
                            <button
                              type="button"
                              className="block ml-auto text-[9px] text-warning-fg hover:underline"
                              onClick={() => {
                                const semana = { ...cfg.metasSemana };
                                delete semana[r.funnel];
                                save({ ...cfg, metasSemana: semana });
                                setDrafts((d) => { const n = { ...d }; delete n[`s:${r.funnel}`]; return n; });
                              }}
                            >
                              voltar ao mês
                            </button>
                          )}
                        </>
                      ) : (
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={drafts[`m:${r.funnel}`] ?? String(Number(r.metaMes.toFixed(2)))}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDrafts((d) => ({ ...d, [`m:${r.funnel}`]: v }));
                            const n = Number(v.replace(",", "."));
                            if (v.trim() !== "" && Number.isFinite(n)) {
                              const semana = { ...cfg.metasSemana };
                              delete semana[r.funnel];
                              save({ ...cfg, metas: { ...cfg.metas, [r.funnel]: n }, metasSemana: semana });
                            }
                          }}
                          onBlur={() => setDrafts((d) => { const n = { ...d }; delete n[`m:${r.funnel}`]; return n; })}
                          className="h-7 w-full text-xs text-right"
                        />
                      )}
                    </td>

                    <td className="px-2 py-3 text-right tabular-nums text-base font-bold">{fmtPct(r.real)}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden min-w-0">
                          <div
                            className={`h-full rounded-full transition-all ${r.atingimento >= 100 ? "bg-success" : r.atingimento >= 70 ? "bg-warning" : "bg-destructive"}`}
                            style={{ width: `${Math.min(100, r.atingimento)}%` }}
                          />
                        </div>
                        {statusBadge(r.atingimento)}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums text-base font-semibold border-l border-border/30">{r.vendasMeta.toFixed(0)}</td>
                    <td className="px-2 py-3 text-right tabular-nums text-base">
                      {r.gap >= 0 ? (
                        <span className="text-success-fg font-medium">✓</span>
                      ) : (
                        <span className="text-destructive-fg font-medium">{Math.abs(r.gap).toFixed(0)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40 font-bold text-base">
                  <td className="px-3 py-3 text-[13px] uppercase tracking-wide">Total</td>
                  <td className="px-2 py-3 text-right tabular-nums">{totals.leads}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-success-fg">{totals.vendas}</td>
                  <td className="px-1.5 py-2" />
                  <td className="px-1.5 py-2 text-right tabular-nums">
                    {fmtPct(totals.leads > 0 ? (totals.vendas / totals.leads) * 100 : 0)}
                  </td>
                  <td className="px-2 py-2" />
                  <td className="px-2 py-3 text-right tabular-nums">{totals.vendasMeta.toFixed(0)}</td>
                  <td className="px-1.5 py-2 text-right tabular-nums">
                    {Math.max(0, totals.vendasMeta - totals.vendas)}
                  </td>
                </tr>
              </tfoot>
            </table>
            {(() => {
              const isQtd = cfg.modo === "qtd";
              const realGeral = totals.leads > 0 ? (totals.vendas / totals.leads) * 100 : 0;
              const qtdGeral = isQtd
                ? (cfg.metaGeralQtd ?? (totals.vendasMeta || ceil((totals.leads * cfg.metaGeral) / 100)))
                : ceil((totals.leads * cfg.metaGeral) / 100);
              const metaGeral = isQtd
                ? (totals.leads > 0 ? (qtdGeral / totals.leads) * 100 : 0)
                : cfg.metaGeral;
              const atgGeral = metaGeral > 0 ? (realGeral / metaGeral) * 100 : 0;
              const vendasNecessarias = qtdGeral;
              const faltam = vendasNecessarias - totals.vendas;
              return (
                <div className="px-4 py-3 border-t border-border space-y-2 bg-muted/20">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Meta geral (todos os funis juntos)
                    </span>
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      Meta
                      <Input
                        type="text"
                        inputMode={isQtd ? "numeric" : "decimal"}
                        value={drafts.__geral ?? String(isQtd ? qtdGeral : cfg.metaGeral)}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDrafts((d) => ({ ...d, __geral: v }));
                          const n = Number(v.replace(",", "."));
                          if (v.trim() !== "" && Number.isFinite(n)) {
                            if (isQtd) save({ ...cfg, metaGeralQtd: Math.max(0, Math.round(n)) });
                            else save({ ...cfg, metaGeral: n });
                          }
                        }}
                        onBlur={() => setDrafts((d) => { const n = { ...d }; delete n.__geral; return n; })}
                        className="h-7 w-20 text-xs text-right"
                      />
                      {isQtd ? "vendas" : "%"}
                    </label>
                    {statusBadge(atgGeral)}

                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Meta de aproveitamento</p>
                      <p className="text-2xl font-bold tabular-nums tracking-tight">{fmtPct(metaGeral)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Realizado</p>
                      <p className="text-2xl font-bold tabular-nums tracking-tight">{fmtPct(realGeral)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Atingimento da meta</p>
                      <p className="text-2xl font-bold tabular-nums tracking-tight">{atgGeral.toFixed(0)}%</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Vendas necessárias</p>
                      <p className="text-2xl font-bold tabular-nums tracking-tight">
                        {vendasNecessarias.toFixed(0)}
                        <span className={`ml-1 text-xs ${faltam > 0 ? "text-destructive-fg" : "text-success-fg"}`}>
                          ({faltam > 0 ? `faltam ${faltam.toFixed(0)}` : `+${Math.abs(faltam).toFixed(0)}`})
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full ${atgGeral >= 100 ? "bg-success" : atgGeral >= 70 ? "bg-warning" : "bg-destructive"}`}
                      style={{ width: `${Math.min(100, atgGeral)}%` }}
                    />
                  </div>



                </div>
              );
            })()}
          </div>
        )}
      </CardContent>}
    </Card>
  );
}
