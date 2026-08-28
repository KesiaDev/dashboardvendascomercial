import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Save, RotateCcw, TrendingUp } from "lucide-react";
import { fetchConversaoFunilFn, type ConversaoRow } from "@/lib/conversao-funil.functions";
import { fetchOrigemV3ResumoFn } from "@/lib/origem-v3-resumo.functions";

/* ------------------------------------------------------------------ */
/* Funis acompanhados na visão trimestral                              */
/* ------------------------------------------------------------------ */

export type FunilTriId = "WGT" | "MINICURSO" | "EBOOK" | "SESSAO";

/**
 * WGT vem do funil da Clint. Minicurso, Ebook e Sessão Estratégica vêm das TAGS
 * reais dos contatos dentro do PIPELINE_COMERCIAL-V3 (levantadas de mão).
 */
const FUNIS: {
  id: FunilTriId;
  label: string;
  metaTri: number;
  /** funil da Clint (só WGT) */
  match?: (n: string) => boolean;
  /** origem/tag no card "Origem dos leads V3" */
  origem?: string;
}[] = [
  { id: "WGT", label: "WGT – Perpétuo", metaTri: 1.5, match: (n) => n.includes("wgt") || n.includes("webinar") },
  { id: "MINICURSO", label: "Minicurso V3", metaTri: 5, origem: "minicurso" },
  { id: "EBOOK", label: "Ebook V3", metaTri: 5, origem: "ebook" },
  { id: "SESSAO", label: "Sessão Estratégica (funil + V3)", metaTri: 10, origem: "sessao estrategica" },
];

/**
 * Peso de cada mês do trimestre. A média dos 3 pesos é 1, então a meta média
 * do trimestre continua sendo exatamente a meta trimestral definida.
 * Padrão: mês 1 e mês 3 mais fortes, mês 2 (férias) mais leve.
 */
const PESOS_PADRAO: [number, number, number] = [1.15, 0.75, 1.1];


function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function funilId(funnel: string): FunilTriId | null {
  const n = norm(funnel);
  return FUNIS.find((f) => f.match?.(n))?.id ?? null;
}

/* ------------------------------------------------------------------ */
/* Config editável                                                     */
/* ------------------------------------------------------------------ */

const STORE_KEY = "metas-trimestre-v2";

type TriConfig = {
  metaTri: Record<FunilTriId, number>;
  /** meta do trimestre em nº de vendas (usada quando modo = "qtd") */
  metaTriQtd: Record<FunilTriId, number>;
  /** modo de edição da meta trimestral */
  modo: "pct" | "qtd";
  rampa: Record<FunilTriId, [number, number, number]>;
};

const DEFAULT_TRI: TriConfig = {
  metaTri: { WGT: 1.5, MINICURSO: 5, EBOOK: 5, SESSAO: 10 },
  metaTriQtd: { WGT: 12, MINICURSO: 25, EBOOK: 25, SESSAO: 40 },
  modo: "pct",
  rampa: { ...RAMPA_PADRAO },
};

function loadTri(): TriConfig {
  if (typeof window === "undefined") return DEFAULT_TRI;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return DEFAULT_TRI;
    const p = JSON.parse(raw) as Partial<TriConfig>;
    return {
      metaTri: { ...DEFAULT_TRI.metaTri, ...(p.metaTri ?? {}) },
      metaTriQtd: { ...DEFAULT_TRI.metaTriQtd, ...(p.metaTriQtd ?? {}) },
      modo: p.modo === "qtd" ? "qtd" : "pct",
      rampa: { ...DEFAULT_TRI.rampa, ...(p.rampa ?? {}) },
    };
  } catch {
    return DEFAULT_TRI;
  }
}

/* ------------------------------------------------------------------ */
/* Datas do trimestre                                                  */
/* ------------------------------------------------------------------ */

const MES_LABEL = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function monthEnd(year: number, month0: number) {
  return new Date(Date.UTC(year, month0 + 1, 0)).toISOString().slice(0, 10);
}

