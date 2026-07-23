import { createFileRoute } from "@tanstack/react-router";

function parseAgendaTag(content: string): { date: Date; tag: string } | null {
  const match = content.match(/\[AGENDA:(\d{1,2})\/(\d{1,2}):(\d{1,2}):(\d{2})\]/);
  if (!match) return null;
  const [full, dayStr, monthStr, hourStr, minStr] = match;
  const year = new Date().getUTCFullYear();
  // Europe/Lisbon (UTC+1 verão) → subtrai 1h para UTC
  const date = new Date(
    Date.UTC(
      year,
      parseInt(monthStr, 10) - 1,
      parseInt(dayStr, 10),
      parseInt(hourStr, 10) - 1,
      parseInt(minStr, 10),
    ),
  );
  if (isNaN(date.getTime())) return null;
  return { date, tag: full };
}

async function handleBook(request: Request) {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    return Response.json({ ok: false, error: "server_misconfigured" }, { status: 500 });
  }
  const provided = request.headers.get("x-api-key") ?? "";
  if (provided !== expected) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sellerEmail = ((body.seller_email as string) ?? "").toLowerCase().trim();
  const sellerName = (body.seller_name as string) ?? null;
  const leadName = (body.lead_name as string) ?? "Lead";
  const leadPhone = (body.lead_phone as string) ?? null;
  const agendaTag = (body.agenda_tag as string) ?? "";
  const clintDealId = (body.clint_deal_id as string) ?? null;

  if (!sellerEmail) {
    return Response.json({ ok: false, error: "seller_email_required" }, { status: 400 });
  }
  if (!agendaTag) {
    return Response.json({ ok: false, error: "agenda_tag_required" }, { status: 400 });
  }

  const parsed = parseAgendaTag(agendaTag);
  if (!parsed) {
    return Response.json(
      { ok: false, error: "agenda_tag_not_found", detail: "Expected [AGENDA:DD/MM:HH:MM]" },
      { status: 400 },
    );
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  // Dedup — mesma reunião (vendedor + lead + horário) já criada?
  const { data: existing } = await db
    .from("seller_agenda")
    .select("id")
    .eq("seller_email", sellerEmail)
    .eq("scheduled_at", parsed.date.toISOString())
    .eq("lead_name", leadName)
    .maybeSingle();

  if (existing?.id) {
    return Response.json({ ok: true, id: existing.id, duplicate: true });
  }

  const { data: inserted, error } = await db
    .from("seller_agenda")
    .insert({
      seller_email: sellerEmail,
      seller_name: sellerName,
      lead_name: leadName,
      lead_phone: leadPhone,
      scheduled_at: parsed.date.toISOString(),
      duration_min: 20,
      meeting_type: "consultoria",
      source: "agente_ia",
      clint_deal_id: clintDealId,
      status: "agendado",
      notes: parsed.tag,
    })
    .select("id")
    .single();

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, id: inserted?.id ?? null });
}

export const Route = createFileRoute("/api/public/agenda/book")({
  server: {
    handlers: {
      POST: ({ request }) => handleBook(request),
      GET: () =>
        Response.json({
          ok: true,
          status: "endpoint active",
          usage: "POST with x-api-key header and JSON body { seller_email, lead_name, agenda_tag, ... }",
        }),
    },
  },
});
