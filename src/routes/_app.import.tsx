import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchImportsFn, fetchGroupCountsFn, importSalesFn } from "@/lib/data.functions";
import { parseSalesCsv, type SaleRow } from "@/lib/csv-parser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDateBR, formatInt } from "@/lib/format";
import { PRODUCT_GROUPS, getGroupById } from "@/lib/product-groups";

export const Route = createFileRoute("/_app/import")({
  component: ImportPage,
});

interface ImportLog {
  id: string;
  filename: string | null;
  total_rows: number;
  new_rows: number;
  updated_rows: number;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}

async function fetchImports(): Promise<ImportLog[]> {
  return (await fetchImportsFn()) as ImportLog[];
}

async function fetchGroupCounts(): Promise<Record<string, number>> {
  return await fetchGroupCountsFn();
}

function ImportPage() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ rows: SaleRow[]; filename: string } | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const { data: imports = [] } = useQuery({ queryKey: ["imports"], queryFn: fetchImports });
  const { data: groupCounts = {} } = useQuery({ queryKey: ["group-counts"], queryFn: fetchGroupCounts });

  const importMutation = useMutation({
    mutationFn: async ({ rows, filename }: { rows: SaleRow[]; filename: string }) => {
      // dedupe: pegar existentes
      const txs = rows.map((r) => r.transacao);
      const existing = new Set<string>();
      // consultar em lotes (limite de URL)
      const batchSize = 500;
      for (let i = 0; i < txs.length; i += batchSize) {
        const chunk = txs.slice(i, i + batchSize);
        const { data, error } = await supabase.from("sales").select("transacao").in("transacao", chunk);
        if (error) throw error;
        for (const r of data ?? []) existing.add((r as { transacao: string }).transacao);
      }

      // upsert em lotes
      const upBatch = 500;
      for (let i = 0; i < rows.length; i += upBatch) {
        const chunk = rows.slice(i, i + upBatch).map((r) => ({ ...r, updated_at: new Date().toISOString() }));
        const { error } = await supabase.from("sales").upsert(chunk, { onConflict: "transacao" });
        if (error) throw error;
      }

      const newRows = rows.filter((r) => !existing.has(r.transacao)).length;
      const updatedRows = rows.length - newRows;
      const dates = rows.map((r) => r.data_venda).filter((d): d is string => !!d).sort();

      await supabase.from("weekly_imports").insert({
        filename,
        total_rows: rows.length,
        new_rows: newRows,
        updated_rows: updatedRows,
        period_start: dates[0] ?? null,
        period_end: dates[dates.length - 1] ?? null,
      });

      return { newRows, updatedRows, total: rows.length };
    },
    onSuccess: (r) => {
      toast.success(`Importação concluída: ${r.newRows} novas, ${r.updatedRows} atualizadas`);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["imports"] });
      qc.invalidateQueries({ queryKey: ["group-counts"] });
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const handleFile = async (file: File) => {
    setIsParsing(true);
    try {
      const result = await parseSalesCsv(file);
      if (result.rows.length === 0) {
        toast.error("Nenhuma venda válida encontrada no arquivo.");
        return;
      }
      setPreview({ rows: result.rows, filename: file.name });
      if (result.errors.length) {
        toast.warning(`${result.errors.length} avisos no parsing — verifique o arquivo.`);
      }
    } catch (e) {
      toast.error(`Erro ao ler CSV: ${(e as Error).message}`);
    } finally {
      setIsParsing(false);
    }
  };

  // contagem do preview por grupo
  const previewGroups = preview
    ? Object.entries(
        preview.rows.reduce<Record<string, number>>((acc, r) => {
          acc[r.produto_grupo] = (acc[r.produto_grupo] ?? 0) + 1;
          return acc;
        }, {}),
      ).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Importar relatório semanal</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Suba o CSV exportado da plataforma. Os dados são deduplicados por <span className="text-foreground">Transação</span>: vendas existentes são <em>atualizadas</em> (ex.: aprovado → cancelado), e novas vendas são adicionadas ao histórico.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <label
            className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-secondary/30 px-6 py-12 text-center transition hover:bg-secondary/50 cursor-pointer"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">{isParsing ? "Processando…" : "Clique ou arraste o CSV aqui"}</p>
              <p className="text-xs text-muted-foreground mt-1">Separador ;  ·  formato HotPay/Hotmart</p>
            </div>
          </label>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">{preview.filename}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatInt(preview.rows.length)} transações únicas detectadas
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setPreview(null)} disabled={importMutation.isPending}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => importMutation.mutate(preview)}
                  disabled={importMutation.isPending}
                >
                  {importMutation.isPending ? "Importando…" : "Confirmar importação"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs font-medium text-muted-foreground mb-2">Distribuição por grupo:</p>
            <div className="flex flex-wrap gap-2">
              {previewGroups.map(([gid, count]) => {
                const g = getGroupById(gid);
                return (
                  <Badge key={gid} variant="secondary" className="gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />
                    {g.label}: {count}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mapeamento atual */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grupos de produtos</CardTitle>
          <p className="text-xs text-muted-foreground">
            Mapeamento automático por palavra-chave. Cada venda do CSV é classificada em um destes grupos.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PRODUCT_GROUPS.map((g) => (
              <div key={g.id} className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                  <span className="text-sm">{g.label}</span>
                </div>
                <span className="text-xs text-muted-foreground">{formatInt(groupCounts[g.id] ?? 0)} no histórico</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de importações</CardTitle>
        </CardHeader>
        <CardContent>
          {imports.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma importação registrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {imports.map((imp) => (
                <div key={imp.id} className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <div>
                      <p className="font-medium">{imp.filename ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateBR(imp.created_at)} · período: {formatDateBR(imp.period_start)} → {formatDateBR(imp.period_end)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <p>{formatInt(imp.total_rows)} linhas</p>
                    <p className="text-muted-foreground">+{imp.new_rows} novas · ~{imp.updated_rows} atualizadas</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Veja os resultados no <Link to="/" className="text-primary underline">Dashboard</Link>.
      </p>
    </div>
  );
}
