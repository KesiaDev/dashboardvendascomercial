import { createFileRoute } from "@tanstack/react-router";
import { syncCcpbxCallsCore } from "@/lib/ccpbx.functions";
import { requireApiKey } from "@/lib/api-auth";

async function handle(request: Request) {
  const denied = requireApiKey(request);
  if (denied) return denied;
  const url = new URL(request.url);
  // ?days não tinha limite: aceitava qualquer número e virava um sync arbitrariamente
  // grande. Mesmo clamp de sync/hotmart.
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") ?? "7") || 7));
  try {
    const r = await syncCcpbxCallsCore({ days });
    return Response.json(r);
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/sync/ccpbx")({
  server: {
    handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) },
  },
});
