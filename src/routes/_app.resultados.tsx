import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchTargets } from "@/lib/bi";
import { fetchSalesResultadosFn, type SaleResultado } from "@/lib/resultados.functions";
import { useCurrency } from "@/lib/currency-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_app/resultados")({
  component: Resultados,
});

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type ChannelId = "fgrs" | "igt" | "perpetuo_mentoria" | "webinar_mentoria" | "ldp";

const CHANNELS: { id: ChannelId; label: string; sublabel: string }[] = [
  { id: "fgrs", label: "Formação (FGRS)", sublabel: "Formação Gestor Redes Sociais" },
  { id: "igt", label: "Mentoria via Imersão (IGT)", sublabel: "MGT via IGT — SCK: igt*" },
  { id: "perpetuo_mentoria", label: "Mentoria via Perpétuos (MSE)", sublabel: "MGT via E-book, Mini-curso, Sessão — SCK: mse*" },
  { id: "webinar_mentoria", label: "Mentoria via Webinar (WGT)", sublabel: "MGT residual — sem IGT/MSE" },
  { id: "ldp", label: "Accelerator via Live (LDP)", sublabel: "Programa Accelerator" },
];

function isApproved(status: string) {
  const s = (status ?? "").toLowerCase();
  return s === "aprovado" || s === "completo" || s === "approved" || s === "completed";
}

function attributeChannel(sale: SaleResultado): ChannelId | null {
  const isCommercial = sale.nome_afiliado != null || sale.origem_checkout != null;
  if (!isCommercial) return null;

  const pg = (sale.produto_grupo ?? "").toLowerCase();
  const sck = (sale.origem_checkout ?? "").toLowerCase();

  if (pg === "formacao_rs") return "fgrs";
  if (pg === "accelerator" || pg === "renov_acc") return "ldp";
  if (pg === "gtp_au" || pg === "renov_mentoria") {
    if (sck.startsWith("igt")) return "igt";
    if (sck.startsWith("mse")) return "perpetuo_mentoria";
    return "webinar_mentoria";
  }
  return null;
}

function isRenovacao(sale: SaleResultado): boolean {
  const pg = (sale.produto_grupo ?? "").toLowerCase();
  if (pg === "renov_mentoria" || pg === "renov_acc" || pg === "renov_tm") return true;
  const name = (sale.produto_original ?? "").toLowerCase();
  return name.includes("renova");
}

type MonthData = {
  vendas: number;
  faturamento: number;
};

function pct(real: number, meta: number): number {
  if (meta === 0) return real > 0 ? 100 : 0;
  return Math.round((real / meta) * 100);
}

function PctBadge({ p }: { p: number }) {
  if (p >= 100) return <Badge className="bg-emerald-600 text-white text-xs">{p}%</Badge>;
  if (p >= 70) return <Badge className="bg-yellow-500 text-white text-xs">{p}%</Badge>;
  return <Badge className="bg-red-600 text-white text-xs">{p}%</Badge>;
}

