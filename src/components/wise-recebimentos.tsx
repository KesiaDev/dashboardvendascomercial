import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { syncWiseSheetFn } from "@/lib/wise-sheet.functions";
import type { WisePayment } from "@/lib/commission";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { RefreshCw, AlertTriangle, ExternalLink } from "lucide-react";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1tpjc0UiXhmQKzZPP58hep9EqLCKfDXIl4gjRkB7qI5E/edit";

function money(v: number, moeda: "BRL" | "EUR" = "BRL") {
  return v.toLocaleString("pt-BR", { style: "currency", currency: moeda });
}

function fmtDate(d: string) {
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

export function WiseRecebimentosCard({ payments }: { payments: WisePayment[] }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [onlyInad, setOnlyInad] = useState(false);

  const syncMut = useMutation({
    mutationFn: async () => syncWiseSheetFn({ data: {} }),
    onSuccess: (r: any) => {
      toast.success(
        `Planilha Wise sincronizada · ${r.imported} recebimentos em ${r.tabs} abas · ${r.inadimplentes} inadimplências`,
      );
      qc.invalidateQueries({ queryKey: ["comm_wise"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lastSync = useMemo(() => {
    const ts = payments.map((p) => p.synced_at).filter(Boolean) as string[];
    if (ts.length === 0) return null;
    return new Date(ts.sort().at(-1)!).toLocaleString("pt-BR");
  }, [payments]);

  const totals = useMemo(() => {
    const inad = payments.filter((p) => p.inadimplente);
    return {
      total_eur: payments.reduce((s, p) => s + (p.valor_eur ?? 0), 0),
      total_brl: payments.reduce((s, p) => s + (p.valor_brl ?? 0), 0),
      inad_count: inad.length,
      inad_eur: inad.reduce((s, p) => s + (p.valor_eur ?? 0), 0),
    };
  }, [payments]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments
      .filter((p) => (onlyInad ? p.inadimplente : true))
      .filter((p) =>
        q
          ? `${p.cliente} ${p.descricao ?? ""} ${p.email_cliente ?? ""}`
              .toLowerCase()
              .includes(q)
          : true,
      )
      .slice(0, 200);
  }, [payments, search, onlyInad]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Recebimentos Wise (EUR)</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Espelho automático da planilha do Wise · usado para acompanhar inadimplência
              {lastSync && ` · última sincronização ${lastSync}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={SHEET_URL} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-1" />
                Abrir planilha
              </a>
            </Button>
            <Button
              size="sm"
              onClick={() => syncMut.mutate()}
              disabled={syncMut.isPending}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${syncMut.isPending ? "animate-spin" : ""}`}
              />
              {syncMut.isPending ? "Sincronizando…" : "Sincronizar planilha"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Recebido (EUR)</p>
            <p className="text-2xl font-bold tabular-nums">{money(totals.total_eur, "EUR")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Equivalente (BRL)</p>
            <p className="text-2xl font-bold tabular-nums">{money(totals.total_brl)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Recebimentos</p>
            <p className="text-2xl font-bold tabular-nums">{payments.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-500" /> Inadimplências
            </p>
            <p className="text-2xl font-bold tabular-nums text-amber-500">
              {totals.inad_count}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {money(totals.inad_eur, "EUR")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="w-[220px]"
            placeholder="Buscar cliente, e-mail ou produto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button
            variant={onlyInad ? "default" : "outline"}
            size="sm"
            onClick={() => setOnlyInad((v) => !v)}
          >
            Só inadimplentes
          </Button>
        </div>

        <div className="overflow-x-auto rounded border border-border/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-muted-foreground">
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Produto</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2 text-right">EUR</th>
                <th className="px-3 py-2 text-right">BRL</th>
                <th className="px-3 py-2">Mês</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    Nenhum recebimento. Clique em “Sincronizar planilha”.
                  </td>
                </tr>
              )}
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-border/40 last:border-0">
                  <td className="px-3 py-1.5 tabular-nums">{fmtDate(p.data_pagamento)}</td>
                  <td className="px-3 py-1.5">
                    <div className="font-medium">{p.cliente}</div>
                    {p.email_cliente && (
                      <div className="text-xs text-muted-foreground">{p.email_cliente}</div>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {p.descricao?.split("-")[0]?.trim() || "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    {p.inadimplente ? (
                      <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
                        Inadimplente
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">{p.situacao ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {money(p.valor_eur ?? 0, "EUR")}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {money(p.valor_brl ?? 0)}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">
                    {p.sheet_tab ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {payments.length > rows.length && (
          <p className="text-xs text-muted-foreground">
            Mostrando {rows.length} de {payments.length} recebimentos.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
