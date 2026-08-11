import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listCommissionAlertsFn,
  resolveCommissionAlertFn,
  runManualSalesAuditFn,
  type CommissionAlert,
} from "@/lib/commission-alerts.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, ChevronDown, ChevronUp, RefreshCw, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function fmtHours(h: number | null) {
  if (h == null) return "";
  const d = Math.floor(h / 24);
  return d > 0 ? `${d}d ${h % 24}h` : `${h}h`;
}

export function CommissionAlertsCard() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["commission_alerts"],
    queryFn: async () => (await listCommissionAlertsFn({ data: {} })) as CommissionAlert[],
    retry: false,
  });

  const resolveMut = useMutation({
    mutationFn: (id: string) => resolveCommissionAlertFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commission_alerts"] });
      toast.success("Alerta marcado como revisado");
    },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  const auditMut = useMutation({
    mutationFn: () => runManualSalesAuditFn(),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["commission_alerts"] });
      toast.success(
        `Auditoria concluída: ${r?.reconfirm?.confirmed ?? 0} confirmadas · ${r?.alerts?.alerts ?? 0} alertas abertos`,
      );
    },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  const pendentes = alerts.filter((a) => a.type === "pendente_24h");
  const divergentes = alerts.filter((a) => a.type === "afiliado_divergente");

  if (isLoading) return null;

  return (
    <Card className={cn(alerts.length > 0 ? "border-amber-500/50 bg-amber-500/5" : "border-border")}>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <AlertTriangle
            className={cn("h-4 w-4", alerts.length > 0 ? "text-amber-500" : "text-muted-foreground")}
          />
          Auditoria do fechamento manual
          {pendentes.length > 0 && (
            <Badge variant="outline" className="border-amber-500/60 text-amber-600 dark:text-amber-400">
              {pendentes.length} venda{pendentes.length > 1 ? "s" : ""} pendente
              {pendentes.length > 1 ? "s" : ""} há +24h
            </Badge>
          )}
          {divergentes.length > 0 && (
            <Badge variant="destructive">
              {divergentes.length} afiliado{divergentes.length > 1 ? "s" : ""} divergente
              {divergentes.length > 1 ? "s" : ""}
            </Badge>
          )}
          {alerts.length === 0 && (
            <Badge variant="outline" className="border-emerald-500/60 text-emerald-600 dark:text-emerald-400">
              Tudo conferido
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => auditMut.mutate()}
              disabled={auditMut.isPending}
            >
              <RefreshCw className={cn("mr-2 h-3.5 w-3.5", auditMut.isPending && "animate-spin")} />
              Reconferir agora
            </Button>
            {alerts.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
                {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      {open && alerts.length > 0 && (
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Somente aviso — bônus, roleta e pagamentos seguem normalmente. A reconferência
            automática roda de hora em hora.
          </p>
          {alerts.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              {a.type === "afiliado_divergente" ? (
                <UserX className="h-4 w-4 shrink-0 text-destructive" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              )}
              <span className="font-medium">{a.seller_name ?? "—"}</span>
              <span className="text-muted-foreground">
                {a.client_name ?? a.client_email ?? "cliente"}
              </span>
              {a.sale_date && (
                <span className="text-xs text-muted-foreground">
                  {new Date(`${a.sale_date}T00:00:00`).toLocaleDateString("pt-BR")}
                </span>
              )}
              {a.value_eur != null && (
                <span className="text-xs text-muted-foreground">€ {Number(a.value_eur).toFixed(0)}</span>
              )}
              {a.type === "pendente_24h" ? (
                <Badge variant="outline" className="text-xs">
                  pendente há {fmtHours(a.hours_pending)}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  Hotmart: {a.hotmart_nome_afiliado ?? "—"}
                </Badge>
              )}
              <span className="w-full text-xs text-muted-foreground sm:w-auto sm:flex-1">
                {a.message}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => resolveMut.mutate(a.id)}
                disabled={resolveMut.isPending}
              >
                <Check className="mr-1 h-3.5 w-3.5" />
                Revisado
              </Button>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
