import { createFileRoute } from "@tanstack/react-router";

const AUTH_URL = "https://api-sec-vlc.hotmart.com/security/oauth/token";
const API_BASE = "https://developers.hotmart.com/payments/api/v1";

// Debug: retorna 1 venda BRUTA da API Hotmart pra vermos a estrutura de commissions/exchange.
export const Route = createFileRoute("/api/public/hotmart-raw")({
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
        if (!tok) return Response.json({ authStatus: ar.status, authBody: aj }, { status: 500 });

        const end = Date.now();
        const start = end - 7 * 86400000;
        const url = `${API_BASE}/sales/history?start_date=${start}&end_date=${end}&max_results=3`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
        const j: any = await r.json();
        return Response.json(j);
      },
    },
  },
});