function quarterInfo(refISO: string) {
  const d = new Date(`${refISO}T00:00:00Z`);
  const year = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3);
  const months = [0, 1, 2].map((i) => {
    const m0 = q * 3 + i;
    return {
      m0,
      label: MES_LABEL[m0],
      short: MES_LABEL[m0].slice(0, 3),
      from: `${year}-${String(m0 + 1).padStart(2, "0")}-01`,
      to: monthEnd(year, m0),
    };
  });
  const hoje = refISO;
  const inicio = months[0].from;
  const fim = months[2].to;
  const diasTotais = Math.round(
    (new Date(`${fim}T00:00:00Z`).getTime() - new Date(`${inicio}T00:00:00Z`).getTime()) / 86400000 + 1,
  );
  const diasCorridos = Math.min(
    diasTotais,
    Math.max(
      1,
      Math.round(
        (new Date(`${hoje}T00:00:00Z`).getTime() - new Date(`${inicio}T00:00:00Z`).getTime()) / 86400000 + 1,
      ),
    ),
  );
  return { year, q: q + 1, months, inicio, fim, diasTotais, diasCorridos, diasRestantes: Math.max(0, diasTotais - diasCorridos) };
}

/* ------------------------------------------------------------------ */

const pct = (v: number) => `${v.toFixed(2)}%`;

function statusOf(proj: number, meta: number): "ok" | "atencao" | "risco" {
  if (meta <= 0) return "ok";
  const r = proj / meta;
  if (r >= 1) return "ok";
  if (r >= 0.85) return "atencao";
  return "risco";
}

const STATUS_UI = {
  ok: { dot: "🟢", label: "No ritmo", cls: "bg-emerald-500/15 text-emerald-500", bar: "bg-emerald-500" },
  atencao: { dot: "🟡", label: "Atenção", cls: "bg-amber-500/15 text-amber-500", bar: "bg-amber-500" },
  risco: { dot: "🔴", label: "Abaixo do ritmo", cls: "bg-red-500/15 text-red-500", bar: "bg-red-500" },
} as const;

