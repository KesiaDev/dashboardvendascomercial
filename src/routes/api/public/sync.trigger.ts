import { createFileRoute } from "@tanstack/react-router";
import { runFullClintSync } from "@/lib/clint.functions";

// O código anterior lia um header x-clint-token enviado pelo chamador e
// usava esse valor para sobrescrever process.env.CLINT_API_TOKEN em tempo de
// execução — qualquer requisição não autenticada podia trocar o token usado
// nas chamadas à API da Clint para todo o processo. Essa linha foi removida.
async function handleSync(request: Request) {
  const url = new URL(request.url);
  const full = url.searchParams.get("full") === "true";
  try {
    const result = await runFullClintSync({ full });
    return Response.json(result);
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/sync/trigger")({
  server: {
    handlers: {
      POST: ({ request }) => handleSync(request),
      GET: ({ request }) => handleSync(request),
    },
  },
});
