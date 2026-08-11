import { createFileRoute } from "@tanstack/react-router";

// Endpoint desativado por segurança em 11/08/2026: continha um token de
// acesso à API da Clint escrito diretamente no código-fonte, e não exigia
// nenhuma autenticação para ser chamado. O backfill que fazia (período fixo
// 29/06-14/07/2026) já tinha passado do prazo.
export const Route = createFileRoute("/api/public/backfill-v3")({
  server: {
    handlers: {
      POST: async () =>
        new Response(
          JSON.stringify({ ok: false, error: "endpoint disabled (security lockdown 2026-08-11)" }),
          { status: 410, headers: { "content-type": "application/json" } },
        ),
      GET: async () =>
        new Response(
          JSON.stringify({ ok: false, error: "endpoint disabled (security lockdown 2026-08-11)" }),
          { status: 410, headers: { "content-type": "application/json" } },
        ),
    },
  },
});
