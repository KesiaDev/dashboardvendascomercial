import { useMemo, useState, useRef, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchTargets } from "@/lib/bi";
import {
  fetchSalesResultadosFn,
  fetchWeeklyResultsFn,
  fetchMonthlyOverridesFn,
  fetchLeadsRealizadoFn,
  saveWeeklyResultFn,
  saveMonthlyOverrideFn,
  saveTargetFn,
  type SaleResultado,
} from "@/lib/resultados.functions";
import { useCurrency } from "@/lib/currency-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrendingUp, Pencil, Check, X, Users, Target, Package, Sparkles } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/resultados")({
  component: Resultados,
});

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// ── Mapeamento de blocos e produtos ─────────────────────────────────────────
type Bloco = "front_end" | "high_ticket";

const HIGH_TICKET_GROUPS = new Set([
  "gtp_au",
  "accelerator",
  "traffic_master",
  "master_scale",
  "estrategista",
  "renov_mentoria",
  "renov_acc",
  "renov_tm",
]);

const RENOVACAO_GROUPS = new Set(["renov_mentoria", "renov_acc", "renov_tm"]);

type ProductId = "fgrs" | "igt" | "mse" | "wgt" | "wfgrs" | "ldp" | "accelerator";

const PRODUCTS: { id: ProductId; label: string; sublabel: string; accent: string; headerBg: string; rowBg: string; text: string }[] = [
  { id: "fgrs", label: "Formação (FGRS)", sublabel: "Formação Gestor Redes Sociais", accent: "bg-blue-500", headerBg: "bg-blue-50/80 dark:bg-blue-900/25", rowBg: "bg-blue-50/50 dark:bg-blue-900/12", text: "text-blue-600" },
  { id: "igt", label: "Mentoria via Imersão (IGT)", sublabel: "MGT via IGT — SCK: igt*", accent: "bg-violet-500", headerBg: "bg-violet-50/80 dark:bg-violet-900/25", rowBg: "bg-violet-50/50 dark:bg-violet-900/12", text: "text-violet-600" },
  { id: "mse", label: "Mentoria via Perpétuos (MSE)", sublabel: "E-book, Mini-curso, Sessão", accent: "bg-emerald-500", headerBg: "bg-emerald-50/80 dark:bg-emerald-900/25", rowBg: "bg-emerald-50/50 dark:bg-emerald-900/12", text: "text-emerald-600" },
  { id: "wgt", label: "Mentoria via Webinar (WGT)", sublabel: "MGT residual", accent: "bg-amber-500", headerBg: "bg-amber-50/80 dark:bg-amber-900/25", rowBg: "bg-amber-50/50 dark:bg-amber-900/12", text: "text-amber-600" },
  { id: "wfgrs", label: "Formação via Webinar (WFGRS)", sublabel: "Manual", accent: "bg-pink-500", headerBg: "bg-pink-50/80 dark:bg-pink-900/25", rowBg: "bg-pink-50/50 dark:bg-pink-900/12", text: "text-pink-600" },
  { id: "ldp", label: "Accelerator via Live (LDP)", sublabel: "Programa Accelerator", accent: "bg-cyan-500", headerBg: "bg-cyan-50/80 dark:bg-cyan-900/25", rowBg: "bg-cyan-50/50 dark:bg-cyan-900/12", text: "text-cyan-600" },
  { id: "accelerator", label: "Master and Scale", sublabel: "Bilhetes M&S", accent: "bg-orange-500", headerBg: "bg-orange-50/80 dark:bg-orange-900/25", rowBg: "bg-orange-50/50 dark:bg-orange-900/12", text: "text-orange-600" },
];

const PRODUCT_HEX: Record<ProductId, string> = {
  fgrs: "#3b82f6",
  igt: "#8b5cf6",
  mse: "#10b981",
  wgt: "#f59e0b",
  wfgrs: "#ec4899",
  ldp: "#06b6d4",
  accelerator: "#f97316",
};

function isApproved(status: string) {
  const s = (status ?? "").toLowerCase();
  return s === "aprovado" || s === "completo" || s === "approved" || s === "completed";
}

function isCommercial(sale: SaleResultado) {
  return sale.nome_afiliado != null || sale.origem_checkout != null;
}

function isRenovacao(sale: SaleResultado): boolean {
  if (RENOVACAO_GROUPS.has((sale.produto_grupo ?? "").toLowerCase())) return true;
  const name = (sale.produto_original ?? "").toLowerCase();
  return name.includes("renova");
}

