import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Pencil, Target, TrendingUp, Award } from "lucide-react";
import { getMetasComercialFn, updateMetaComercialFn, type MetaKey } from "@/lib/metas-comercial.functions";

export const Route = createFileRoute("/_app/metas-comercial")({
  component: MetasComercialPage,
  head: () => ({ meta: [{ title: "Metas Comercial 2026" }] }),
});

function MetasComercialPage() {
  const getMetas = useServerFn(getMetasComercialFn);
  const updateMeta = useServerFn(updateMetaComercialFn);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["metas-comercial"],
    queryFn: () => getMetas(),
  });

  const mut = useMutation({
    mutationFn: (v: { key: MetaKey; valor: number }) => updateMeta({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["metas-comercial"] }),
  });

  if (isLoading || !data) {
    return <div className="text-sm text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Metas Comercial {data.year}</h1>
        <p className="text-sm text-muted-foreground">
          Vendas fechadas pelo time comercial no ano corrente. Clique no ícone para editar a meta.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetaCard
          title="Frontend"
          subtitle="Mentoria Tráfego + Formação Redes Sociais"
          icon={<Target className="h-4 w-4" />}
          meta={data.metas.frontend}
          realizado={data.realizado.frontend}
          onSave={(v) => mut.mutate({ key: "meta_comercial_frontend", valor: v })}
          saving={mut.isPending}
        />
        <MetaCard
          title="HT + Renovações"
          subtitle="Accelerator + Renovações"
          icon={<TrendingUp className="h-4 w-4" />}
          meta={data.metas.ht}
          realizado={data.realizado.ht}
          onSave={(v) => mut.mutate({ key: "meta_comercial_ht_renov", valor: v })}
          saving={mut.isPending}
        />
        <MetaCard
          title="MAS"
          subtitle="Master and Scale"
          icon={<Award className="h-4 w-4" />}
          meta={data.metas.mas}
          realizado={data.realizado.mas}
          onSave={(v) => mut.mutate({ key: "meta_comercial_mas", valor: v })}
          saving={mut.isPending}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vendas por funil de origem</CardTitle>
        </CardHeader>
        <CardContent>
          {data.funnelBreakdown.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhuma venda registrada em {data.year} ainda.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funil de origem</TableHead>
                  <TableHead className="text-right">Frontend</TableHead>
                  <TableHead className="text-right">HT + Renov</TableHead>
                  <TableHead className="text-right">MAS</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.funnelBreakdown.map((r) => (
                  <TableRow key={r.funnel}>
                    <TableCell className="font-medium">{r.funnel}</TableCell>
                    <TableCell className="text-right">{r.frontend}</TableCell>
                    <TableCell className="text-right">{r.ht}</TableCell>
                    <TableCell className="text-right">{r.mas}</TableCell>
                    <TableCell className="text-right font-semibold">{r.total}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{data.realizado.frontend}</TableCell>
                  <TableCell className="text-right">{data.realizado.ht}</TableCell>
                  <TableCell className="text-right">{data.realizado.mas}</TableCell>
                  <TableCell className="text-right">
                    {data.realizado.frontend + data.realizado.ht + data.realizado.mas}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Fonte: fechamentos registrados em <em>Fechamento</em>. Cada venda conta 1 unidade
            (parcelas da mesma venda não são somadas em duplicado).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function MetaCard({
  title,
  subtitle,
  icon,
  meta,
  realizado,
  onSave,
  saving,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  meta: number;
  realizado: number;
  onSave: (v: number) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(meta));
  const pct = meta > 0 ? Math.min(100, Math.round((realizado / meta) * 100)) : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {icon}
            {title}
          </CardTitle>
          {!editing && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                setValue(String(meta));
                setEditing(true);
              }}
              aria-label="Editar meta"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-3xl font-bold">{realizado}</div>
            <div className="text-xs text-muted-foreground">Realizado</div>
          </div>
          {editing ? (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-8 w-20 text-right"
                min={0}
              />
              <Button
                size="sm"
                className="h-8"
                disabled={saving}
                onClick={() => {
                  const n = Number(value);
                  if (!Number.isFinite(n) || n < 0) return;
                  onSave(n);
                  setEditing(false);
                }}
              >
                OK
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)}>
                ✕
              </Button>
            </div>
          ) : (
            <div className="text-right">
              <div className="text-lg font-semibold text-muted-foreground">/ {meta}</div>
              <div className="text-xs text-muted-foreground">Meta</div>
            </div>
          )}
        </div>
        <div className="space-y-1">
          <Progress value={pct} className="h-2" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{pct}% atingido</span>
            <span>Faltam {Math.max(0, meta - realizado)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
