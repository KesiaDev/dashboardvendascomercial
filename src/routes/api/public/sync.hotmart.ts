import { createFileRoute } from "@tanstack/react-router";
import { runHotmartSync } from "@/lib/hotmart.functions";

// Endpoint público chamado pelo pg_cron (horário) e disponível para triggers manuais.
// Aceita GET (fácil de testar no browser) e POST. Opcional: ?days=7 ou ?start=YYYY-MM-DD&end=YYYY-MM-DD
export const Route = createFileRoute("/api/public/sync/hotmart")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const days = url.searchParams.get("days");
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    const opts: { windowDays?: number; startDate?: string; endDate?: string } = {};
    if (start && end) {
      opts.startDate = start;
      opts.endDate = end;
    } else if (days) {
      opts.windowDays = Math.max(1, Math.min(90, Number(days) || 3));
    }
    const result = await runHotmartSync(opts);
    return Response.json(result);
  } catch (e: any) {
    console.error("hotmart sync failed:", e);
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
