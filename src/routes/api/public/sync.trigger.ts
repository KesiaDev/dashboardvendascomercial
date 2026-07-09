import { createFileRoute } from "@tanstack/react-router";
import { runFullClintSync } from "@/lib/clint.functions";

async function handleSync(request: Request) {
  // Permite override do token via header (útil quando a env var do Railway está desatualizada)
  const headerToken = request.headers.get("x-clint-token");
  if (headerToken) process.env.CLINT_API_TOKEN = headerToken;
  try {
    const result = await runFullClintSync();
    return Response.json(result);
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/sync/trigger")({
  server: {
    handlers: {
      POST: ({ request }) => handleSync(request),
      GET:  ({ request }) => handleSync(request),
    },
  },
});
