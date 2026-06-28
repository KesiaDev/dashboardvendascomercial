import { createFileRoute } from "@tanstack/react-router";
import { runFullClintSync } from "@/lib/clint.functions";

export const Route = createFileRoute("/api/public/sync/trigger")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await runFullClintSync();
          return Response.json(result);
        } catch (e: any) {
          return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
        }
      },
      GET: async () => {
        try {
          const result = await runFullClintSync();
          return Response.json(result);
        } catch (e: any) {
          return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
        }
      },
    },
  },
});
