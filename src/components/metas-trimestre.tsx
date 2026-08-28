import { Fragment, useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Save, RotateCcw, ChevronDown, ChevronRight } from "lucide-react";
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

const STORE_KEY = "metas-trimestre-v3";

type TriConfig = {
  metaTri: Record<FunilTriId, number>;
  /** meta do trimestre em nº de vendas (usada quando modo = "qtd") */
  metaTriQtd: Record<FunilTriId, number>;
  /** modo de edição da meta trimestral */
  modo: "pct" | "qtd";
  /** peso de cada mês do trimestre (média = 1) */
  pesos: [number, number, number];
};

const DEFAULT_TRI: TriConfig = {
  metaTri: { WGT: 1.5, MINICURSO: 5, EBOOK: 5, SESSAO: 10 },
  metaTriQtd: { WGT: 12, MINICURSO: 25, EBOOK: 25, SESSAO: 40 },
  modo: "pct",
  pesos: [...PESOS_PADRAO] as [number, number, number],
};

function loadTri(): TriConfig {
  if (typeof window === "undefined") return DEFAULT_TRI;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return DEFAULT_TRI;
    const p = JSON.parse(raw) as Partial<TriConfig>;
    const pesos = Array.isArray(p.pesos) && p.pesos.length === 3 ? (p.pesos as [number, number, number]) : DEFAULT_TRI.pesos;
    return {
      metaTri: { ...DEFAULT_TRI.metaTri, ...(p.metaTri ?? {}) },
      metaTriQtd: { ...DEFAULT_TRI.metaTriQtd, ...(p.metaTriQtd ?? {}) },
      modo: p.modo === "qtd" ? "qtd" : "pct",
      pesos,
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
  const [showConfig, setShowConfig] = useState(false);
  /** Os três cards da visão executiva são recolhíveis. Meta trimestral começa oculto. */
  const [metaCardOpen, setMetaCardOpen] = useState(false);
  const [realizadoOpen, setRealizadoOpen] = useState(true);
  const [statusOpen, setStatusOpen] = useState(true);
  useEffect(() => setCfg(loadTri()), []);

  const change = (next: TriConfig) => {
    setCfg(next);
    setDirty(true);
  };

  /** Cor distinta por mês do trimestre (index 0..2) */
  const MONTH_CLR = [
    "bg-orange-500/20 text-orange-400", // Jul
    "bg-amber-500/20 text-amber-400", // Ago
    "bg-yellow-500/20 text-yellow-400", // Set
  ];
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

  /** dias de cada mês do trimestre e quantos já correram (para projetar leads) */
  const mesDias = useMemo(
    () =>
      qi.months.map((m) => {
        const total =
          Math.round(
            (new Date(`${m.to}T00:00:00Z`).getTime() - new Date(`${m.from}T00:00:00Z`).getTime()) / 86400000,
          ) + 1;
        const corridos =
          refDate < m.from ? 0 : refDate > m.to ? total : Math.min(total, Math.max(1, Number(refDate.slice(8, 10))));
        return { total, corridos, completo: refDate > m.to };
      }),
    [qi, refDate],
  );

  const pesosNorm = useMemo(() => {
    const p = cfg.pesos.map((x) => (Number.isFinite(x) && x > 0 ? x : 0)) as [number, number, number];
    const soma = p[0] + p[1] + p[2];
    return (soma > 0 ? p.map((x) => (x * 3) / soma) : [1, 1, 1]) as [number, number, number];
  }, [cfg.pesos]);

  const linhas = useMemo(() => {
    return FUNIS.map((f) => {
      const meses = porFunil[f.id].meses;
      const mes = meses[mesAtualIdx] ?? { leads: 0, vendas: 0 };
      const leadsTri = meses.reduce((a, m) => a + m.leads, 0);
      const vendasTri = meses.reduce((a, m) => a + m.vendas, 0);

      // --- leads estimados por mês (real quando o mês já passou) ---
      const completos = mesDias
        .map((d, i) => (d.completo ? meses[i].leads : null))
        .filter((v): v is number => v !== null);
      const mesCorrenteProj =
        mesDias[mesAtualIdx].corridos > 0
          ? (mes.leads / mesDias[mesAtualIdx].corridos) * mesDias[mesAtualIdx].total
          : 0;
      const mediaMes = completos.length
        ? completos.reduce((a, b) => a + b, 0) / completos.length
        : mesCorrenteProj;

      const leadsEst = meses.map((m, i) => {
        if (mesDias[i].completo) return m.leads;
        if (i === mesAtualIdx) return Math.max(m.leads, Math.round(mesCorrenteProj));
        return Math.round(mediaMes);
      });
      const leadsProj = leadsEst.reduce((a, b) => a + b, 0);
      const leadsRestantes = Math.max(0, leadsProj - leadsTri);

      const isQtd = cfg.modo === "qtd";
      const metaQtd = Math.max(0, Math.round(cfg.metaTriQtd[f.id] ?? 0));
      const metaTri = isQtd
        ? leadsProj > 0
          ? (metaQtd / leadsProj) * 100
          : 0
        : (cfg.metaTri[f.id] ?? f.metaTri);

      // --- distribuição da meta pelos 3 meses ---
      const metaPctMes = pesosNorm.map((p) => metaTri * p);
      const pesoLeads = leadsEst.map((l, i) => l * pesosNorm[i]);
      const somaPesoLeads = pesoLeads.reduce((a, b) => a + b, 0);
      const metaVendasMes = isQtd
        ? pesoLeads.map((p) => (somaPesoLeads > 0 ? Math.round((metaQtd * p) / somaPesoLeads) : 0))
        : leadsEst.map((l, i) => Math.ceil((l * metaPctMes[i]) / 100));

      const detalheMeses = qi.months.map((m, i) => {
        const real = meses[i];
        const conv = real.leads > 0 ? (real.vendas / real.leads) * 100 : 0;
        const metaV = metaVendasMes[i] ?? 0;
        return {
          label: m.short,
          full: m.label,
          futuro: refDate < m.from,
          atual: i === mesAtualIdx,
          leads: real.leads,
          leadsEst: leadsEst[i],
          vendas: real.vendas,
          conv,
          metaPct: metaPctMes[i] ?? 0,
          metaVendas: metaV,
          atg: metaV > 0 ? (real.vendas / metaV) * 100 : 0,
        };
      });

      const metaMes = metaPctMes[mesAtualIdx] ?? 0;
      const convMes = mes.leads > 0 ? (mes.vendas / mes.leads) * 100 : 0;
      const convTri = leadsTri > 0 ? (vendasTri / leadsTri) * 100 : 0;

      // conversão de referência para projeção: mês corrente se tiver volume, senão trimestre
      const convRef = mes.leads >= 20 ? convMes : convTri;
      const projecao = leadsProj > 0 ? ((vendasTri + (leadsRestantes * convRef) / 100) / leadsProj) * 100 : 0;

      const vendasMetaTri = metaVendasMes.reduce((a, b) => a + b, 0);
      // Gap = soma do que faltou (ou sobrou) do real vs meta em TODOS os meses do trimestre.
      // Positivo = faltou vender; negativo = vendeu a mais.
      const gapFechados = vendasMetaTri - vendasTri;
      // Meta ajustada = total que ainda falta vender no trimestre (meta total − realizado),
      // já incluindo a soma do gap. Nunca negativa.
      const metaAjustadaRestante = Math.max(0, gapFechados);
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
        atgMes:
          (metaVendasMes[mesAtualIdx] ?? 0) > 0 ? (mes.vendas / metaVendasMes[mesAtualIdx]!) * 100 : 0,
        metaVendasMesAtual: metaVendasMes[mesAtualIdx] ?? 0,
        detalheMeses,
        leadsTri,
        leadsProj,
        vendasTri,
        convTri,
        atgTri: vendasMetaTri > 0 ? (vendasTri / vendasMetaTri) * 100 : 0,
        gapPP,
        leadsRestantes,
        vendasMetaTri,
        gapFechados,
        metaAjustadaRestante,
        vendasFaltam,
        ritmoNecessario,
        projecao,
        status: statusOf(projecao, metaTri),
      };
    });
  }, [porFunil, cfg, mesAtualIdx, qi, mesDias, pesosNorm]);



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

  /** Versão que respeita o modo de edição (read-only quando showConfig=false) */
  const numCell = (key: string, value: number, onNum: (n: number) => void, width = "w-16") =>
    showConfig ? (
      numInput(key, value, onNum, width)
    ) : (
      <span className={`inline-block ${width} text-right text-xs tabular-nums text-foreground/80`}>
        {Number(value.toFixed(2))}
      </span>
    );

  const allOpen = metaCardOpen && realizadoOpen && statusOpen;
  const toggleAll = () => {
    const next = !allOpen;
    setMetaCardOpen(next);
    setRealizadoOpen(next);
    setStatusOpen(next);
  };

  return (
    <div className="space-y-4">
      {/* ---------- Visão executiva ---------- */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={toggleAll}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={allOpen ? "Recolher os 3 cards" : "Expandir os 3 cards"}
        >
          {allOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {allOpen ? "Recolher tudo" : "Expandir tudo"}
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {/* Card "Meta trimestral" — oculto por padrão, abre ao clicar */}
        {metaCardOpen ? (
          <Card>
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setMetaCardOpen(false)}
                  className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  Meta trimestral
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowConfig((v) => !v)}
                    className={`rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      showConfig
                        ? "bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {showConfig ? "Fechar edição" : "Editar metas"}
                  </button>
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
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5 pt-0">
              {linhas.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-muted-foreground">{l.label}</span>
                  {cfg.modo === "qtd" ? (
                    <span className="flex items-center gap-1">
                      {numCell(`tq:${l.id}`, l.metaQtd, (n) =>
                        change({ ...cfg, metaTriQtd: { ...cfg.metaTriQtd, [l.id]: n } }),
                      )}
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        = {pct(l.metaTri)}
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      {numCell(`t:${l.id}`, l.metaTri, (n) =>
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
        ) : (
          <button
            type="button"
            onClick={() => setMetaCardOpen(true)}
            className="flex h-full min-h-[64px] items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 text-xs uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            title="Abrir edição da meta trimestral"
          >
            <ChevronRight className="h-3.5 w-3.5" />
            Meta trimestral (oculto) — clique para editar
          </button>
        )}


        <Card>
          <CardHeader className="pb-1">
            <button
              type="button"
              onClick={() => setRealizadoOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              <span className="flex items-center gap-1">
                {realizadoOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Realizado no trimestre
              </span>
            </button>
          </CardHeader>
          {realizadoOpen && (
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
          )}
        </Card>


        <Card>
          <CardHeader className="pb-1">
            <button
              type="button"
              onClick={() => setStatusOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              <span className="flex items-center gap-1">
                {statusOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Status do trimestre
              </span>
            </button>
          </CardHeader>
          {statusOpen && (
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
          )}
        </Card>
      </div>

      {/* ---------- Distribuição da meta pelos 3 meses ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold">
              Como a meta do trimestre se divide entre {qi.months.map((m) => m.short).join(", ")}
            </CardTitle>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {showConfig ? (
                <>
                  <span>Peso do mês:</span>
                  {qi.months.map((m, i) => (
                    <span key={m.from} className="flex items-center gap-1">
                      <span>{m.short}</span>
                      {numCell(`p:${i}`, cfg.pesos[i], (n) => {
                        const p = [...cfg.pesos] as [number, number, number];
                        p[i] = n;
                        change({ ...cfg, pesos: p });
                      }, "w-14")}
                    </span>
                  ))}
                </>
              ) : (
                <span className="italic">
                  {metaCardOpen
                    ? "Clique em “Editar metas” no card acima para alterar %, metas e pesos."
                    : "Abra o card “Meta trimestral” acima para alterar %, metas e pesos."}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-t border-b border-border text-[11px] uppercase tracking-wide bg-muted/30">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground border-r border-border/60">
                    Funil
                  </th>
                  {qi.months.map((m, i) => (
                    <th
                      key={m.from}
                      colSpan={3}
                      className={`px-2 py-2 text-center font-bold border-r border-border/60 ${
                        MONTH_CLR[i % MONTH_CLR.length]
                      } ${i === mesAtualIdx ? "ring-1 ring-inset ring-primary/40" : ""}`}
                    >
                      {m.label}
                    </th>
                  ))}
                  <th colSpan={5} className="px-2 py-2 text-center font-bold bg-purple-500/20 text-purple-400">
                    Trimestre
                  </th>
                </tr>
                <tr className="border-b border-border bg-muted/20 text-[10px] uppercase text-muted-foreground">
                  <th className="px-3 py-1.5 border-r border-border/60" />
                  {qi.months.map((m) => (
                    <Fragment key={m.from}>
                      <th className="px-2 py-1.5 text-right font-medium">
                        Meta %
                      </th>
                      <th className="px-2 py-1.5 text-right font-medium">
                        Meta vd
                      </th>
                      <th className="px-2 py-1.5 text-right font-medium border-r border-border/60">
                        Real
                      </th>
                    </Fragment>
                  ))}
                  <th className="px-2 py-1.5 text-right font-medium">Meta %</th>
                  <th className="px-2 py-1.5 text-right font-medium">Meta vd</th>
                  <th className="px-2 py-1.5 text-right font-medium">Real</th>
                  <th className="px-2 py-1.5 text-right font-medium" title="Vendas que faltaram nos meses já fechados">
                    Gap fech.
                  </th>
                  <th
                    className="px-2 py-1.5 text-right font-medium"
                    title="Meta dos meses restantes + gap dos meses fechados"
                  >
                    Meta ajust.
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className="border-t border-border/50 hover:bg-muted/20">
                    <td className="px-3 py-3 font-semibold whitespace-nowrap border-r border-border/40">{l.label}</td>
                    {l.detalheMeses.map((d) => (
                      <Fragment key={`${l.id}-${d.label}`}>
                        <td
                          className={`px-2 py-3 text-right tabular-nums ${d.atual ? "bg-blue-500/5" : ""}`}
                        >
                          {d.metaPct.toFixed(2)}%
                        </td>
                        <td
                          className={`px-2 py-3 text-right tabular-nums font-semibold ${d.atual ? "bg-blue-500/5" : ""}`}
                          title={`${d.leadsEst} leads ${d.leads === d.leadsEst ? "reais" : "estimados"} × ${d.metaPct.toFixed(2)}%`}
                        >
                          {d.metaVendas}
                        </td>
                        <td
                          className={`px-2 py-3 text-right tabular-nums border-r border-border/40 ${d.atual ? "bg-blue-500/5" : ""}`}
                        >
                          {d.futuro ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span
                              className={
                                d.vendas >= d.metaVendas ? "text-emerald-500 font-semibold" : "text-red-500 font-semibold"
                              }
                              title={`${d.vendas} vendas / ${d.leads} leads = ${d.conv.toFixed(2)}%`}
                            >
                              {d.vendas}
                            </span>
                          )}
                        </td>
                      </Fragment>
                    ))}
                    <td className="px-2 py-3 text-right tabular-nums">{l.metaTri.toFixed(2)}%</td>
                    <td className="px-2 py-3 text-right tabular-nums font-semibold">{l.vendasMetaTri}</td>
                    <td
                      className={`px-2 py-3 text-right tabular-nums font-semibold ${
                        l.vendasTri >= l.vendasMetaTri ? "text-emerald-500" : "text-red-500"
                      }`}
                    >
                      {l.vendasTri}
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums">
                      {l.gapFechados > 0 ? (
                        <span className="text-red-500 font-semibold">+{l.gapFechados}</span>
                      ) : l.gapFechados < 0 ? (
                        <span className="text-emerald-500 font-semibold">{l.gapFechados}</span>
                      ) : (
                        <span className="text-emerald-500">0</span>
                      )}
                    </td>
                    <td
                      className="px-2 py-3 text-right tabular-nums font-bold text-amber-500"
                      title="Meta dos meses que ainda faltam + gap acumulado dos meses fechados"
                    >
                      {l.metaAjustadaRestante}
                    </td>
                  </tr>
                ))}
                {/* ---------- Linha TOTAL ---------- */}
                {(() => {
                  const totMetaMes = qi.months.map((_, i) =>
                    linhas.reduce((a, l) => a + (l.detalheMeses[i]?.metaVendas ?? 0), 0),
                  );
                  const totRealMes = qi.months.map((_, i) =>
                    linhas.reduce((a, l) => {
                      const d = l.detalheMeses[i];
                      return a + (d?.futuro ? 0 : d?.vendas ?? 0);
                    }, 0),
                  );
                  const totMetaTri = linhas.reduce((a, l) => a + l.vendasMetaTri, 0);
                  const totRealTri = linhas.reduce((a, l) => a + l.vendasTri, 0);
                  const totFaltaTri = Math.max(0, totMetaTri - totRealTri);
                  return (
                    <tr className="border-t-2 border-primary/40 bg-gradient-to-r from-primary/10 via-primary/5 to-muted/20 font-bold">
                      <td className="px-3 py-3.5 whitespace-nowrap border-r border-border/40 uppercase text-xs tracking-wide text-primary-foreground">
                        Total
                      </td>
                      {qi.months.map((m, i) => (
                        <Fragment key={m.from}>
                          <td className="px-2 py-3.5 text-right tabular-nums text-muted-foreground">—</td>
                          <td className="px-2 py-3.5 text-right tabular-nums">{totMetaMes[i]}</td>
                          <td
                            className={`px-2 py-3.5 text-right tabular-nums border-r border-border/40 ${
                              totRealMes[i] >= totMetaMes[i] ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {totRealMes[i]}
                          </td>
                        </Fragment>
                      ))}
                      <td className="px-2 py-3.5 text-right tabular-nums text-muted-foreground">—</td>
                      <td className="px-2 py-3.5 text-right tabular-nums">{totMetaTri}</td>
                      <td
                        className={`px-2 py-3.5 text-right tabular-nums ${
                          totRealTri >= totMetaTri ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {totRealTri}
                      </td>
                      <td
                        className={`px-2 py-3.5 text-right tabular-nums ${
                          linhas.reduce((a, l) => a + l.gapFechados, 0) > 0
                            ? "text-red-400"
                            : "text-emerald-400 font-semibold"
                        }`}
                      >
                        {linhas.reduce((a, l) => a + l.gapFechados, 0) > 0 ? "+" : ""}
                        {linhas.reduce((a, l) => a + l.gapFechados, 0)}
                      </td>
                      <td className="px-2 py-3.5 text-right tabular-nums text-amber-400">
                        {linhas.reduce((a, l) => a + l.metaAjustadaRestante, 0)}
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>



      {/* Botão flutuante fixo — sempre visível enquanto houver alterações */}
      {dirty && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
          <span className="text-xs text-amber-500">alterações não salvas</span>
          <Button size="sm" className="h-8 rounded-full text-xs" onClick={persist}>
            <Save className="h-4 w-4 mr-1" />
            Salvar metas
          </Button>
        </div>
      )}
    </div>
  );
}