function attributeBloco(sale: SaleResultado): Bloco | null {
  const pg = (sale.produto_grupo ?? "").toLowerCase();
  if (pg === "formacao_rs" && !isRenovacao(sale)) return "front_end";
  if (HIGH_TICKET_GROUPS.has(pg)) return "high_ticket";
  return null;
}

function attributeProduct(sale: SaleResultado): ProductId | null {
  const pg = (sale.produto_grupo ?? "").toLowerCase();
  const sck = (sale.origem_checkout ?? "").toLowerCase();
  if (pg === "formacao_rs" && !isRenovacao(sale)) return "fgrs";
  if (pg === "gtp_au" || pg === "renov_mentoria") {
    if (sck.startsWith("igt")) return "igt";
    if (sck.startsWith("mse")) return "mse";
    return "wgt";
  }
  if (pg === "accelerator" || pg === "renov_acc") return "ldp";
  if (pg === "master_scale") return "accelerator";
  return null;
}

// ── Utilitários ─────────────────────────────────────────────────────────────
function pct(real: number, meta: number): number {
  if (meta === 0) return real > 0 ? 100 : 0;
  return Math.round((real / meta) * 100);
}

function pctBadgeClass(p: number): string {
  if (p >= 100) return "bg-emerald-600 text-white";
  if (p >= 70) return "bg-yellow-500 text-white";
  return "bg-red-600 text-white";
}

