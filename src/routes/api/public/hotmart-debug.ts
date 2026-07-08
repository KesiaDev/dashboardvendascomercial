import { createFileRoute } from "@tanstack/react-router";

const AUTH_URL = "https://api-sec-vlc.hotmart.com/security/oauth/token";
const API_BASE = "https://developers.hotmart.com/payments/api/v1";

export const Route = createFileRoute("/api/public/hotmart-debug")({
  server: {
    handlers: {
      GET: async () => {
        const cid = process.env.HOTMART_CLIENT_ID!;
        const cs = process.env.HOTMART_CLIENT_SECRET!;
        const basic = process.env.HOTMART_BASIC_TOKEN!;
        const basicHeader = basic.trim().toLowerCase().startsWith("basic ")
          ? basic.trim()
          : `Basic ${basic.trim()}`;
        const ar = await fetch(
          `${AUTH_URL}?grant_type=client_credentials&client_id=${encodeURIComponent(cid)}&client_secret=${encodeURIComponent(cs)}`,
          { method: "POST", headers: { Authorization: basicHeader } },
        );
        const aj: any = await ar.json();
        const tok = aj.access_token;
        if (!tok) return Response.json({ authStatus: ar.status, authBody: aj });

        const now = Date.now();
        const results: any[] = [];
        const tests: [string, number, number][] = [
          ["ms-7d", now - 7 * 86400000, now],
          ["sec-7d", Math.floor((now - 7 * 86400000) / 1000), Math.floor(now / 1000)],
          ["ms-2024-06", new Date("2024-06-01").getTime(), new Date("2024-06-15").getTime()],
          ["sec-2024-06", Math.floor(new Date("2024-06-01").getTime() / 1000), Math.floor(new Date("2024-06-15").getTime() / 1000)],
          ["ms-2025-06", new Date("2025-06-01").getTime(), new Date("2025-06-15").getTime()],
        ];
        for (const [label, s, e] of tests) {
          const u = `${API_BASE}/sales/history?start_date=${s}&end_date=${e}&max_results=5`;
          const r = await fetch(u, { headers: { Authorization: `Bearer ${tok}` } });
          const t = await r.text();
          results.push({ label, status: r.status, body: t.slice(0, 300), s, e });
        }
        return Response.json({ now, nowIso: new Date(now).toISOString(), results });
      },
    },
  },
});
