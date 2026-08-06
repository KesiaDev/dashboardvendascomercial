import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Target, Plus, Trash2 } from "lucide-react";

/**
 * Meta IGT (IGT23, IGT24, ...): o Marketing define o volume total de vendas
 * (cenários mínimo/boa/excelente) e o Comercial entrega uma fatia (% share) desse total.
 * Cada edição tem sua própria configuração, guardada localmente.
 */
const STORE_KEY = "metas-igt-v2";
const LEGACY_KEY = "metas-igt23-v1";

type Cfg = {
  minimo: number;
  boa: number;
  excelente: number;
  sharePct: number;
  totalVendas: number;
  vendasComercial: number;
};

const DEFAULT_CFG: Cfg = {
  minimo: 150,
  boa: 220,
  excelente: 300,
  sharePct: 20,
  totalVendas: 175,
  vendasComercial: 62,
};

const EMPTY_CFG: Cfg = { ...DEFAULT_CFG, totalVendas: 0, vendasComercial: 0 };

type Store = {
  active: string;
  order: string[];
  editions: Record<string, Cfg>;
};

const DEFAULT_STORE: Store = {
  active: "IGT23",
  order: ["IGT23"],
  editions: { IGT23: DEFAULT_CFG },
};

function load(): Store {
  if (typeof window === "undefined") return DEFAULT_STORE;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Store;
      if (s?.order?.length && s.editions) return s;
    }
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const cfg = { ...DEFAULT_CFG, ...(JSON.parse(legacy) as Cfg) };
      return { active: "IGT23", order: ["IGT23"], editions: { IGT23: cfg } };
    }
    return DEFAULT_STORE;
  } catch {
    return DEFAULT_STORE;
  }
}


function NumField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1">
        <Input
          type="text"
          inputMode="decimal"
          value={draft ?? String(value)}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            const n = Number(v.replace(",", "."));
            if (v.trim() !== "" && Number.isFinite(n)) onChange(n);
          }}
          onBlur={() => setDraft(null)}
          className="h-8 w-24 text-sm text-right tabular-nums"
        />
        {suffix ? <span className="text-xs text-muted-foreground">{suffix}</span> : null}
      </span>
    </label>
  );
}

function Bar({ pct, tone }: { pct: number; tone: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full ${tone}`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

export function MetasIgt23Card({ title }: { title?: string }) {
  const [cfg, setCfg] = useState<Cfg>(DEFAULT_CFG);
  useEffect(() => setCfg(load()), []);
  const save = (next: Cfg) => {
    setCfg(next);
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const cenarios = useMemo(
    () =>
      (
        [
          { key: "minimo", nome: "Mínimo", alvo: cfg.minimo, tone: "bg-amber-500", chip: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
          { key: "boa", nome: "Boa", alvo: cfg.boa, tone: "bg-sky-500", chip: "bg-sky-500/15 text-sky-600 dark:text-sky-300" },
          { key: "excelente", nome: "Excelente", alvo: cfg.excelente, tone: "bg-emerald-500", chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
        ] as const
      ).map((c) => {
        const metaComercial = (c.alvo * cfg.sharePct) / 100;
        return {
          ...c,
          metaComercial,
          atingMkt: c.alvo > 0 ? (cfg.totalVendas / c.alvo) * 100 : 0,
          atingCom: metaComercial > 0 ? (cfg.vendasComercial / metaComercial) * 100 : 0,
          faltaCom: metaComercial - cfg.vendasComercial,
        };
      }),
    [cfg],
  );

  const shareReal = cfg.totalVendas > 0 ? (cfg.vendasComercial / cfg.totalVendas) * 100 : 0;
  const vendasMkt = Math.max(0, cfg.totalVendas - cfg.vendasComercial);
  const cenarioAtual =
    cfg.totalVendas >= cfg.excelente
      ? "Excelente"
      : cfg.totalVendas >= cfg.boa
        ? "Boa"
        : cfg.totalVendas >= cfg.minimo
          ? "Mínimo"
          : "Abaixo do mínimo";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Target className="h-4 w-4 text-primary" />
          {title ?? "Meta IGT23 — Marketing x Comercial"}
          <Badge variant="secondary" className="font-normal">
            Comercial = {cfg.sharePct}% do total vendido
          </Badge>
          <Badge variant="outline" className="font-normal">
            Cenário atual: {cenarioAtual}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Realizado consolidado */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground">Total vendido (MKT + Comercial)</p>
            <p className="text-2xl font-semibold tabular-nums">{cfg.totalVendas}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground">Vendas do Comercial</p>
            <p className="text-2xl font-semibold tabular-nums text-primary">{cfg.vendasComercial}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground">Vendas do Marketing</p>
            <p className="text-2xl font-semibold tabular-nums">{vendasMkt}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground">Share do Comercial</p>
            <p
              className={`text-2xl font-semibold tabular-nums ${shareReal >= cfg.sharePct ? "text-emerald-500" : "text-amber-500"}`}
            >
              {shareReal.toFixed(1)}%
            </p>
            <p className="text-[11px] text-muted-foreground">meta {cfg.sharePct}%</p>
          </div>
        </div>

        {/* Cenários */}
        <div className="grid gap-3 md:grid-cols-3">
          {cenarios.map((c) => (
            <div key={c.key} className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${c.chip}`}>{c.nome}</span>
                <span className="text-xs text-muted-foreground">
                  MKT {c.alvo} · Comercial {c.metaComercial.toFixed(0)}
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>Total vendido</span>
                  <span className="tabular-nums">
                    {cfg.totalVendas}/{c.alvo} · {c.atingMkt.toFixed(0)}%
                  </span>
                </div>
                <Bar pct={c.atingMkt} tone={c.tone} />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>Comercial ({cfg.sharePct}%)</span>
                  <span className="tabular-nums">
                    {cfg.vendasComercial}/{c.metaComercial.toFixed(0)} · {c.atingCom.toFixed(0)}%
                  </span>
                </div>
                <Bar pct={c.atingCom} tone={c.atingCom >= 100 ? "bg-emerald-500" : c.tone} />
                <p className="text-[11px]">
                  {c.faltaCom > 0 ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      faltam {Math.ceil(c.faltaCom)} vendas
                    </span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      meta batida (+{Math.abs(Math.floor(c.faltaCom))})
                    </span>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Parâmetros editáveis */}
        <div className="flex flex-wrap items-end gap-4 border-t pt-3">
          <NumField label="Meta MKT mínima" value={cfg.minimo} onChange={(n) => save({ ...cfg, minimo: n })} />
          <NumField label="Meta MKT boa" value={cfg.boa} onChange={(n) => save({ ...cfg, boa: n })} />
          <NumField label="Meta MKT excelente" value={cfg.excelente} onChange={(n) => save({ ...cfg, excelente: n })} />
          <NumField label="Share do Comercial" value={cfg.sharePct} onChange={(n) => save({ ...cfg, sharePct: n })} suffix="%" />
          <NumField label="Total vendido" value={cfg.totalVendas} onChange={(n) => save({ ...cfg, totalVendas: n })} />
          <NumField label="Vendas do Comercial" value={cfg.vendasComercial} onChange={(n) => save({ ...cfg, vendasComercial: n })} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Meta do Comercial = meta do Marketing × {cfg.sharePct}%. Ex.: cenário boa ({cfg.boa}) →{" "}
          {((cfg.boa * cfg.sharePct) / 100).toFixed(0)} vendas do Comercial.
        </p>
      </CardContent>
    </Card>
  );
}
