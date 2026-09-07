import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchRoletaSpinsFn,
  setSellerRoletaFn,
  type RoletaSpinRow,
} from "@/lib/commission.functions";
import type { CommissionPeriod } from "@/lib/commission";
import { eurBrlRate } from "@/lib/eur-rate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Save } from "lucide-react";

const eur = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(v || 0);
const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v || 0);

export function RoletaManualCard({
  period,
  sellerNames,
}: {
  period: CommissionPeriod;
  sellerNames: string[];
}) {
  const qc = useQueryClient();
  const cot = eurBrlRate(period);
  const [valores, setValores] = useState<Record<string, string>>({});

  const { data: allSpins = [] } = useQuery({
    queryKey: ["roleta_spins"],
    queryFn: async () => (await fetchRoletaSpinsFn()) as RoletaSpinRow[],
  });

  const manuais = useMemo(
    () =>
      allSpins.filter(
        (s) =>
          s.source === "manual_mes" &&
          s.spin_date >= period.data_inicio &&
          s.spin_date <= period.data_fim,
      ),
    [allSpins, period],
  );

  useEffect(() => {
    const map: Record<string, string> = {};
    for (const s of manuais) {
      if (Number(s.prize_value_eur) > 0) map[s.seller_name] = String(s.prize_value_eur);
    }
    setValores(map);
  }, [manuais]);

  const totalEur = sellerNames.reduce((s, n) => s + (Number(valores[n]) || 0), 0);
  const totalPreenchidos = sellerNames.filter((n) => Number(valores[n]) > 0).length;

  const saveMut = useMutation({
    mutationFn: async () => {
      for (const name of sellerNames) {
        const v = Number(valores[name]) || 0;
        const atual = manuais.find((m) => m.seller_name === name);
        const atualV = atual ? Number(atual.prize_value_eur) || 0 : 0;
        if (v === atualV) continue;
        await setSellerRoletaFn({
          data: {
            period_id: period.id,
            seller_name: name,
            spin_date: period.data_fim,
            value_eur: v,
          },
        });
      }
    },
    onSuccess: () => {
      toast.success("Valores da roleta salvos");
      qc.invalidateQueries({ queryKey: ["roleta_spins"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Roleta do mês — valor manual</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Ao final do mês, escreva ao lado de cada vendedor o valor da roleta que ele ganhou
              (em EUR). O valor entra automaticamente no comissionamento. Deixe em branco (ou 0)
              para quem não teve prêmio.
            </p>
          </div>
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            <Save className="h-3.5 w-3.5 mr-1" />
            Salvar valores
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground bg-muted/40">
                <th className="py-2 px-3">Vendedor</th>
                <th className="py-2 px-3 w-[180px]">Valor da roleta (EUR)</th>
                <th className="py-2 px-3 text-right">Equivalente (BRL)</th>
              </tr>
            </thead>
            <tbody>
              {sellerNames.map((name) => {
                const v = Number(valores[name]) || 0;
                return (
                  <tr key={name} className="border-b border-border/40 last:border-0">
                    <td className="py-1.5 px-3 font-medium">{name}</td>
                    <td className="py-1.5 px-3">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-8 w-40"
                        placeholder="0,00"
                        value={valores[name] ?? ""}
                        onChange={(e) => setValores({ ...valores, [name]: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">
                      {v > 0 ? brl(v * cot) : "—"}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-muted/30 font-medium">
                <td className="py-2 px-3">Total do período</td>
                <td className="py-2 px-3 tabular-nums">{eur(totalEur)}</td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {totalEur > 0 ? brl(totalEur * cot) : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {totalPreenchidos > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            {totalPreenchidos} vendedor(es) com prêmio de roleta neste período.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
