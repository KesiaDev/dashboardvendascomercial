import { createFileRoute } from "@tanstack/react-router";

// Endpoint público chamado pelo pg_cron (a cada 1h) — mesmo padrão de
// /api/public/sync/hotmart. Reconfere as vendas manuais pendentes contra a
// Hotmart e atualiza a tabela de alertas `commission_alerts`.
// Somente leitura/atualização interna: não retorna dados de cliente.
export const Route = createFileRoute("/api/public/audit/manual-sales")({
  server: {
    handlers: {
      GET: async () => handle(),
      POST: async () => handle(),
    },
  },
});

async function handle() {
  try {
    const { runManualSalesAudit } = await import("@/lib/manual-sales-audit.server");
    const result = await runManualSalesAudit();
    return Response.json(result);
  } catch (e: any) {
    console.error("manual sales audit failed:", e);
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