function ChannelCard({
  channel,
  monthData,
  targets,
  year,
  format,
}: {
  channel: (typeof CHANNELS)[0];
  monthData: Record<number, MonthData>;
  targets: { month: number; indicador: string; valor: number }[];
  year: number;
  format: (v: number | null | undefined) => string;
}) {
  const currentMonth = new Date().getFullYear() === year ? new Date().getMonth() : 11;

  const vendaTargets = Object.fromEntries(
    targets.filter((t) => t.indicador === "vendas").map((t) => [t.month, t.valor]),
  );
  const fatTargets = Object.fromEntries(
    targets.filter((t) => t.indicador === "faturamento").map((t) => [t.month, t.valor]),
  );

  const totalVendasReal = Object.values(monthData).reduce((s, m) => s + m.vendas, 0);
  const totalVendasMeta = Object.values(vendaTargets).reduce((s, v) => s + v, 0);
  const totalFatReal = Object.values(monthData).reduce((s, m) => s + m.faturamento, 0);
  const totalFatMeta = Object.values(fatTargets).reduce((s, v) => s + v, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{channel.label}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{channel.sublabel}</p>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold">{totalVendasReal} vendas</div>
            <div className="text-muted-foreground">{format(totalFatReal)}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-muted/40">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground w-14">Mês</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Vendas</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Meta</th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground w-16">%</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Faturamento</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Meta Fat.</th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground w-16">%</th>
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((label, idx) => {
                const isFuture = idx > currentMonth;
                const data = monthData[idx] ?? { vendas: 0, faturamento: 0 };
                const vMeta = vendaTargets[idx] ?? 0;
                const fMeta = fatTargets[idx] ?? 0;
                const vPct = pct(data.vendas, vMeta);
                const fPct = pct(data.faturamento, fMeta);
                return (
                  <tr
                    key={idx}
                    className={`border-t border-border/50 ${isFuture ? "opacity-40" : ""}`}
                  >
                    <td className="px-4 py-2 font-medium text-muted-foreground">{label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{data.vendas}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{vMeta || "—"}</td>
                    <td className="px-3 py-2 text-center">
                      {!isFuture && vMeta > 0 ? <PctBadge p={vPct} /> : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{data.faturamento > 0 ? format(data.faturamento) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fMeta > 0 ? format(fMeta) : "—"}</td>
                    <td className="px-3 py-2 text-center">
                      {!isFuture && fMeta > 0 ? <PctBadge p={fPct} /> : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                <td className="px-4 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{totalVendasReal}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{totalVendasMeta || "—"}</td>
                <td className="px-3 py-2 text-center">
                  {totalVendasMeta > 0 ? <PctBadge p={pct(totalVendasReal, totalVendasMeta)} /> : <span className="text-muted-foreground text-xs">—</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{totalFatReal > 0 ? format(totalFatReal) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{totalFatMeta > 0 ? format(totalFatMeta) : "—"}</td>
                <td className="px-3 py-2 text-center">
                  {totalFatMeta > 0 ? <PctBadge p={pct(totalFatReal, totalFatMeta)} /> : <span className="text-muted-foreground text-xs">—</span>}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Resultados() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { format } = useCurrency();

  const { data: rawSales = [], isLoading: loadingSales } = useQuery({
    queryKey: ["resultados_sales", year],
    queryFn: () => fetchSalesResultadosFn({ data: { year } }),
  });

  const { data: allTargets = [], isLoading: loadingTargets } = useQuery({
    queryKey: ["bi_targets"],
    queryFn: fetchTargets,
  });

  const channelMonthData = useMemo(() => {
    const result: Record<ChannelId, Record<number, MonthData>> = {
      fgrs: {},
      igt: {},
      perpetuo_mentoria: {},
      webinar_mentoria: {},
      ldp: {},
    };

    for (const sale of rawSales) {
      if (!isApproved(sale.status)) continue;
      const ch = attributeChannel(sale);
      if (!ch) continue;
      const d = sale.data_venda ? new Date(sale.data_venda) : null;
      if (!d) continue;
      const month = d.getUTCMonth();
      const bucket = result[ch][month] ?? { vendas: 0, faturamento: 0 };
      if (!isRenovacao(sale)) bucket.vendas++;
      bucket.faturamento += sale.faturamento_liquido_brl ?? 0;
      result[ch][month] = bucket;
    }

    return result;
  }, [rawSales]);

  // Build targets per channel: { [channelId]: { [month]: { indicador: valor } }[] }
  const channelTargets = useMemo(() => {
    const result: Record<ChannelId, { month: number; indicador: string; valor: number }[]> = {
      fgrs: [],
      igt: [],
      perpetuo_mentoria: [],
      webinar_mentoria: [],
      ldp: [],
    };
    for (const t of allTargets) {
      const chId = t.channel_id as ChannelId | null;
      if (!chId || !(chId in result)) continue;
      if (!t.periodo) continue;
      const periodoDate = new Date(t.periodo + "T00:00:00Z");
      const periodoYear = periodoDate.getUTCFullYear();
      if (periodoYear !== year) continue;
      const month = periodoDate.getUTCMonth();
      result[chId].push({ month, indicador: t.indicador, valor: t.valor });
    }
    return result;
  }, [allTargets, year]);

  const isLoading = loadingSales || loadingTargets;

  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Resultados por Canal</h2>
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
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Carregando dados...
        </div>
      ) : (
        <div className="space-y-5">
          {CHANNELS.map((ch) => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              monthData={channelMonthData[ch.id]}
              targets={channelTargets[ch.id]}
              year={year}
              format={format}
            />
          ))}
        </div>
      )}
    </div>
  );
}