// Segunda-feira ISO da data
function mondayOf(d: Date): string {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = dt.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

function weeksOfYear(year: number): string[] {
  const weeks: string[] = [];
  let d = new Date(Date.UTC(year, 0, 1));
  const first = new Date(mondayOf(d));
  // Start from the Monday of week 1
  d = new Date(first);
  if (d.getUTCFullYear() < year) d.setUTCDate(d.getUTCDate() + 7);
  while (d.getUTCFullYear() <= year) {
    if (d.getUTCFullYear() === year) weeks.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return weeks;
}

function formatWeekLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ── Célula editável genérica ────────────────────────────────────────────────
function EditableCell({
  value,
  onSave,
  format,
  parse,
  className,
  suffix,
}: {
  value: number;
  onSave: (v: number) => Promise<void>;
  format: (v: number) => string;
  parse?: (s: string) => number;
  className?: string;
  suffix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function commit() {
    const parsed = parse ? parse(draft) : Number(draft.replace(",", "."));
    if (Number.isNaN(parsed)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed);
      setEditing(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          disabled={saving}
          className="h-7 w-24 text-xs px-2"
        />
        <button onClick={commit} disabled={saving} className="text-emerald-600 hover:text-emerald-700">
          <Check className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setEditing(false)} disabled={saving} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      className={`group inline-flex items-center gap-1 hover:text-primary transition-colors ${className ?? ""}`}
    >
      <span>{value > 0 ? format(value) : "—"}{suffix}</span>
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60" />
    </button>
  );
}

// ── KPI Card YTD ────────────────────────────────────────────────────────────
function YtdKpiCard({
  icon: Icon,
  label,
  realized,
  meta,
  format,
  onEditMeta,
  onEditRealized,
  unitFormat,
}: {
  icon: any;
  label: string;
  realized: number;
  meta: number;
  format?: (v: number) => string;
  onEditMeta?: (v: number) => Promise<void>;
  onEditRealized?: (v: number) => Promise<void>;
  unitFormat?: (v: number) => string;
}) {
  const fmt = format ?? ((v: number) => v.toLocaleString("pt-BR"));
  const p = pct(realized, meta);
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
            <Icon className="h-4 w-4" />
            {label}
          </div>
          <Badge className={pctBadgeClass(p) + " text-xs"}>{p}%</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tabular-nums">
          {onEditRealized ? (
            <EditableCell value={realized} onSave={onEditRealized} format={(v) => (unitFormat ?? fmt)(v)} />
          ) : (
            <span>{(unitFormat ?? fmt)(realized)}</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
          Meta:{" "}
          {onEditMeta ? (
            <EditableCell value={meta} onSave={onEditMeta} format={(v) => (unitFormat ?? fmt)(v)} />
          ) : (
            <span>{(unitFormat ?? fmt)(meta)}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Bloco mensal (Front End / High Ticket) ──────────────────────────────────
type MonthReal = { vendas: number; faturamento: number };

function MonthlyBlock({
  bloco,
  title,
  subtitle,
  color,
  monthData,
  overrides,
  targets,
  year,
  format,
  onSaveTarget,
  onSaveOverride,
}: {
  bloco: Bloco;
  title: string;
  subtitle: string;
  color: string;
  monthData: Record<number, MonthReal>;
  overrides: Record<string, number>; // key = `${indicador}:${month}`
  targets: { month: number; indicador: string; valor: number }[];
  year: number;
  format: (v: number) => string;
  onSaveTarget: (indicador: string, month: number, valor: number) => Promise<void>;
  onSaveOverride: (indicador: string, month: number, valor: number) => Promise<void>;
}) {
  // Meta anual = soma das metas mensais (permite editar por mês)
  const vendaMetaAnual = useMemo(
    () => targets.filter((t) => t.indicador === "vendas").reduce((s, t) => s + t.valor, 0),
    [targets],
  );
  const fatMetaAnual = useMemo(
    () => targets.filter((t) => t.indicador === "faturamento").reduce((s, t) => s + t.valor, 0),
    [targets],
  );

  // Distribuição %: valores por mês (0-11), se ausente, distribui igualmente
  const dist = useMemo(() => {
    const m: Record<number, number> = {};
    for (const t of targets.filter((t) => t.indicador === "distribuicao_pct")) {
      m[t.month] = t.valor;
    }
    return m;
  }, [targets]);

  const distTotal = Object.values(dist).reduce((s, v) => s + v, 0);

  // Realizado com override
  function realizedVendas(m: number): number {
    const ov = overrides[`vendas:${m}`];
    if (ov !== undefined) return ov;
    return monthData[m]?.vendas ?? 0;
  }
  function realizedFat(m: number): number {
    const ov = overrides[`faturamento:${m}`];
    if (ov !== undefined) return ov;
    return monthData[m]?.faturamento ?? 0;
  }
  function isOverriddenV(m: number) {
    return overrides[`vendas:${m}`] !== undefined;
  }
  function isOverriddenF(m: number) {
    return overrides[`faturamento:${m}`] !== undefined;
  }

  // Meta mensal projetada = meta anual * distribuição
  function metaMensalV(m: number): number {
    const d = dist[m] ?? 0;
    if (distTotal > 0) return Math.round((vendaMetaAnual * d) / distTotal);
    return Math.round(vendaMetaAnual / 12);
  }
  function metaMensalF(m: number): number {
    const d = dist[m] ?? 0;
    if (distTotal > 0) return (fatMetaAnual * d) / distTotal;
    return fatMetaAnual / 12;
  }

  const currentMonth = new Date().getFullYear() === year ? new Date().getMonth() : 11;

  const totalRealV = Array.from({ length: 12 }, (_, m) => realizedVendas(m)).reduce((s, v) => s + v, 0);
  const totalRealF = Array.from({ length: 12 }, (_, m) => realizedFat(m)).reduce((s, v) => s + v, 0);

  const chartData = MONTHS.map((label, m) => ({
    month: label,
    Projetado: metaMensalV(m),
    Realizado: m <= currentMonth ? realizedVendas(m) : 0,
  }));

  let acumProj = 0;
  let acumReal = 0;
  const cumulativeData = MONTHS.map((label, m) => {
    acumProj += metaMensalV(m);
    if (m <= currentMonth) acumReal += realizedVendas(m);
    return { month: label, "Acum. Projetado": acumProj, "Acum. Realizado": m <= currentMonth ? acumReal : null };
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3" style={{ borderTop: `4px solid ${color}` }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold">{totalRealV} / {vendaMetaAnual} vendas ({pct(totalRealV, vendaMetaAnual)}%)</div>
            <div className="text-muted-foreground text-xs">{format(totalRealF)} / {format(fatMetaAnual)}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-t border-border bg-muted/40">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground w-36 sticky left-0 bg-muted/40">
                  &nbsp;
                </th>
                {MONTHS.map((m) => (
                  <th key={m} className="px-2 py-2 text-right font-medium text-muted-foreground">
                    {m}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium text-muted-foreground bg-muted/60">Total</th>
              </tr>
            </thead>
            <tbody>
              {/* Distribuição % */}
              <tr className="border-t border-border/50">
                <td className="px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-background">Distribuição %</td>
                {MONTHS.map((_, m) => (
                  <td key={m} className="px-2 py-1.5 text-right text-blue-600">
                    <EditableCell
                      value={dist[m] ?? 0}
                      onSave={(v) => onSaveTarget("distribuicao_pct", m, v)}
                      format={(v) => `${v}%`}
                    />
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right font-semibold bg-muted/40">{distTotal}%</td>
              </tr>
              {/* Meta Vendas por mês */}
              <tr className="border-t border-border/50 bg-blue-50/30 dark:bg-blue-950/20">
                <td className="px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-blue-50/30 dark:bg-blue-950/20">Meta Vendas</td>
                {MONTHS.map((_, m) => {
                  const t = targets.find((t) => t.indicador === "vendas" && t.month === m);
                  return (
                    <td key={m} className="px-2 py-1.5 text-right">
                      <EditableCell
                        value={t?.valor ?? 0}
                        onSave={(v) => onSaveTarget("vendas", m, v)}
                        format={(v) => v.toLocaleString("pt-BR")}
                      />
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-right font-semibold bg-muted/40 tabular-nums">{vendaMetaAnual}</td>
              </tr>
              {/* Vendas Realizado */}
              <tr className="border-t border-border/50">
                <td className="px-3 py-2 font-medium sticky left-0 bg-background">Vendas Realizado</td>
                {MONTHS.map((_, m) => {
                  const isFuture = m > currentMonth;
                  return (
                    <td key={m} className={`px-2 py-1.5 text-right tabular-nums ${isFuture ? "opacity-30" : ""}`}>
                      {isFuture ? (
                        "—"
                      ) : (
                        <EditableCell
                          value={realizedVendas(m)}
                          onSave={(v) => onSaveOverride("vendas", m, v)}
                          format={(v) => v.toLocaleString("pt-BR")}
                          className={isOverriddenV(m) ? "text-amber-600 font-semibold" : ""}
                        />
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-right font-bold bg-muted/40 tabular-nums">{totalRealV}</td>
              </tr>
              {/* Atingimento Vendas mês */}
              <tr className="border-t border-border/50 text-xs">
                <td className="px-3 py-1.5 text-muted-foreground sticky left-0 bg-background">% Atingimento mês</td>
                {MONTHS.map((_, m) => {
                  const isFuture = m > currentMonth;
                  const p = pct(realizedVendas(m), metaMensalV(m));
                  return (
                    <td key={m} className={`px-2 py-1 text-right ${isFuture ? "opacity-30" : ""}`}>
                      {isFuture || metaMensalV(m) === 0 ? "—" : <Badge className={pctBadgeClass(p) + " text-[10px] px-1.5"}>{p}%</Badge>}
                    </td>
                  );
                })}
                <td className="px-3 py-1 text-right bg-muted/40">
                  {vendaMetaAnual > 0 && <Badge className={pctBadgeClass(pct(totalRealV, vendaMetaAnual)) + " text-[10px] px-1.5"}>{pct(totalRealV, vendaMetaAnual)}%</Badge>}
                </td>
              </tr>
              {/* Meta Faturamento */}
              <tr className="border-t-2 border-border/70 bg-blue-50/30 dark:bg-blue-950/20">
                <td className="px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-blue-50/30 dark:bg-blue-950/20">Meta Faturamento</td>
                {MONTHS.map((_, m) => {
                  const t = targets.find((t) => t.indicador === "faturamento" && t.month === m);
                  return (
                    <td key={m} className="px-2 py-1.5 text-right text-xs">
                      <EditableCell
                        value={t?.valor ?? 0}
                        onSave={(v) => onSaveTarget("faturamento", m, v)}
                        format={format}
                      />
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-right font-semibold bg-muted/40 tabular-nums text-xs">{format(fatMetaAnual)}</td>
              </tr>
              {/* Faturamento Realizado */}
              <tr className="border-t border-border/50">
                <td className="px-3 py-2 font-medium sticky left-0 bg-background">Faturamento Realizado</td>
                {MONTHS.map((_, m) => {
                  const isFuture = m > currentMonth;
                  return (
                    <td key={m} className={`px-2 py-1.5 text-right tabular-nums text-xs ${isFuture ? "opacity-30" : ""}`}>
                      {isFuture ? (
                        "—"
                      ) : (
                        <EditableCell
                          value={realizedFat(m)}
                          onSave={(v) => onSaveOverride("faturamento", m, v)}
                          format={format}
                          className={isOverriddenF(m) ? "text-amber-600 font-semibold" : ""}
                        />
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-right font-bold bg-muted/40 tabular-nums text-xs">{format(totalRealF)}</td>
              </tr>
              {/* Atingimento Faturamento */}
              <tr className="border-t border-border/50 text-xs">
                <td className="px-3 py-1.5 text-muted-foreground sticky left-0 bg-background">% Atingimento Fat.</td>
                {MONTHS.map((_, m) => {
                  const isFuture = m > currentMonth;
                  const p = pct(realizedFat(m), metaMensalF(m));
                  return (
                    <td key={m} className={`px-2 py-1 text-right ${isFuture ? "opacity-30" : ""}`}>
                      {isFuture || metaMensalF(m) === 0 ? "—" : <Badge className={pctBadgeClass(p) + " text-[10px] px-1.5"}>{p}%</Badge>}
                    </td>
                  );
                })}
                <td className="px-3 py-1 text-right bg-muted/40">
                  {fatMetaAnual > 0 && <Badge className={pctBadgeClass(pct(totalRealF, fatMetaAnual)) + " text-[10px] px-1.5"}>{pct(totalRealF, fatMetaAnual)}%</Badge>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Charts */}
        <div className="grid md:grid-cols-2 gap-4 p-4 border-t border-border bg-muted/10">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Mês a mês — Vendas (Projetado vs Realizado)</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Projetado" fill="#cbd5e1" />
                <Bar dataKey="Realizado" fill={color} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Acumulado — Vendas</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={cumulativeData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="Acum. Projetado" stroke="#94a3b8" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Acum. Realizado" stroke={color} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Weekly grid ─────────────────────────────────────────────────────────────
function WeeklyProductGrid({
  year,
  salesByProductWeek,
  weeklyManual,
  weeks,
  format,
  onSaveWeekly,
}: {
  year: number;
  salesByProductWeek: Record<ProductId, Record<string, { vendas: number; faturamento: number }>>;
  weeklyManual: Record<string, number>; // `${product}:${week}:${indicador}` → value
  weeks: string[];
  format: (v: number) => string;
  onSaveWeekly: (product: ProductId, week: string, indicador: string, valor: number) => Promise<void>;
}) {
  const today = new Date();
  const todayMonday = mondayOf(today);
  const currentWeekIdx = weeks.findIndex((w) => w >= todayMonday);
  const rowsForProduct = [
    { key: "faturamento_total", label: "Faturamento Total", manual: true, fmt: format },
    { key: "faturamento_comercial", label: "Faturamento Comercial", manual: false, fmt: format },
    { key: "vendas_total", label: "Vendas Total", manual: true, fmt: (v: number) => v.toLocaleString("pt-BR") },
    { key: "vendas_comercial", label: "Vendas Comercial", manual: false, fmt: (v: number) => v.toLocaleString("pt-BR") },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Package className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Resultado semanal por produto ({year})</h3>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Faturamento/Vendas <strong>Total</strong> = manual (você digita) ·{" "}
            <strong>Comercial</strong> = automático do Clint (afiliado ou origem)
          </p>
        </div>
      </div>

      {PRODUCTS.map((prod) => (
        <Card key={prod.id} className="overflow-hidden shadow-sm" style={{ borderTop: `4px solid ${PRODUCT_HEX[prod.id]}` }}>
          <CardHeader className={`pb-3 ${prod.headerBg}`}>
            <div className="flex items-center gap-3">
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow-sm ${prod.accent}`}>
                <Package className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <CardTitle className={`text-base truncate ${prod.text}`}>{prod.label}</CardTitle>
                <p className="text-xs text-muted-foreground truncate">{prod.sublabel}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground min-w-[200px] sticky left-0 bg-muted/30 z-10">
                      Indicador
                    </th>
                    {weeks.map((w, i) => (
                      <th
                        key={w}
                        className={`px-3 py-3 text-right font-medium text-muted-foreground min-w-[90px] ${
                          currentWeekIdx === i ? `${prod.rowBg} text-foreground` : ""
                        }`}
                      >
                        {formatWeekLabel(w)}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground bg-muted min-w-[110px] sticky right-0 z-10 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rowsForProduct.map((row) => {
                    let rowTotal = 0;
                    return (
                      <tr key={row.key} className={`border-b border-border/40 last:border-b-0 ${row.manual ? prod.rowBg : "hover:bg-muted/20"}`}>
                        <td
                          className={`px-4 py-2.5 sticky left-0 z-10 text-xs font-medium ${
                            row.manual ? `text-foreground ${prod.rowBg}` : "text-muted-foreground bg-background"
                          }`}
                        >
                          {row.label}
                          {row.manual && <Pencil className="inline h-3 w-3 ml-1.5 opacity-50" />}
                        </td>
                        {weeks.map((w, i) => {
                          let value = 0;
                          if (row.manual) {
                            value = weeklyManual[`${prod.id}:${w}:${row.key}`] ?? 0;
                          } else if (row.key === "faturamento_comercial") {
                            value = salesByProductWeek[prod.id]?.[w]?.faturamento ?? 0;
                          } else if (row.key === "vendas_comercial") {
                            value = salesByProductWeek[prod.id]?.[w]?.vendas ?? 0;
                          }
                          rowTotal += value;
                          const isCurrent = currentWeekIdx === i;
                          return (
                            <td
                              key={w}
                              className={`px-3 py-2.5 text-right tabular-nums ${isCurrent ? prod.rowBg : ""}`}
                            >
                              {row.manual ? (
                                <EditableCell
                                  value={value}
                                  onSave={(v) => onSaveWeekly(prod.id, w, row.key, v)}
                                  format={row.fmt}
                                />
                              ) : value > 0 ? (
                                row.fmt(value)
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-2.5 text-right font-semibold bg-muted tabular-nums sticky right-0 z-10 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                          {rowTotal > 0 ? row.fmt(rowTotal) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
function Resultados() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { format } = useCurrency();
  const qc = useQueryClient();

  const saveWeekly = useServerFn(saveWeeklyResultFn);
  const saveOverride = useServerFn(saveMonthlyOverrideFn);
  const saveTarget = useServerFn(saveTargetFn);

  const salesQ = useQuery({
    queryKey: ["resultados_sales", year],
    queryFn: () => fetchSalesResultadosFn({ data: { year } }),
  });
  const targetsQ = useQuery({ queryKey: ["bi_targets"], queryFn: fetchTargets });
  const weeklyQ = useQuery({
    queryKey: ["bi_weekly_results", year],
    queryFn: () => fetchWeeklyResultsFn({ data: { year } }),
  });
  const overridesQ = useQuery({
    queryKey: ["bi_monthly_overrides", year],
    queryFn: () => fetchMonthlyOverridesFn({ data: { year } }),
  });
  const leadsQ = useQuery({
    queryKey: ["leads_realizado", year],
    queryFn: () => fetchLeadsRealizadoFn({ data: { year } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["bi_targets"] });
    qc.invalidateQueries({ queryKey: ["bi_weekly_results", year] });
    qc.invalidateQueries({ queryKey: ["bi_monthly_overrides", year] });
  };

  const weekly = weeklyQ.data ?? [];
  const overrides = overridesQ.data ?? [];
  const targets = targetsQ.data ?? [];
  const sales = salesQ.data ?? [];
  const leadsData = leadsQ.data ?? { total: 0, byMonth: {} };

  // ── Agregação por bloco (front_end / high_ticket) por mês
  const blocoMonthData = useMemo(() => {
    const result: Record<Bloco, Record<number, MonthReal>> = { front_end: {}, high_ticket: {} };
    for (const s of sales) {
      if (!isApproved(s.status)) continue;
      if (!isCommercial(s)) continue;
      const b = attributeBloco(s);
      if (!b) continue;
      if (b === "front_end" && isRenovacao(s)) continue;
      const d = s.data_venda ? new Date(s.data_venda) : null;
      if (!d) continue;
      const m = d.getUTCMonth();
      const cur = result[b][m] ?? { vendas: 0, faturamento: 0 };
      cur.vendas++;
      cur.faturamento += s.faturamento_liquido_brl ?? 0;
      result[b][m] = cur;
    }
    return result;
  }, [sales]);

  // ── Agregação por produto e semana (comercial)
  const salesByProductWeek = useMemo(() => {
    const result: Record<ProductId, Record<string, { vendas: number; faturamento: number }>> = {
      fgrs: {}, igt: {}, mse: {}, wgt: {}, wfgrs: {}, ldp: {}, accelerator: {},
    };
    for (const s of sales) {
      if (!isApproved(s.status)) continue;
      if (!isCommercial(s)) continue;
      const p = attributeProduct(s);
      if (!p) continue;
      if (!s.data_venda) continue;
      const wk = mondayOf(new Date(s.data_venda));
      const cur = result[p][wk] ?? { vendas: 0, faturamento: 0 };
      cur.vendas++;
      cur.faturamento += s.faturamento_liquido_brl ?? 0;
      result[p][wk] = cur;
    }
    return result;
  }, [sales]);

  // ── Targets por bloco (canais_id = 'front_end' | 'high_ticket')
  const targetsByBloco = useMemo(() => {
    const result: Record<Bloco, { month: number; indicador: string; valor: number }[]> = {
      front_end: [], high_ticket: [],
    };
    for (const t of targets) {
      if (!t.periodo) continue;
      const d = new Date(t.periodo + "T00:00:00Z");
      if (d.getUTCFullYear() !== year) continue;
      const m = d.getUTCMonth();
      if (t.channel_id === "front_end") result.front_end.push({ month: m, indicador: t.indicador, valor: t.valor });
      else if (t.channel_id === "high_ticket") result.high_ticket.push({ month: m, indicador: t.indicador, valor: t.valor });
    }
    return result;
  }, [targets, year]);

  // ── Overrides por bloco
  const overridesByBloco = useMemo(() => {
    const result: Record<Bloco, Record<string, number>> = { front_end: {}, high_ticket: {} };
    for (const o of overrides) {
      const d = new Date(o.periodo + "T00:00:00Z");
      if (d.getUTCFullYear() !== year) continue;
      const m = d.getUTCMonth();
      if (o.bloco === "front_end") result.front_end[`${o.indicador}:${m}`] = o.valor_brl;
      else if (o.bloco === "high_ticket") result.high_ticket[`${o.indicador}:${m}`] = o.valor_brl;
    }
    return result;
  }, [overrides, year]);

  // ── Weekly manual map
  const weeklyManual = useMemo(() => {
    const m: Record<string, number> = {};
    for (const w of weekly) m[`${w.product_id}:${w.week_start}:${w.indicador}`] = w.valor_brl;
    return m;
  }, [weekly]);

  // ── YTD metrics
  const ytd = useMemo(() => {
    const feTotals = Object.values(blocoMonthData.front_end).reduce(
      (s, m) => ({ vendas: s.vendas + m.vendas, faturamento: s.faturamento + m.faturamento }),
      { vendas: 0, faturamento: 0 },
    );
    // Apply overrides
    let feVendas = 0, feFat = 0;
    for (let m = 0; m < 12; m++) {
      feVendas += overridesByBloco.front_end[`vendas:${m}`] ?? blocoMonthData.front_end[m]?.vendas ?? 0;
      feFat += overridesByBloco.front_end[`faturamento:${m}`] ?? blocoMonthData.front_end[m]?.faturamento ?? 0;
    }
    let htVendas = 0, htFat = 0;
    for (let m = 0; m < 12; m++) {
      htVendas += overridesByBloco.high_ticket[`vendas:${m}`] ?? blocoMonthData.high_ticket[m]?.vendas ?? 0;
      htFat += overridesByBloco.high_ticket[`faturamento:${m}`] ?? blocoMonthData.high_ticket[m]?.faturamento ?? 0;
    }
    // Bilhetes M&S = product 'accelerator' (master_scale)
    let masVendas = 0;
    for (const w of Object.values(salesByProductWeek.accelerator)) masVendas += w.vendas;

    const feMetaVendas = targetsByBloco.front_end.filter((t) => t.indicador === "vendas").reduce((s, t) => s + t.valor, 0);
    const htMetaVendas = targetsByBloco.high_ticket.filter((t) => t.indicador === "vendas").reduce((s, t) => s + t.valor, 0);

    // Leads meta from bi_targets (indicador='leads' or 'leads_organicas'+'leads_pagas')
    let leadsMeta = 0;
    for (const t of targets) {
      if (!t.periodo) continue;
      if (new Date(t.periodo + "T00:00:00Z").getUTCFullYear() !== year) continue;
      if (t.indicador === "leads") leadsMeta += t.valor;
    }
    // Bilhetes M&S meta — from targets channel_id='mas' indicador='vendas'
    let masMetaVendas = 0;
    for (const t of targets) {
      if (!t.periodo) continue;
      if (new Date(t.periodo + "T00:00:00Z").getUTCFullYear() !== year) continue;
      if (t.channel_id === "mas" && t.indicador === "vendas") masMetaVendas += t.valor;
    }

    return {
      leadsReal: leadsData.total,
      leadsMeta: leadsMeta || 150000,
      feVendas, feMetaVendas, feFat,
      htVendas, htMetaVendas, htFat,
      masVendas, masMetaVendas: masMetaVendas || 500,
    };
  }, [blocoMonthData, overridesByBloco, salesByProductWeek, targetsByBloco, targets, year, leadsData]);

  const weeks = useMemo(() => weeksOfYear(year), [year]);
  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i);

  async function handleSaveTarget(bloco: Bloco, indicador: string, month: number, valor: number) {
    const periodo = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    await saveTarget({ data: { periodo, channel_id: bloco, indicador, valor } });
    invalidate();
    toast.success("Meta atualizada");
  }

  async function handleSaveOverride(bloco: Bloco, indicador: string, month: number, valor: number) {
    const periodo = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    await saveOverride({ data: { bloco, periodo, indicador, valor_brl: valor } });
    invalidate();
    toast.success("Realizado atualizado");
  }

  async function handleSaveWeekly(product: ProductId, week: string, indicador: string, valor: number) {
    await saveWeekly({ data: { product_id: product, week_start: week, indicador, valor_brl: valor } });
    invalidate();
    toast.success("Salvo");
  }

  const isLoading = salesQ.isLoading || targetsQ.isLoading || weeklyQ.isLoading || overridesQ.isLoading;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Dashboard de Resultados</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Ano:</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">Carregando dados…</div>
      ) : (
        <>
          {/* ── Bloco 1: Dashboard YTD ────────────────────────────── */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Realizado YTD vs Meta anual
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <YtdKpiCard
                icon={Users}
                label="Leads captados"
                realized={ytd.leadsReal}
                meta={ytd.leadsMeta}
              />
              <YtdKpiCard
                icon={Target}
                label="Front End (novas)"
                realized={ytd.feVendas}
                meta={ytd.feMetaVendas}
              />
              <YtdKpiCard
                icon={TrendingUp}
                label="High Ticket (novas + renov.)"
                realized={ytd.htVendas}
                meta={ytd.htMetaVendas}
              />
              <YtdKpiCard
                icon={Sparkles}
                label="Bilhetes M&S"
                realized={ytd.masVendas}
                meta={ytd.masMetaVendas}
              />
            </div>

            {/* Funil */}
            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Funil de Conversão YTD</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <FunnelStep label="Leads" value={ytd.leadsReal} color="#3b82f6" widthPct={100} />
                  <ConversionArrow
                    label={`Lead → Front End`}
                    from={ytd.leadsReal}
                    to={ytd.feVendas}
                    metaPct={2.12}
                  />
                  <FunnelStep
                    label="Front End (novas vendas)"
                    value={ytd.feVendas}
                    color="#10b981"
                    widthPct={ytd.leadsReal > 0 ? Math.max(20, (ytd.feVendas / ytd.leadsReal) * 100 * 20) : 30}
                  />
                  <ConversionArrow
                    label={`Front End → High Ticket`}
                    from={ytd.feVendas}
                    to={ytd.htVendas}
                    metaPct={13.6}
                  />
                  <FunnelStep
                    label="High Ticket (novas + renovações)"
                    value={ytd.htVendas}
                    color="#a16207"
                    widthPct={ytd.feVendas > 0 ? Math.max(15, (ytd.htVendas / ytd.feVendas) * 100 * 3) : 20}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Bloco 2: Front End ──────────────────────────────── */}
          <MonthlyBlock
            bloco="front_end"
            title="Vendas Front End — MGT + FGRS"
            subtitle="Novas vendas (sem renovação) — Formação Gestor de Redes Sociais"
            color="#10b981"
            monthData={blocoMonthData.front_end}
            overrides={overridesByBloco.front_end}
            targets={targetsByBloco.front_end}
            year={year}
            format={format}
            onSaveTarget={(ind, m, v) => handleSaveTarget("front_end", ind, m, v)}
            onSaveOverride={(ind, m, v) => handleSaveOverride("front_end", ind, m, v)}
          />

          {/* ── Bloco 3: High Ticket ────────────────────────────── */}
          <MonthlyBlock
            bloco="high_ticket"
            title="Vendas High Ticket — Accelerator + Traffic Master + All Blacks"
            subtitle="Novas vendas + renovações — MGT (IGT+MSE+WGT), Accelerator, Traffic Master, Master & Scale"
            color="#a16207"
            monthData={blocoMonthData.high_ticket}
            overrides={overridesByBloco.high_ticket}
            targets={targetsByBloco.high_ticket}
            year={year}
            format={format}
            onSaveTarget={(ind, m, v) => handleSaveTarget("high_ticket", ind, m, v)}
            onSaveOverride={(ind, m, v) => handleSaveOverride("high_ticket", ind, m, v)}
          />

          {/* ── Bloco 4: Weekly ────────────────────────────────── */}
          <WeeklyProductGrid
            year={year}
            salesByProductWeek={salesByProductWeek}
            weeklyManual={weeklyManual}
            weeks={weeks}
            format={format}
            onSaveWeekly={handleSaveWeekly}
          />
        </>
      )}
    </div>
  );
}

function FunnelStep({ label, value, color, widthPct }: { label: string; value: number; color: string; widthPct: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-[220px] text-sm font-medium">{label}</div>
      <div className="flex-1 h-10 bg-muted/30 rounded relative overflow-hidden">
        <div
          className="h-full rounded flex items-center justify-end pr-3 text-white font-semibold text-sm transition-all"
          style={{ width: `${Math.min(100, widthPct)}%`, backgroundColor: color, minWidth: "80px" }}
        >
          {value.toLocaleString("pt-BR")}
        </div>
      </div>
    </div>
  );
}

function ConversionArrow({ label, from, to, metaPct }: { label: string; from: number; to: number; metaPct: number }) {
  const realPct = from > 0 ? (to / from) * 100 : 0;
  const meetsMeta = realPct >= metaPct;
  return (
    <div className="flex items-center gap-3 pl-6 text-xs text-muted-foreground">
      <div className="min-w-[200px]">↓ {label}</div>
      <div>
        <span className={meetsMeta ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
          {realPct.toFixed(2)}%
        </span>{" "}
        realizado · meta {metaPct}%
      </div>
    </div>
  );
}
