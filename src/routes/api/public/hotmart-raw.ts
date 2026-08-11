import { createFileRoute } from "@tanstack/react-router";

// Endpoint de debug desativado por segurança em 11/08/2026: devolvia o JSON
// bruto e completo das vendas dos últimos 7 dias para qualquer requisição
// anônima, sem autenticação.
export const Route = createFileRoute("/api/public/hotmart-raw")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          JSON.stringify({ ok: false, error: "endpoint disabled (security lockdown 2026-08-11)" }),
          { status: 410, headers: { "content-type": "application/json" } },
        ),
    },
  },
});
