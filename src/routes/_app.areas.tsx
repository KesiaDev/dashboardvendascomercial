import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchOriginsFn, fetchPipelineAreasFn } from "@/lib/data.functions";
import { setPipelineArea } from "@/lib/clint.functions";
import { AREA_LABELS, AREA_ORDER, type BusinessArea } from "@/lib/pipeline-areas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/areas")({
  component: AreasConfig,
});

type Row = {
  pipeline_id: string;
  name: string;
  group_name: string | null;
  area: BusinessArea;
  ativo: boolean;
  auto_classified: boolean;
};

async function fetchRows(): Promise<Row[]> {
  const origins = (await fetchOriginsFn()) as Array<{ id: string; name: string; group_name: string | null; archived: boolean }>;
  const areas = (await fetchPipelineAreasFn()) as Array<{ pipeline_id: string; area: string; ativo: boolean; auto_classified: boolean }>;

  const areaById = new Map(areas.map((a) => [a.pipeline_id, a]));
  return origins.map((o) => {
    const a = areaById.get(o.id);
    return {
      pipeline_id: o.id,
      name: o.name,
      group_name: o.group_name,
      area: (a?.area as BusinessArea) ?? "OUTROS",
      ativo: a?.ativo ?? !o.archived,
      auto_classified: a?.auto_classified ?? true,
    };
  });
}

function AreasConfig() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<BusinessArea | "ALL">("ALL");
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["bi_areas_config"], queryFn: fetchRows });

  const setAreaFn = useServerFn(setPipelineArea);
  const mutation = useMutation({
    mutationFn: (vars: { pipelineId: string; area: string; ativo: boolean }) => setAreaFn({ data: vars }),
    onSuccess: () => {
      toast.success("Área atualizada");
      qc.invalidateQueries({ queryKey: ["bi_areas_config"] });
      qc.invalidateQueries({ queryKey: ["bi_pipeline_areas"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e?.message ?? e}`),
  });

  const grouped = useMemo(() => {
    const filtered = filter === "ALL" ? rows : rows.filter((r) => r.area === filter);
    const m = new Map<string, Row[]>();
    for (const r of filtered) {
      const g = r.group_name ?? "Sem grupo";
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(r);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows, filter]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Dicionário de Pipelines</h2>
        <p className="text-sm text-muted-foreground">
          Cada pipeline da Clint é classificado automaticamente em uma área de negócio (com base
          no grupo da Clint). Reclassifique aqui se algum estiver errado — o dashboard executivo
          usa essa configuração para nunca mais depender de escolha manual de funil.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <button
            onClick={() => setFilter("ALL")}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              filter === "ALL" ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/70"
            }`}
          >
            Todos ({rows.length})
          </button>
          {AREA_ORDER.map((a) => {
            const count = rows.filter((r) => r.area === a).length;
            return (
              <button
                key={a}
                onClick={() => setFilter(a)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  filter === a ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/70"
                }`}
              >
                {AREA_LABELS[a]} ({count})
              </button>
            );
          })}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-muted-foreground">Carregando…</div>
      ) : (
        grouped.map(([group, items]) => (
          <Card key={group}>
            <CardHeader>
              <CardTitle className="text-base">{group}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.map((r) => (
                <div
                  key={r.pipeline_id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-secondary/30 p-2.5"
                >
                  <span className="flex-1 text-sm font-medium min-w-[200px]">{r.name}</span>
                  {r.auto_classified && (
                    <span className="text-xs text-muted-foreground italic">auto</span>
                  )}
                  <Select
                    value={r.area}
                    onValueChange={(v) =>
                      mutation.mutate({ pipelineId: r.pipeline_id, area: v, ativo: r.ativo })
                    }
                  >
                    <SelectTrigger className="w-[220px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AREA_ORDER.map((a) => (
                        <SelectItem key={a} value={a}>
                          {AREA_LABELS[a]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Ativo</span>
                    <Switch
                      checked={r.ativo}
                      onCheckedChange={(checked) =>
                        mutation.mutate({ pipelineId: r.pipeline_id, area: r.area, ativo: checked })
                      }
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}