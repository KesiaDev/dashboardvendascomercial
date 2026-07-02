import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/lib/currency-context";
import {
  Target,
  TrendingUp,
  Users,
  Sparkles,
  Wallet,
  Percent,
  CreditCard,
  Calendar,
  Users2,
  Wrench,
  Handshake,
  GraduationCap,
  PiggyBank,
} from "lucide-react";

// ── Dados da Planilha "Metas 2026 - LL Midia" ───────────────────────────────
// Todos os valores em EUR (planilha usa cotação 6,32 R$/EUR)
export type ScenarioKey = "meta1" | "meta2" | "meta3";

export const SCENARIOS: Record<
  ScenarioKey,
  {
    label: string;
    hint: string;
    color: string;
    // Principal
    leads: number;
    vendasFE: number;
    vendasHT: number;
    fatPrincipalEur: number;
    // Premissas
    convLeadFE: number; // %
    convFEHT: number; // %
    ticketFE: number; // €
    ticketHT: number; // €
    // Outras receitas
    renovFE: number;
    bilhetesMS: number;
    // Custos
    trafego: number;
    impostosPct: number;
    meioPagPct: number;
    comissoes: number;
    eventosEntrega: number;
    eventosMS: number;
    equipe: number;
    ferramentas: number;
    parceiros: number;
    analistas: number;
    treinamentos: number;
    // Resultado
    saldo: number;
    margemPct: number;
    margemAlvoPct: number;
  }
> = {
  meta1: {
    label: "Meta 1",
    hint: "Conservador",
    color: "#64748b",
    leads: 150000,
    vendasFE: 3000,
    vendasHT: 330,
    fatPrincipalEur: 2025000,
    convLeadFE: 2.0,
    convFEHT: 11.0,
    ticketFE: 400,
    ticketHT: 2500,
    renovFE: 120000,
    bilhetesMS: 50000,
    trafego: 750000,
    impostosPct: 11.0,
    meioPagPct: 6.0,
    comissoes: 93100,
    eventosEntrega: 75000,
    eventosMS: 113000,
    equipe: 286708.86,
    ferramentas: 40000,
    parceiros: 50000,
    analistas: 15000,
    treinamentos: 80000,
    saldo: 319041.14,
    margemPct: 14.5,
    margemAlvoPct: 20,
  },
  meta2: {
    label: "Meta 2",
    hint: "Realista",
    color: "#3b82f6",
    leads: 150000,
    vendasFE: 3000,
    vendasHT: 450,
    fatPrincipalEur: 2325000,
    convLeadFE: 2.0,
    convFEHT: 15.0,
    ticketFE: 400,
    ticketHT: 2500,
    renovFE: 120000,
    bilhetesMS: 50000,
    trafego: 750000,
    impostosPct: 11.0,
    meioPagPct: 6.0,
    comissoes: 99100,
    eventosEntrega: 75000,
    eventosMS: 113000,
    equipe: 286708.86,
    ferramentas: 40000,
    parceiros: 50000,
    analistas: 15000,
    treinamentos: 80000,
    saldo: 562041.14,
    margemPct: 22.5,
    margemAlvoPct: 25,
  },
  meta3: {
    label: "Meta 3",
    hint: "Otimista",
    color: "#10b981",
    leads: 150000,
    vendasFE: 3000,
    vendasHT: 570,
    fatPrincipalEur: 2625000,
    convLeadFE: 2.0,
    convFEHT: 19.0,
    ticketFE: 400,
    ticketHT: 2500,
    renovFE: 120000,
    bilhetesMS: 50000,
    trafego: 750000,
    impostosPct: 11.0,
    meioPagPct: 6.0,
    comissoes: 105100,
    eventosEntrega: 75000,
    eventosMS: 113000,
    equipe: 286708.86,
    ferramentas: 40000,
    parceiros: 50000,
    analistas: 15000,
    treinamentos: 80000,
    saldo: 805041.14,
    margemPct: 28.8,
    margemAlvoPct: 30,
  },
};

// ── Actual metrics received from parent (Realizado YTD) ────────────────────
export type Realized = {
  leads: number;
  vendasFE: number;
  vendasHT: number;
  faturamentoBrl: number; // total (FE+HT+outros)
  faturamentoFEBrl: number;
  faturamentoHTBrl: number;
};

// ── Utils ───────────────────────────────────────────────────────────────────
function pct(real: number, meta: number): number {
  if (meta === 0) return real > 0 ? 100 : 0;
  return Math.round((real / meta) * 100);
}
function pctBadgeClass(p: number): string {
  if (p >= 100) return "bg-emerald-600 text-white";
  if (p >= 70) return "bg-yellow-500 text-white";
  return "bg-red-600 text-white";
}

