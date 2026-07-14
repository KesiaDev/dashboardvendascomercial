import { createFileRoute } from "@tanstack/react-router";
import { syncCcpbxCallsFn } from "@/lib/ccpbx.functions";

async function handle(request: Request) {
  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") ?? "7");
  try {
    const r = await syncCcpbxCallsFn({ data: { days } });
    return Response.json(r);
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/sync/ccpbx")({
  server: { handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) } },
});
