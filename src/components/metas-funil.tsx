import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fetchConversaoFunilFn, type ConversaoRow } from "@/lib/conversao-funil.functions";
import { Gauge, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export function MetasFunilCard({ from, to, title }: { from: string; to: string; title: string }) {
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
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
        const metaMes = cfg.metas[f.funnel] ?? metaTrimestral(f.funnel);

        // A meta da semana herda a do mês (mesma taxa de aproveitamento), salvo override manual
        const meta = cfg.metasSemana[f.funnel] ?? metaMes;
        const real = f.leads > 0 ? (f.vendas / f.leads) * 100 : 0;
        const vendasMeta = ceil((f.leads * meta) / 100);
        const gap = f.vendas - vendasMeta;
        // Reuniões necessárias: vendas alvo ÷ taxa de fechamento, e agendamentos ÷ comparecimento
        const reunioesRealizadas = ceil(cfg.fechamento > 0 ? vendasMeta / (cfg.fechamento / 100) : 0);
        const agendamentos = ceil(cfg.comparecimento > 0 ? reunioesRealizadas / (cfg.comparecimento / 100) : 0);
        return {
          ...f,
          baseline,
          metaMes,
          meta,
          real,
          vendasMeta,
          gap,
          atingimento: meta > 0 ? (real / meta) * 100 : 0,
          reunioesSemana: ceil(reunioesRealizadas / semanas),
          agendamentosSemana: ceil(agendamentos / semanas),
        };
      })
      .filter((f) => f.leads > 0 || f.vendas > 0)
      .sort((a, b) => b.leads - a.leads);
  }, [data, cfg, from, to]);

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
    if (atg >= 100) return <Badge className="bg-emerald-500/15 text-emerald-500 border-0">No alvo</Badge>;
    if (atg >= 70) return <Badge className="bg-amber-500/15 text-amber-500 border-0">Atenção</Badge>;
    return <Badge className="bg-red-500/15 text-red-500 border-0">Abaixo</Badge>;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            {title}
          </CardTitle>
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
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => save(DEFAULT_CONFIG)}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Metas do trimestre
            </Button>
            <Button size="sm" className="h-7 text-xs" disabled={!dirty} onClick={persist}>
              <Save className="h-3.5 w-3.5 mr-1" />
              {dirty ? "Salvar metas" : "Salvo"}
            </Button>
            {dirty ? (
              <span className="text-[11px] text-amber-500">alterações não salvas</span>
            ) : savedAt ? (
              <span className="text-[11px] text-emerald-500">salvo às {savedAt}</span>
            ) : null}

          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="text-sm text-muted-foreground px-4 py-6">Carregando metas…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground px-4 py-6">Sem dados no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs table-fixed">
              <colgroup>
                <col className="w-[17%]" />
                <col className="w-[6%]" />
                <col className="w-[6%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[8%]" />
                <col className="w-[16%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[13%]" />
              </colgroup>
              <thead>
                <tr className="border-t border-border bg-muted/40 align-bottom">
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                    Funil
                  </th>
                  <th className="px-1.5 py-2 text-right font-medium text-muted-foreground whitespace-nowrap border-l border-border/40">Leads</th>
                  <th className="px-1.5 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Vendas</th>
                  <th className="px-1.5 py-2 text-right font-medium text-muted-foreground whitespace-nowrap border-l border-border/40">
                    Meta % mês
                  </th>
                  <th className="px-1.5 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">
                    Meta % sem
                  </th>
                  <th className="px-1.5 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Realizado</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Atingimento</th>
                  <th className="px-1.5 py-2 text-right font-medium text-muted-foreground whitespace-nowrap border-l border-border/40">Vendas meta</th>
                  <th className="px-1.5 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Faltam</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap border-l border-border/40">
                    Reuniões/semana
                    <span className="block text-[9px] font-normal opacity-70">realizar · agendar</span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r) => (
                  <tr key={r.funnel} className="border-t border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="px-2 py-2 font-medium whitespace-nowrap truncate" title={r.funnel}>{r.funnel}</td>
                    <td className="px-1.5 py-2 text-right tabular-nums border-l border-border/30">{r.leads}</td>
                    <td className="px-1.5 py-2 text-right tabular-nums text-emerald-500 font-medium">{r.vendas}</td>
                    <td className="px-1 py-2 text-right border-l border-border/30">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={drafts[`m:${r.funnel}`] ?? String(Number(r.metaMes.toFixed(2)))}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDrafts((d) => ({ ...d, [`m:${r.funnel}`]: v }));
                          const n = Number(v.replace(",", "."));
                          if (v.trim() !== "" && Number.isFinite(n)) {
                            // Alterar a meta do mês recalcula a semana (remove override)
                            const semana = { ...cfg.metasSemana };
                            delete semana[r.funnel];
                            save({ ...cfg, metas: { ...cfg.metas, [r.funnel]: n }, metasSemana: semana });
                          }
                        }}
                        onBlur={() => setDrafts((d) => { const n = { ...d }; delete n[`m:${r.funnel}`]; return n; })}
                        className="h-7 w-full text-xs text-right"
                      />
                    </td>
                    <td className="px-1 py-2 text-right">
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
                        className={`h-7 w-full text-xs text-right ${cfg.metasSemana[r.funnel] != null ? "border-amber-500" : ""}`}
                      />
                      {cfg.metasSemana[r.funnel] != null && (
                        <button
                          type="button"
                          className="block ml-auto text-[9px] text-amber-500 hover:underline"
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
                    </td>
                    <td className="px-1.5 py-2 text-right tabular-nums font-semibold">{fmtPct(r.real)}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden min-w-0">
                          <div
                            className={`h-full ${r.atingimento >= 100 ? "bg-emerald-500" : r.atingimento >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${Math.min(100, r.atingimento)}%` }}
                          />
                        </div>
                        {statusBadge(r.atingimento)}
                      </div>
                    </td>
                    <td className="px-1.5 py-2 text-right tabular-nums border-l border-border/30">{r.vendasMeta.toFixed(0)}</td>
                    <td className="px-1.5 py-2 text-right tabular-nums">
                      {r.gap >= 0 ? (
                        <span className="text-emerald-500 font-medium">✓</span>
                      ) : (
                        <span className="text-red-500 font-medium">{Math.abs(r.gap).toFixed(0)}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums border-l border-border/30 leading-tight">
                      <span className="text-emerald-500">{r.reunioesSemana.toFixed(0)}</span>
                      <span className="text-muted-foreground mx-1">·</span>
                      <span className="text-sky-500">{r.agendamentosSemana.toFixed(0)}</span>
                      <span className="block text-[9px] opacity-60">
                        {ceil(r.reunioesSemana / cfg.vendedores)}/{ceil(r.agendamentosSemana / cfg.vendedores)} por vendedor
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className="px-2 py-2">Total</td>
                  <td className="px-1.5 py-2 text-right tabular-nums">{totals.leads}</td>
                  <td className="px-1.5 py-2 text-right tabular-nums">{totals.vendas}</td>
                  <td className="px-1.5 py-2" />
                  <td className="px-1.5 py-2" />
                  <td className="px-1.5 py-2 text-right tabular-nums">
                    {fmtPct(totals.leads > 0 ? (totals.vendas / totals.leads) * 100 : 0)}
                  </td>
                  <td className="px-2 py-2" />
                  <td className="px-1.5 py-2 text-right tabular-nums">{totals.vendasMeta.toFixed(0)}</td>
                  <td className="px-1.5 py-2 text-right tabular-nums">
                    {Math.max(0, totals.vendasMeta - totals.vendas)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums leading-tight">
                    <span className="text-emerald-500">{totals.reunioesSemana.toFixed(0)}</span>
                    <span className="text-muted-foreground mx-1">·</span>
                    <span className="text-sky-500">{totals.agendamentosSemana.toFixed(0)}</span>
                    <span className="block text-[9px] font-normal opacity-60">
                      {ceil(totals.reunioesSemana / cfg.vendedores)}/{ceil(totals.agendamentosSemana / cfg.vendedores)} por vendedor
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
            {(() => {
              const realGeral = totals.leads > 0 ? (totals.vendas / totals.leads) * 100 : 0;
              const metaGeral = cfg.metaGeral;
              const atgGeral = metaGeral > 0 ? (realGeral / metaGeral) * 100 : 0;
              const vendasNecessarias = ceil((totals.leads * metaGeral) / 100);
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
                        inputMode="decimal"
                        value={drafts.__geral ?? String(cfg.metaGeral)}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDrafts((d) => ({ ...d, __geral: v }));
                          const n = Number(v.replace(",", "."));
                          if (v.trim() !== "" && Number.isFinite(n)) save({ ...cfg, metaGeral: n });
                        }}
                        onBlur={() => setDrafts((d) => { const n = { ...d }; delete n.__geral; return n; })}
                        className="h-7 w-20 text-xs text-right"
                      />
                      %
                    </label>
                    {statusBadge(atgGeral)}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Meta de aproveitamento</p>
                      <p className="text-lg font-semibold tabular-nums">{fmtPct(metaGeral)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Realizado</p>
                      <p className="text-lg font-semibold tabular-nums">{fmtPct(realGeral)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Atingimento da meta</p>
                      <p className="text-lg font-semibold tabular-nums">{atgGeral.toFixed(0)}%</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Vendas necessárias</p>
                      <p className="text-lg font-semibold tabular-nums">
                        {vendasNecessarias.toFixed(0)}
                        <span className={`ml-1 text-xs ${faltam > 0 ? "text-red-500" : "text-emerald-500"}`}>
                          ({faltam > 0 ? `faltam ${faltam.toFixed(0)}` : `+${Math.abs(faltam).toFixed(0)}`})
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full ${atgGeral >= 100 ? "bg-emerald-500" : atgGeral >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${Math.min(100, atgGeral)}%` }}
                    />
                  </div>
                  {(() => {
                    const cap = rows.filter((r) => isCaptacao(r.funnel));
                    if (cap.length === 0) return null;
                    const leads = cap.reduce((a, r) => a + r.leads, 0);
                    const vendas = cap.reduce((a, r) => a + r.vendas, 0);
                    const real = leads > 0 ? (vendas / leads) * 100 : 0;
                    const meta = cfg.metaCaptacao;
                    const atg = meta > 0 ? (real / meta) * 100 : 0;
                    const alvo = ceil((leads * meta) / 100);
                    const faltamCap = alvo - vendas;
                    return (
                      <div className="rounded-md border border-border/60 bg-background/60 p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Captação combinada · Minicurso + Ebook + Sessão Estratégica
                          </span>
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            Meta
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={drafts.__cap ?? String(cfg.metaCaptacao)}
                              onChange={(e) => {
                                const v = e.target.value;
                                setDrafts((d) => ({ ...d, __cap: v }));
                                const n = Number(v.replace(",", "."));
                                if (v.trim() !== "" && Number.isFinite(n)) save({ ...cfg, metaCaptacao: n });
                              }}
                              onBlur={() => setDrafts((d) => { const n = { ...d }; delete n.__cap; return n; })}
                              className="h-7 w-20 text-xs text-right"
                            />
                            %
                          </label>
                          {statusBadge(atg)}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <p className="text-[11px] text-muted-foreground">Leads de captação</p>
                            <p className="text-lg font-semibold tabular-nums">{leads}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-muted-foreground">Vendas</p>
                            <p className="text-lg font-semibold tabular-nums">{vendas}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-muted-foreground">Realizado</p>
                            <p className="text-lg font-semibold tabular-nums">{fmtPct(real)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-muted-foreground">Vendas necessárias</p>
                            <p className="text-lg font-semibold tabular-nums">
                              {alvo}
                              <span className={`ml-1 text-xs ${faltamCap > 0 ? "text-red-500" : "text-emerald-500"}`}>
                                ({faltamCap > 0 ? `faltam ${faltamCap}` : `+${Math.abs(faltamCap)}`})
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full ${atg >= 100 ? "bg-emerald-500" : atg >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${Math.min(100, atg)}%` }}
                          />
                        </div>
                        <div className="grid gap-1">
                          {cap.map((r) => (
                            <div key={r.funnel} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground truncate">{r.funnel}</span>
                              <span className="tabular-nums">
                                {r.vendas}/{r.leads} · {fmtPct(r.real)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="rounded-md border border-border/60 bg-background/60 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Por vendedor · time de {cfg.vendedores} (divisão igual)
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <p className="text-[11px] text-muted-foreground">Vendas na semana</p>
                        <p className="text-lg font-semibold tabular-nums">
                          {ceil(totals.vendasMeta / cfg.vendedores)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Faltam vender</p>
                        <p className="text-lg font-semibold tabular-nums">
                          {ceil(Math.max(0, totals.vendasMeta - totals.vendas) / cfg.vendedores)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Reuniões a realizar/semana</p>
                        <p className="text-lg font-semibold tabular-nums">
                          {ceil(totals.reunioesSemana / cfg.vendedores)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Reuniões a agendar/semana</p>
                        <p className="text-lg font-semibold tabular-nums">
                          {ceil(totals.agendamentosSemana / cfg.vendedores)}
                        </p>
                      </div>
                    </div>
                  </div>

                </div>
              );
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
