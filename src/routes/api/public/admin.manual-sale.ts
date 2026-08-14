/**
 * POST /api/public/admin/manual-sale
 * Insere uma venda manual no sistema. Requer x-api-key.
 * Body: { seller_name, funnel, value_eur, client_name, sale_date, product?, client_email?, installment_number? }
 */
import { createFileRoute } from "@tanstack/react-router";

function checkApiKey(request: Request): boolean {
  const key = request.headers.get("x-api-key");
  return !!process.env.INTERNAL_API_KEY && key === process.env.INTERNAL_API_KEY;
}

async function handle(request: Request) {
  if (!checkApiKey(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { seller_name, funnel, value_eur, client_name, sale_date, product, client_email, installment_number } = body;
  if (!seller_name || !funnel || value_eur == null || !sale_date) {
    return Response.json({ ok: false, error: "Campos obrigatórios: seller_name, funnel, value_eur, sale_date" }, { status: 400 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Busca o UUID do admin para preencher created_by
  const { data: users } = await (supabaseAdmin as any).auth.admin.listUsers({ perPage: 100 });
  const adminUser = (users?.users ?? []).find(
    (u: any) => u.email === "b.lindanoite@gmail.com" || u.role === "service_role"
  ) ?? (users?.users ?? [])[0];
  const created_by = body.created_by ?? adminUser?.id ?? null;

  const { data, error } = await (supabaseAdmin as any)
    .from("manual_sales")
    .insert({
      seller_name,
      funnel,
      value_eur: Number(value_eur),
      client_name: client_name ?? null,
      client_email: client_email ?? null,
      sale_date,
      product: product ?? "Outros",
      installment_number: installment_number ?? 1,
      created_by,
    })
    .select()
    .single();

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, sale: data });
}

export const Route = createFileRoute("/api/public/admin/manual-sale")({
  server: {
    handlers: { POST: ({ request }) => handle(request) },
  },
});
