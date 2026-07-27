import { createFileRoute } from "@tanstack/react-router";

const AUTH_URL = "https://api-sec-vlc.hotmart.com/security/oauth/token";
const API_BASE = "https://developers.hotmart.com/payments/api/v1";

export const Route = createFileRoute("/api/public/hotmart-probe")({
  server: {
    handlers: {
      GET: async () => {
        const cid = process.env.HOTMART_CLIENT_ID!;
        const cs = process.env.HOTMART_CLIENT_SECRET!;
        const basic = `Basic ${Buffer.from(`${cid}:${cs}`).toString("base64")}`;
        const ar = await fetch(
          `${AUTH_URL}?grant_type=client_credentials&client_id=${encodeURIComponent(cid)}&client_secret=${encodeURIComponent(cs)}`,
          { method: "POST", headers: { Authorization: basic } },
        );
        const aj: any = await ar.json();
        const tok = aj.access_token;
        if (!tok) return Response.json({ auth: aj }, { status: 500 });

        const paths = [
          "sales/history?max_results=5",
          "sales/summary?max_results=5",
          "sales/users?max_results=5",
          "sales/commissions?max_results=5",
          "subscriptions?max_results=5",
        ];
        const out: any[] = [];
        for (const p of paths) {
          const r = await fetch(`${API_BASE}/${p}`, { headers: { Authorization: `Bearer ${tok}` } });
          const t = await r.text();
          out.push({ path: p, status: r.status, body: t.slice(0, 400) });
        }
        return Response.json({ cidPrefix: cid.slice(0, 8), tokenScope: aj.scope ?? null, results: out });
      },
    },
  },
});
