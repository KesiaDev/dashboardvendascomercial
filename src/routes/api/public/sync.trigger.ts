import { createFileRoute } from "@tanstack/react-router";
import { runFullClintSync } from "@/lib/clint.functions";

async function handleSync(request: Request) {
  const headerToken = request.headers.get("x-clint-token");
  if (headerToken) process.env.CLINT_API_TOKEN = headerToken;
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
      GET:  ({ request }) => handleSync(request),
    },
  },
});
