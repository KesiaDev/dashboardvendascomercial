import { createFileRoute } from "@tanstack/react-router";

// Endpoint de debug desativado por segurança em 11/08/2026: era público, sem
// autenticação, e vazava dados de vendas e credenciais da Hotmart.
export const Route = createFileRoute("/api/public/hotmart-debug")({
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