// ── Component ───────────────────────────────────────────────────────────────
export function StrategicView({
  realized,
  brlPerEur,
}: {
  realized: Realized;
  brlPerEur: number;
}) {
  const [scenario, setScenario] = useState<ScenarioKey>("meta2");
  const { format, currency } = useCurrency();
  const s = SCENARIOS[scenario];

  // Convert EUR-based values to BRL for the format() helper (which expects BRL).
  const eurToBrl = (v: number) => v * brlPerEur;

  // Derived scenario values
  const outrasReceitas = s.renovFE + s.bilhetesMS;
  const fatTotal = s.fatPrincipalEur + outrasReceitas;
  const impostos = fatTotal * (s.impostosPct / 100);
  const meioPag = fatTotal * (s.meioPagPct / 100);
  const eventosTotal = s.eventosEntrega + s.eventosMS;
  const custoTotal =
    s.trafego +
    impostos +
    meioPag +
    s.comissoes +
    eventosTotal +
    s.equipe +
    s.ferramentas +
    s.parceiros +
    s.analistas +
    s.treinamentos;
  const saldoCalc = fatTotal - custoTotal;

  // Realized funnel metrics
  const realConvLeadFE = realized.leads > 0 ? (realized.vendasFE / realized.leads) * 100 : 0;
  const realConvFEHT = realized.vendasFE > 0 ? (realized.vendasHT / realized.vendasFE) * 100 : 0;
  const realFatEur = realized.faturamentoBrl / brlPerEur;

  return (
    <div className="space-y-6">
      {/* Header with scenario selector */}
      <Card className="border-2" style={{ borderColor: s.color }}>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5" style={{ color: s.color }} />
                Visão Estratégica Anual 2026
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Cenários da Planilha "Metas 2026 — LL Midia" · Cotação de referência 1€ = R$ {brlPerEur.toFixed(2)}
              </p>
            </div>
            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg">
              {(Object.keys(SCENARIOS) as ScenarioKey[]).map((k) => {
                const sc = SCENARIOS[k];
                const active = scenario === k;
                return (
                  <Button
                    key={k}
                    size="sm"
                    variant={active ? "default" : "ghost"}
                    onClick={() => setScenario(k)}
                    style={active ? { backgroundColor: sc.color, borderColor: sc.color } : undefined}
                    className="h-8"
                  >
                    <div className="text-left leading-tight">
                      <div className="text-xs font-semibold">{sc.label}</div>
                      <div className={`text-[10px] ${active ? "opacity-90" : "text-muted-foreground"}`}>
                        {sc.hint}
                      </div>
                    </div>
                  </Button>
                );
              })}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Bloco Principal — meta anual vs realizado */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Principal — Meta Anual vs Realizado YTD
        </h4>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetaCard
            icon={Users}
            label="Leads"
            realized={realized.leads}
            meta={s.leads}
            color={s.color}
            format={(v) => v.toLocaleString("pt-BR")}
          />
          <MetaCard
            icon={Target}
            label="Vendas Front End"
            realized={realized.vendasFE}
            meta={s.vendasFE}
            color={s.color}
            format={(v) => v.toLocaleString("pt-BR")}
          />
          <MetaCard
            icon={TrendingUp}
            label="Vendas High Ticket"
            hint="inclui renovações"
            realized={realized.vendasHT}
            meta={s.vendasHT}
            color={s.color}
            format={(v) => v.toLocaleString("pt-BR")}
          />
          <MetaCard
            icon={Wallet}
            label="Faturamento Principal"
            realized={realized.faturamentoBrl}
            meta={eurToBrl(s.fatPrincipalEur)}
            color={s.color}
            format={format}
          />
        </div>
      </div>

      {/* Premissas de funil */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Premissas de Funil — Realizado vs Meta
        </h4>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <PremissaCard
            icon={Percent}
            label="Conversão Lead → FE"
            realizado={`${realConvLeadFE.toFixed(2)}%`}
            meta={`${s.convLeadFE.toFixed(1)}%`}
            attained={realConvLeadFE >= s.convLeadFE}
          />
          <PremissaCard
            icon={Percent}
            label="Conversão FE → HT"
            realizado={`${realConvFEHT.toFixed(1)}%`}
            meta={`${s.convFEHT.toFixed(1)}%`}
            attained={realConvFEHT >= s.convFEHT}
          />
          <PremissaCard
            icon={Wallet}
            label="Ticket Médio FE"
            realizado={
              realized.vendasFE > 0
                ? format((realized.faturamentoBrl * 0) + (s.ticketFE * brlPerEur * 0)) || "—"
                : "—"
            }
            meta={format(s.ticketFE * brlPerEur)}
            attained={true}
            note="ver /agente para calc real"
          />
          <PremissaCard
            icon={Wallet}
            label="Ticket Médio HT"
            realizado="—"
            meta={format(s.ticketHT * brlPerEur)}
            attained={true}
            note="ver /agente para calc real"
          />
        </div>
      </div>

      {/* Outras Receitas + Faturamento Total */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <Sparkles className="h-4 w-4" /> Renovações FE
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{format(eurToBrl(s.renovFE))}</div>
            <div className="text-xs text-muted-foreground mt-1">meta anual — cenário {s.label}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <Sparkles className="h-4 w-4" /> Bilhetes Master & Scale
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{format(eurToBrl(s.bilhetesMS))}</div>
            <div className="text-xs text-muted-foreground mt-1">meta anual — cenário {s.label}</div>
          </CardContent>
        </Card>
        <Card className="border-2" style={{ borderColor: s.color }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2" style={{ color: s.color }}>
              <TrendingUp className="h-4 w-4" /> Faturamento Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums" style={{ color: s.color }}>
              {format(eurToBrl(fatTotal))}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Principal + Outras Receitas</div>
          </CardContent>
        </Card>
      </div>

      {/* P&L / Estrutura de custos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <PiggyBank className="h-4 w-4" /> Estrutura de Custos & Margem — {s.label}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Meta anual · valores em {currency}. Percentuais calculados sobre Faturamento Total ({format(eurToBrl(fatTotal))}).
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Categoria</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Valor</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">% do faturamento</th>
                </tr>
              </thead>
              <tbody>
                <CostRow
                  icon={TrendingUp}
                  label="Tráfego (CPL €5)"
                  valueBrl={eurToBrl(s.trafego)}
                  totalBrl={eurToBrl(fatTotal)}
                  format={format}
                />
                <CostRow
                  icon={Percent}
                  label={`Impostos (${s.impostosPct.toFixed(1)}%)`}
                  valueBrl={eurToBrl(impostos)}
                  totalBrl={eurToBrl(fatTotal)}
                  format={format}
                />
                <CostRow
                  icon={CreditCard}
                  label={`Meio de Pagamento (${s.meioPagPct.toFixed(1)}%)`}
                  valueBrl={eurToBrl(meioPag)}
                  totalBrl={eurToBrl(fatTotal)}
                  format={format}
                />
                <CostRow
                  icon={Handshake}
                  label="Comissões (FE 17,5% · HT 10% · Eventos 10%)"
                  valueBrl={eurToBrl(s.comissoes)}
                  totalBrl={eurToBrl(fatTotal)}
                  format={format}
                />
                <CostRow
                  icon={Calendar}
                  label="Eventos (Entrega + Master & Scale)"
                  valueBrl={eurToBrl(eventosTotal)}
                  totalBrl={eurToBrl(fatTotal)}
                  format={format}
                />
                <CostRow
                  icon={Users2}
                  label="Equipe (fixo)"
                  valueBrl={eurToBrl(s.equipe)}
                  totalBrl={eurToBrl(fatTotal)}
                  format={format}
                  divider
                />
                <CostRow
                  icon={Wrench}
                  label="Ferramentas"
                  valueBrl={eurToBrl(s.ferramentas)}
                  totalBrl={eurToBrl(fatTotal)}
                  format={format}
                />
                <CostRow
                  icon={Handshake}
                  label="Parceiros"
                  valueBrl={eurToBrl(s.parceiros)}
                  totalBrl={eurToBrl(fatTotal)}
                  format={format}
                />
                <CostRow
                  icon={Users2}
                  label="Analistas"
                  valueBrl={eurToBrl(s.analistas)}
                  totalBrl={eurToBrl(fatTotal)}
                  format={format}
                />
                <CostRow
                  icon={GraduationCap}
                  label="Treinamentos & Consultorias"
                  valueBrl={eurToBrl(s.treinamentos)}
                  totalBrl={eurToBrl(fatTotal)}
                  format={format}
                />
                <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className="px-4 py-3">Custo Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{format(eurToBrl(custoTotal))}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {((custoTotal / fatTotal) * 100).toFixed(1)}%
                  </td>
                </tr>
                <tr
                  className="border-t border-border font-bold"
                  style={{ backgroundColor: `${s.color}15` }}
                >
                  <td className="px-4 py-3" style={{ color: s.color }}>
                    Saldo (Faturamento − Custos)
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: s.color }}>
                    {format(eurToBrl(saldoCalc))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge
                      className={pctBadgeClass(pct(s.margemPct, s.margemAlvoPct)) + " text-xs"}
                    >
                      {s.margemPct.toFixed(1)}% · alvo {s.margemAlvoPct}%
                    </Badge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Comparativo dos 3 cenários */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Comparativo dos 3 Cenários</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Indicador</th>
                  {(Object.keys(SCENARIOS) as ScenarioKey[]).map((k) => (
                    <th
                      key={k}
                      className="text-right px-4 py-2 font-medium"
                      style={{ color: SCENARIOS[k].color }}
                    >
                      {SCENARIOS[k].label} · {SCENARIOS[k].hint}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&_tr]:border-t [&_tr]:border-border/40">
                <CompareRow label="Leads" get={(sc) => sc.leads.toLocaleString("pt-BR")} />
                <CompareRow label="Vendas Front End" get={(sc) => sc.vendasFE.toLocaleString("pt-BR")} />
                <CompareRow label="Vendas High Ticket" get={(sc) => sc.vendasHT.toLocaleString("pt-BR")} />
                <CompareRow label="Conv. FE → HT" get={(sc) => `${sc.convFEHT.toFixed(1)}%`} />
                <CompareRow label="Faturamento Total" get={(sc) => format(eurToBrl(sc.fatPrincipalEur + sc.renovFE + sc.bilhetesMS))} />
                <CompareRow label="Saldo" get={(sc) => format(eurToBrl(sc.saldo))} />
                <CompareRow label="Margem" get={(sc) => `${sc.margemPct.toFixed(1)}%`} bold />
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────────────
function MetaCard({
  icon: Icon,
  label,
  hint,
  realized,
  meta,
  color,
  format,
}: {
  icon: any;
  label: string;
  hint?: string;
  realized: number;
  meta: number;
  color: string;
  format: (v: number) => string;
}) {
  const p = pct(realized, meta);
  return (
    <Card className="overflow-hidden">
      <div className="h-1" style={{ backgroundColor: color }} />
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
            <Icon className="h-3.5 w-3.5" />
            {label}
          </div>
          <Badge className={pctBadgeClass(p) + " text-[10px]"}>{p}%</Badge>
        </div>
        {hint && <p className="text-[10px] text-muted-foreground/70">{hint}</p>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{format(realized)}</div>
        <div className="text-xs text-muted-foreground mt-1">Meta: {format(meta)}</div>
      </CardContent>
    </Card>
  );
}

function PremissaCard({
  icon: Icon,
  label,
  realizado,
  meta,
  attained,
  note,
}: {
  icon: any;
  label: string;
  realizado: string;
  meta: string;
  attained: boolean;
  note?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
      </CardHeader>
      <CardContent>
        <div className={`text-xl font-bold tabular-nums ${attained ? "text-emerald-600" : "text-amber-600"}`}>
          {realizado}
        </div>
        <div className="text-xs text-muted-foreground mt-1">Meta: {meta}</div>
        {note && <div className="text-[10px] text-muted-foreground/70 mt-1 italic">{note}</div>}
      </CardContent>
    </Card>
  );
}

function CostRow({
  icon: Icon,
  label,
  valueBrl,
  totalBrl,
  format,
  divider,
}: {
  icon: any;
  label: string;
  valueBrl: number;
  totalBrl: number;
  format: (v: number) => string;
  divider?: boolean;
}) {
  const p = totalBrl > 0 ? (valueBrl / totalBrl) * 100 : 0;
  return (
    <tr className={`border-t border-border/40 ${divider ? "border-t-2 border-border/70" : ""}`}>
      <td className="px-4 py-2 flex items-center gap-2 text-sm">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
      </td>
      <td className="px-4 py-2 text-right tabular-nums">{format(valueBrl)}</td>
      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{p.toFixed(1)}%</td>
    </tr>
  );
}

function CompareRow({
  label,
  get,
  bold,
}: {
  label: string;
  get: (sc: (typeof SCENARIOS)[ScenarioKey]) => string;
  bold?: boolean;
}) {
  return (
    <tr className={bold ? "font-semibold bg-muted/20" : ""}>
      <td className="px-4 py-2 text-muted-foreground">{label}</td>
      {(Object.keys(SCENARIOS) as ScenarioKey[]).map((k) => (
        <td key={k} className="px-4 py-2 text-right tabular-nums" style={{ color: SCENARIOS[k].color }}>
          {get(SCENARIOS[k])}
        </td>
      ))}
    </tr>
  );
}
