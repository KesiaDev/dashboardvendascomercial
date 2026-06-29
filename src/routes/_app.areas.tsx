import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchOriginsFn, fetchPipelineAreasFn } from "@/lib/data.functions";
import { setPipelineArea } from "@/lib/clint.functions";
import { syncProductConfig, setProductActive, fetchProductConfig } from "@/lib/product-config.functions";
import { syncChannels, fetchChannels } from "@/lib/channels.functions";
import { AREA_LABELS, AREA_ORDER, type BusinessArea } from "@/lib/pipeline-areas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
  const [view, setView] = useState<"pipelines" | "produtos" | "canais">("pipelines");
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

  const syncProductsFn = useServerFn(syncProductConfig);
  const setProductActiveFn = useServerFn(setProductActive);
  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["bi_product_config"],
    queryFn: fetchProductConfig,
  });
  const syncProductsMutation = useMutation({
    mutationFn: () => syncProductsFn({ data: undefined as any }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bi_product_config"] }),
    onError: (e: any) => toast.error(`Erro ao sincronizar produtos: ${e?.message ?? e}`),
  });
  const productMutation = useMutation({
    mutationFn: (vars: { productId: string; ativo: boolean }) => setProductActiveFn({ data: vars }),
    onSuccess: () => {
      toast.success("Produto atualizado");
      qc.invalidateQueries({ queryKey: ["bi_product_config"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e?.message ?? e}`),
  });

  // Garante que todo produto de PRODUCT_GROUPS tenha uma linha aqui, na primeira
  // vez que a lista vier vazia (ex.: antes da migration ser aplicada não há nada).
  useEffect(() => {
    if (view === "produtos" && !productsLoading && products.length === 0 && !syncProductsMutation.isPending) {
      syncProductsMutation.mutate();
    }
  }, [view, productsLoading, products.length]);

  const syncChannelsFn = useServerFn(syncChannels);
  const { data: channels = [], isLoading: channelsLoading } = useQuery({
    queryKey: ["bi_channels"],
    queryFn: fetchChannels,
  });
  const syncChannelsMutation = useMutation({
    mutationFn: () => syncChannelsFn({ data: undefined as any }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bi_channels"] }),
    onError: (e: any) => toast.error(`Erro ao sincronizar canais: ${e?.message ?? e}`),
  });

  // Dicionário de canais é só editado via código (src/lib/channels.ts) por
  // enquanto — sincroniza sempre que a aba é aberta, para refletir mudanças.
  useEffect(() => {
    if (view === "canais" && !channelsLoading && !syncChannelsMutation.isPending) {
      syncChannelsMutation.mutate();
    }
  }, [view]);

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {view === "pipelines" ? "Dicionário de Pipelines" : view === "produtos" ? "Produtos" : "Canais"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {view === "pipelines"
              ? "Cada pipeline da Clint é classificado automaticamente em uma área de negócio (com base no grupo da Clint). Reclassifique aqui se algum estiver errado — o dashboard executivo usa essa configuração para nunca mais depender de escolha manual de funil."
              : view === "produtos"
                ? "Marque como inativo qualquer produto que não deva entrar em Vendedor x Produto (ex.: ofertas descontinuadas ou que não geram comissão hoje)."
                : "Dicionário de funil/canal de aquisição — une o group_name da Clint e o sck da Hotmart em um único id. Editado hoje via código (src/lib/channels.ts); esta tela é só consulta."}
          </p>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as "pipelines" | "produtos" | "canais")}>
          <TabsList>
            <TabsTrigger value="pipelines">Pipelines</TabsTrigger>
            <TabsTrigger value="produtos">Produtos</TabsTrigger>
            <TabsTrigger value="canais">Canais</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {view === "pipelines" ? (
        <>
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
        </>
      ) : view === "produtos" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Catálogo de produtos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {productsLoading || syncProductsMutation.isPending ? (
              <div className="text-muted-foreground">Carregando…</div>
            ) : products.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nenhum produto encontrado. Verifique se a migration `bi_product_config`
                já foi aplicada no banco.
              </p>
            ) : (
              products.map((p) => {
                const parentLabel = products.find((x) => x.product_id === p.produto_pai_id)?.label;
                return (
                  <div
                    key={p.product_id}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-secondary/30 p-2.5"
                  >
                    <div className="flex-1 min-w-[220px]">
                      <span className="text-sm font-medium">{p.label}</span>
                      {parentLabel && (
                        <span className="block text-xs text-muted-foreground">
                          {p.categoria === "renovacao" ? "renovação de" : "upsell de"} {parentLabel}
                        </span>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {p.categoria}
                    </Badge>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Ativo</span>
                      <Switch
                        checked={p.ativo}
                        onCheckedChange={(checked) =>
                          productMutation.mutate({ productId: p.product_id, ativo: checked })
                        }
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dicionário de canais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {channelsLoading || syncChannelsMutation.isPending ? (
              <div className="text-muted-foreground">Carregando…</div>
            ) : channels.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nenhum canal encontrado. Verifique se a migration `bi_channels` já foi
                aplicada no banco.
              </p>
            ) : (
              channels.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-secondary/30 p-2.5"
                >
                  <div className="flex-1 min-w-[220px]">
                    <span className="text-sm font-medium">{c.label}</span>
                    <div className="text-xs text-muted-foreground">
                      {c.clint_group_names.length > 0 && (
                        <span>grupo Clint: {c.clint_group_names.join(", ")}</span>
                      )}
                      {c.clint_group_names.length > 0 && c.sck_prefixes.length > 0 && <span> · </span>}
                      {c.sck_prefixes.length > 0 && <span>sck: {c.sck_prefixes.join(", ")}.*</span>}
                      {c.clint_group_names.length === 0 && c.sck_prefixes.length === 0 && (
                        <span className="italic">sem mapeamento ainda — placeholder</span>
                      )}
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs capitalize">
                    {c.tipo}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}