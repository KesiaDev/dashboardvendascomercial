import { createFileRoute } from "@tanstack/react-router";
import { requireApiKey } from "@/lib/api-auth";

// Endpoint público chamado pelo pg_cron (a cada 30 min) para manter
// clint_deals.contact_tags atualizado. Incremental e idempotente.
export const Route = createFileRoute("/api/public/sync/contact-tags")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  const denied = requireApiKey(request);
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const max = Number(url.searchParams.get("max") ?? "") || 1500;
    const { runContactTagsBackfill } = await import("@/lib/clint-contact-tags.server");
    const result = await runContactTagsBackfill(Math.max(1, Math.min(20000, max)));
    return Response.json(result);
  } catch (e: any) {
    console.error("contact-tags sync failed:", e);
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