export function MetasTrimestreCard({ refDate, title }: { refDate: string; title?: string }) {
  const qi = useMemo(() => quarterInfo(refDate), [refDate]);
  const [cfg, setCfg] = useState<TriConfig>(DEFAULT_TRI);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => setCfg(loadTri()), []);

  const change = (next: TriConfig) => {
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

  const results = useQueries({
    queries: qi.months.map((m) => ({
      queryKey: ["conversao-funil", m.from, m.to > refDate ? refDate : m.to],
      queryFn: () => fetchConversaoFunilFn({ data: { from: m.from, to: m.to > refDate ? refDate : m.to } }),
      staleTime: 5 * 60_000,
      enabled: m.from <= refDate,
    })),
  });

  /**
   * leads/vendas por TAG (Minicurso, Ebook, Sessão) dentro do PIPELINE_COMERCIAL-V3.
   * Uma única chamada leve cobre o trimestre inteiro, já agregada por mês.
   */
  const triFrom = qi.inicio;
  const triTo = qi.fim > refDate ? refDate : qi.fim;
  const v3Resumo = useQuery({
    queryKey: ["origem-v3-resumo", triFrom, triTo],
    queryFn: () => fetchOrigemV3ResumoFn({ data: { from: triFrom, to: triTo } }),
    staleTime: 5 * 60_000,
  });

  const isLoading = results.some((r) => r.isFetching) || v3Resumo.isFetching;

  /** leads/vendas por funil × mês */
  const porFunil = useMemo(() => {
    const base = {} as Record<FunilTriId, { meses: { leads: number; vendas: number }[] }>;
    for (const f of FUNIS) base[f.id] = { meses: qi.months.map(() => ({ leads: 0, vendas: 0 })) };

    // WGT vem do funil da Clint
    results.forEach((res, i) => {
      for (const r of (res.data ?? []) as ConversaoRow[]) {
        const id = funilId(r.funnel);
        if (!id) continue;
        base[id].meses[i].leads += r.leads;
        base[id].meses[i].vendas += r.vendas;
      }
    });

    // Minicurso / Ebook / Sessão vêm das tags reais dos leads do V3
    // (uma única chamada agregada por mês — "YYYY-MM")
    const idxPorMes = new Map<string, number>();
    qi.months.forEach((m, i) => idxPorMes.set(m.from.slice(0, 7), i));

    for (const r of v3Resumo.data ?? []) {
      const i = idxPorMes.get(r.mes);
      if (i === undefined) continue;
      for (const f of FUNIS) {
        if (!f.origem) continue;
        if (!norm(r.origem).includes(f.origem)) continue;
        base[f.id].meses[i].leads += r.leads;
        base[f.id].meses[i].vendas += r.ganhos;
      }
    }

    return base;
  }, [results.map((r) => r.dataUpdatedAt).join("|"), v3Resumo.dataUpdatedAt, qi]);


  const mesAtualIdx = Math.max(
    0,
    qi.months.findIndex((m) => refDate >= m.from && refDate <= m.to),
  );
  const mesesRestantes = qi.months.length - 1 - mesAtualIdx;

  const linhas = useMemo(() => {
    return FUNIS.map((f) => {
      const meses = porFunil[f.id].meses;
      const mes = meses[mesAtualIdx] ?? { leads: 0, vendas: 0 };
      const leadsTri = meses.reduce((a, m) => a + m.leads, 0);
      const vendasTri = meses.reduce((a, m) => a + m.vendas, 0);

      const metaMes = cfg.rampa[f.id][mesAtualIdx] ?? 0;

      const convMes = mes.leads > 0 ? (mes.vendas / mes.leads) * 100 : 0;
      const convTri = leadsTri > 0 ? (vendasTri / leadsTri) * 100 : 0;

      // leads restantes estimados pelo ritmo diário do trimestre
      const leadsDia = leadsTri / qi.diasCorridos;
      const leadsRestantes = Math.round(leadsDia * qi.diasRestantes);
      const leadsProj = leadsTri + leadsRestantes;

      const isQtd = cfg.modo === "qtd";
      const metaQtd = Math.max(0, Math.round(cfg.metaTriQtd[f.id] ?? 0));
      // no modo quantidade a meta % é derivada dos leads projetados do trimestre
      const metaTri = isQtd
        ? leadsProj > 0
          ? (metaQtd / leadsProj) * 100
          : 0
        : (cfg.metaTri[f.id] ?? f.metaTri);

      // conversão de referência para projeção: mês corrente se tiver volume, senão trimestre
      const convRef = mes.leads >= 20 ? convMes : convTri;
      const projecao = leadsProj > 0 ? ((vendasTri + (leadsRestantes * convRef) / 100) / leadsProj) * 100 : 0;

      const vendasMetaTri = isQtd ? metaQtd : Math.ceil((leadsProj * metaTri) / 100);
      const vendasFaltam = Math.max(0, vendasMetaTri - vendasTri);
      const ritmoNecessario = leadsRestantes > 0 ? (vendasFaltam / leadsRestantes) * 100 : 0;
      const gapPP = convTri - metaTri;

      return {
        ...f,
        metaTri,
        metaQtd,
        metaMes,
        mes,
        convMes,
        atgMes: metaMes > 0 ? (convMes / metaMes) * 100 : 0,
        leadsTri,
        vendasTri,
        convTri,
        atgTri: metaTri > 0 ? (convTri / metaTri) * 100 : 0,
        gapPP,
        leadsRestantes,
        vendasMetaTri,
        vendasFaltam,
        ritmoNecessario,
        projecao,
        status: statusOf(projecao, metaTri),
      };
    });
  }, [porFunil, cfg, mesAtualIdx, qi]);


  const resumoStatus = linhas.reduce(
    (a, l) => ({ ...a, [l.status]: a[l.status] + 1 }),
    { ok: 0, atencao: 0, risco: 0 } as Record<"ok" | "atencao" | "risco", number>,
  );

  const numInput = (key: string, value: number, onNum: (n: number) => void, width = "w-16") => (
    <Input
      type="text"
      inputMode="decimal"
      value={drafts[key] ?? String(Number(value.toFixed(2)))}
      onChange={(e) => {
        const v = e.target.value;
        setDrafts((d) => ({ ...d, [key]: v }));
        const n = Number(v.replace(",", "."));
        if (v.trim() !== "" && Number.isFinite(n)) onNum(n);
      }}
      onBlur={() =>
        setDrafts((d) => {
          const n = { ...d };
          delete n[key];
          return n;
        })
      }
      className={`h-7 ${width} text-xs text-right`}
    />
  );

  return (
    <div className="space-y-4">
      {/* ---------- Visão executiva ---------- */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
                Meta trimestral
              </CardTitle>
              <div className="flex rounded-md border border-border p-0.5">
                {(["pct", "qtd"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => change({ ...cfg, modo: m })}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                      cfg.modo === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {m === "pct" ? "%" : "Vendas"}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5 pt-0">
            {linhas.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-muted-foreground">{l.label}</span>
                {cfg.modo === "qtd" ? (
                  <span className="flex items-center gap-1">
                    {numInput(`tq:${l.id}`, l.metaQtd, (n) =>
                      change({ ...cfg, metaTriQtd: { ...cfg.metaTriQtd, [l.id]: n } }),
                    )}
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      = {pct(l.metaTri)}
                    </span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    {numInput(`t:${l.id}`, l.metaTri, (n) =>
                      change({ ...cfg, metaTri: { ...cfg.metaTri, [l.id]: n } }),
                    )}
                    <span
                      className="text-[10px] text-muted-foreground tabular-nums"
                      title={`${l.metaTri.toFixed(2)}% sobre ~${l.leadsTri + l.leadsRestantes} leads projetados no trimestre`}
                    >
                      = {l.vendasMetaTri} vendas
                    </span>
                  </span>
                )}

              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Realizado no trimestre
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 pt-0">
            {linhas.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-muted-foreground">{l.label}</span>
                <span
                  className={`tabular-nums font-semibold ${
                    l.convTri >= l.metaTri
                      ? "text-emerald-500"
                      : l.convTri >= l.metaTri * 0.85
                        ? "text-amber-500"
                        : "text-red-500"
                  }`}
                  title={`${l.vendasTri} vendas / ${l.leadsTri} leads`}
                >
                  {pct(l.convTri)}
                </span>
              </div>
            ))}
          </CardContent>

        </Card>


        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Status do trimestre
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-500 tabular-nums">{resumoStatus.ok}</p>
                <p className="text-[11px] text-muted-foreground">No ritmo</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-500 tabular-nums">{resumoStatus.atencao}</p>
                <p className="text-[11px] text-muted-foreground">Atenção</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-500 tabular-nums">{resumoStatus.risco}</p>
                <p className="text-[11px] text-muted-foreground">Abaixo</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Q{qi.q}/{qi.year} · {qi.diasCorridos}/{qi.diasTotais} dias · {mesesRestantes} mês(es) restante(s)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ---------- Tabela trimestral ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              {title ?? `Meta acumulada do trimestre — Q${qi.q}/${qi.year}`}
            </CardTitle>
            <div className="flex items-center gap-2 text-xs">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => change({ ...DEFAULT_TRI, modo: cfg.modo, rampa: { ...RAMPA_PADRAO } })}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Padrão
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
            <p className="px-4 py-6 text-sm text-muted-foreground">Carregando trimestre…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  {/* Cabeçalhos de grupo — coloridos */}
                  <tr className="border-t border-b border-border text-[11px] uppercase tracking-wide">
                    <th className="px-3 py-2 border-r border-border/60 bg-muted/40" />
                    <th
                      colSpan={3}
                      className="px-3 py-2 text-center font-bold border-r border-border/60 bg-blue-500/20 text-blue-400"
                    >
                      Mês atual — {qi.months[mesAtualIdx]?.label}
                    </th>
                    <th
                      colSpan={4}
                      className="px-3 py-2 text-center font-bold border-r border-border/60 bg-purple-500/20 text-purple-400"
                    >
                      Acumulado do trimestre
                    </th>
                    <th
                      colSpan={3}
                      className="px-3 py-2 text-center font-bold bg-amber-500/20 text-amber-400"
                    >
                      O que falta
                    </th>
                  </tr>
                  {/* Sub-cabeçalhos */}
                  <tr className="border-b border-border bg-muted/30 align-bottom">
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground border-r border-border/60">
                      Funil
                    </th>
                    <th className="px-2 py-2.5 text-right font-medium text-muted-foreground">Leads</th>
                    <th className="px-2 py-2.5 text-right font-medium text-muted-foreground">Vendas</th>
                    <th className="px-2 py-2.5 text-right font-medium text-muted-foreground border-r border-border/60">
                      Ating.
                    </th>
                    <th className="px-2 py-2.5 text-right font-medium text-muted-foreground">Leads</th>
                    <th className="px-2 py-2.5 text-right font-medium text-muted-foreground">Vendas</th>
                    <th className="px-2 py-2.5 text-right font-medium text-muted-foreground">Ating.</th>
                    <th className="px-2 py-2.5 text-right font-medium text-muted-foreground border-r border-border/60">
                      Gap p.p.
                    </th>
                    <th className="px-2 py-2.5 text-right font-medium text-muted-foreground">Meta vendas</th>
                    <th className="px-2 py-2.5 text-right font-medium text-muted-foreground">Faltam</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.id} className="border-t border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-3.5 font-semibold whitespace-nowrap border-r border-border/40">
                        {l.label}
                      </td>
                      {/* Mês atual */}
                      <td className="px-2 py-3.5 text-right tabular-nums">{l.mes.leads}</td>
                      <td className="px-2 py-3.5 text-right tabular-nums text-emerald-500 font-semibold">
                        {l.mes.vendas}
                      </td>
                      <td className="px-2 py-3.5 text-right tabular-nums border-r border-border/40">
                        <span
                          className={`font-semibold ${
                            l.atgMes >= 100
                              ? "text-emerald-500"
                              : l.atgMes >= 85
                                ? "text-amber-500"
                                : "text-red-500"
                          }`}
                        >
                          {l.atgMes.toFixed(0)}%
                        </span>
                      </td>
                      {/* Acumulado do trimestre */}
                      <td className="px-2 py-3.5 text-right tabular-nums">{l.leadsTri}</td>
                      <td className="px-2 py-3.5 text-right tabular-nums text-emerald-500 font-semibold">
                        {l.vendasTri}
                      </td>
                      <td className="px-2 py-3.5 text-right tabular-nums">
                        <span
                          className={`font-semibold ${
                            l.atgTri >= 100
                              ? "text-emerald-500"
                              : l.atgTri >= 85
                                ? "text-amber-500"
                                : "text-red-500"
                          }`}
                        >
                          {l.atgTri.toFixed(0)}%
                        </span>
                      </td>
                      <td
                        className={`px-2 py-3.5 text-right tabular-nums font-semibold border-r border-border/40 ${l.gapPP >= 0 ? "text-emerald-500" : "text-red-500"}`}
                      >
                        {l.gapPP >= 0 ? "+" : ""}
                        {l.gapPP.toFixed(2)}
                      </td>
                      {/* O que falta */}
                      <td className="px-2 py-3.5 text-right tabular-nums">
                        <span className="font-semibold">{l.vendasMetaTri}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {l.vendasTri} feitas
                        </span>
                      </td>
                      <td className="px-2 py-3.5 text-right tabular-nums">
                        {l.vendasFaltam > 0 ? (
                          <span className="inline-flex flex-col items-end">
                            <span className="text-red-500 font-semibold">{l.vendasFaltam}</span>
                            <span className="text-[10px] text-muted-foreground">vendas</span>
                          </span>
                        ) : (
                          <Badge className="bg-emerald-500/15 text-emerald-500 border-0 whitespace-nowrap">
                            Meta batida
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <Badge className={`${STATUS_UI[l.status].cls} border-0 whitespace-nowrap`}>
                          {STATUS_UI[l.status].dot} {STATUS_UI[l.status].label}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-border/50 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
                <p>
                  <strong className="text-foreground">Modo {cfg.modo === "qtd" ? "Vendas" : "%"}</strong>: a meta
                  é editada no card <em>Meta trimestral</em> acima. Aqui, “Meta vendas” é o alvo em unidades e
                  “Faltam” é quantas vendas ainda faltam para bater. “Ating.” = conversão real ÷ meta.
                </p>
              </div>
            </div>
          )}
        </CardContent>

      </Card>

    </div>
  );
}
