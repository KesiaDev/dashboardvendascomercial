import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchImportsFn, fetchGroupCountsFn, importSalesFn } from "@/lib/data.functions";
import { parseSalesCsv, type SaleRow } from "@/lib/csv-parser";
import {
  parseProdutividadeCsv,
  parseNegociosTrabalhadosCsv,
  parseFollowupCsv,
  type ProdutividadeRow,
  type NegociosTrabalhadosRow,
  type FollowupRow,
} from "@/lib/team-activity-csv";
import { importProdutividade, importNegociosTrabalhados, importFollowup } from "@/lib/team-activity.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Trash2, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { formatDateBR, formatInt } from "@/lib/format";
import { PRODUCT_GROUPS, getGroupById } from "@/lib/product-groups";
import { format as formatDate } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

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

  const [activityRange, setActivityRange] = useState<DateRange | undefined>();
  const [produtividadePreview, setProdutividadePreview] = useState<{ rows: ProdutividadeRow[]; filename: string } | null>(null);
  const [trabalhadosPreview, setTrabalhadosPreview] = useState<{ rows: NegociosTrabalhadosRow[]; filename: string } | null>(null);
  const [followupPreview, setFollowupPreview] = useState<{ rows: FollowupRow[]; filename: string } | null>(null);

  const { data: imports = [] } = useQuery({ queryKey: ["imports"], queryFn: fetchImports });
  const { data: groupCounts = {} } = useQuery({ queryKey: ["group-counts"], queryFn: fetchGroupCounts });

  const importMutation = useMutation({
    mutationFn: async ({ rows, filename }: { rows: SaleRow[]; filename: string }) => {
      return await importSalesFn({ data: { rows: rows as any, filename } });
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

  const periodoInicio = activityRange?.from ? formatDate(activityRange.from, "yyyy-MM-dd") : null;
  const periodoFim = activityRange?.to ? formatDate(activityRange.to, "yyyy-MM-dd") : null;

  const produtividadeMutation = useMutation({
    mutationFn: async () => {
      if (!periodoInicio || !periodoFim || !produtividadePreview) throw new Error("Selecione o período e o arquivo");
      return await importProdutividade({ data: { periodoInicio, periodoFim, rows: produtividadePreview.rows } });
    },
    onSuccess: (r) => {
      toast.success(`Produtividade importada: ${r.imported} vendedores`);
      setProdutividadePreview(null);
      qc.invalidateQueries({ queryKey: ["bi_team_activity"] });
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const trabalhadosMutation = useMutation({
    mutationFn: async () => {
      if (!periodoInicio || !periodoFim || !trabalhadosPreview) throw new Error("Selecione o período e o arquivo");
      return await importNegociosTrabalhados({ data: { periodoInicio, periodoFim, rows: trabalhadosPreview.rows } });
    },
    onSuccess: (r) => {
      toast.success(`Negócios trabalhados importados: ${r.imported} vendedores`);
      setTrabalhadosPreview(null);
      qc.invalidateQueries({ queryKey: ["bi_team_activity"] });
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const followupMutation = useMutation({
    mutationFn: async () => {
      if (!periodoInicio || !periodoFim || !followupPreview) throw new Error("Selecione o período e o arquivo");
      return await importFollowup({ data: { periodoInicio, periodoFim, rows: followupPreview.rows } });
    },
    onSuccess: (r) => {
      toast.success(`Follow-up importado: ${r.imported} atividades`);
      setFollowupPreview(null);
      qc.invalidateQueries({ queryKey: ["bi_followup_activities"] });
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

      {/* Atividade do time (Clint — sem API, só export manual) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atividade do time (Clint)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Ligações, e-mails, tarefas, reuniões, WhatsApp e negócios trabalhados não têm API —
            exporte em Indicadores → dashboard → ⋮ → "Exportar dados em CSV" e suba aqui. Recomendado:
            toda semana (ou quando quiser), referente ao período selecionado abaixo.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn("justify-start text-left font-normal gap-2", !activityRange?.from && "text-muted-foreground")}
              >
                <CalendarIcon className="h-4 w-4" />
                {activityRange?.from ? (
                  activityRange.to ? (
                    <>
                      {formatDate(activityRange.from, "dd/MM/yy", { locale: ptBR })} –{" "}
                      {formatDate(activityRange.to, "dd/MM/yy", { locale: ptBR })}
                    </>
                  ) : (
                    formatDate(activityRange.from, "dd/MM/yy", { locale: ptBR })
                  )
                ) : (
                  <span>Período do export (obrigatório)</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={activityRange}
                onSelect={setActivityRange}
                numberOfMonths={2}
                locale={ptBR}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <ActivityUploadCard
              title="Produtividade time"
              description="Ligações, e-mails, tarefas, reuniões, WhatsApp por vendedor"
              parse={parseProdutividadeCsv}
              preview={produtividadePreview}
              setPreview={setProdutividadePreview}
              onConfirm={() => produtividadeMutation.mutate()}
              isPending={produtividadeMutation.isPending}
              renderCount={(rows) => `${rows.length} vendedores`}
            />
            <ActivityUploadCard
              title="Negócios trabalhados"
              description="Por vendedor"
              parse={parseNegociosTrabalhadosCsv}
              preview={trabalhadosPreview}
              setPreview={setTrabalhadosPreview}
              onConfirm={() => trabalhadosMutation.mutate()}
              isPending={trabalhadosMutation.isPending}
              renderCount={(rows) => `${rows.length} vendedores`}
            />
            <ActivityUploadCard
              title="Gráfico de follow-up"
              description="Atividades por tipo/tag, time todo"
              parse={parseFollowupCsv}
              preview={followupPreview}
              setPreview={setFollowupPreview}
              onConfirm={() => followupMutation.mutate()}
              isPending={followupMutation.isPending}
              renderCount={(rows) => `${rows.length} tipos`}
            />
          </div>
        </CardContent>
      </Card>

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

function ActivityUploadCard<T>({
  title,
  description,
  parse,
  preview,
  setPreview,
  onConfirm,
  isPending,
  renderCount,
}: {
  title: string;
  description: string;
  parse: (text: string) => T[];
  preview: { rows: T[]; filename: string } | null;
  setPreview: (p: { rows: T[]; filename: string } | null) => void;
  onConfirm: () => void;
  isPending: boolean;
  renderCount: (rows: T[]) => string;
}) {
  const handle = async (file: File) => {
    try {
      const text = await file.text();
      const rows = parse(text);
      if (rows.length === 0) {
        toast.error("Nenhuma linha válida encontrada no arquivo.");
        return;
      }
      setPreview({ rows, filename: file.name });
    } catch (e) {
      toast.error(`Erro ao ler CSV: ${(e as Error).message}`);
    }
  };

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {preview ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">{preview.filename}</span>
          </div>
          <Badge variant="secondary" className="text-xs">{renderCount(preview.rows)}</Badge>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPreview(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button size="sm" onClick={onConfirm} disabled={isPending}>
              {isPending ? "Importando…" : "Importar"}
            </Button>
          </div>
        </div>
      ) : (
        <label className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border bg-secondary/20 px-3 py-4 text-sm text-muted-foreground cursor-pointer hover:bg-secondary/40">
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handle(f);
            }}
          />
          <Upload className="h-4 w-4" />
          Selecionar CSV
        </label>
      )}
    </div>
  );
}
