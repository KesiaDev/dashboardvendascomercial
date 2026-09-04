import { createFileRoute } from "@tanstack/react-router";
import { canonicalSellerEmail } from "@/lib/seller-aliases";
import { getWorkingHours } from "@/lib/agenda-hours";

/** Hora local de Lisboa (0-23) de um instante UTC. */
function lisbonHour(date: Date): number {
  const v = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit",
    hour12: false,
  }).format(date);
  return parseInt(v, 10);
}

function checkApiKey(request: Request): boolean {
  const key = request.headers.get("x-api-key");
  const expected = process.env.INTERNAL_API_KEY;
  return !!expected && key === expected;
}

// Parses [AGENDA:DD/MM:HH:MM] — Europe/Lisbon → UTC
function parseAgendaTag(tag: string): Date | null {
  const match = tag.match(/\[AGENDA:(\d{1,2})\/(\d{1,2}):(\d{2}):(\d{2})\]/);
  if (!match) return null;
  const [, d, m, h, min] = match;
  const year = new Date().getFullYear();
  // Europe/Lisbon: UTC+1 in summer (WEST), UTC+0 in winter (WET)
  const lisbonOffset = isDST(new Date(year, parseInt(m) - 1, parseInt(d))) ? 1 : 0;
  return new Date(
    Date.UTC(year, parseInt(m) - 1, parseInt(d), parseInt(h) - lisbonOffset, parseInt(min)),
  );
}

function isDST(date: Date): boolean {
  // Portugal WEST: last Sunday in March to last Sunday in October
  const year = date.getFullYear();
  const start = lastSunday(year, 2); // March (0-indexed)
  const end = lastSunday(year, 9); // October
  return date >= start && date < end;
}

function lastSunday(year: number, month: number): Date {
  const d = new Date(year, month + 1, 0); // last day of month
  d.setDate(d.getDate() - d.getDay());
  return d;
}

interface BookBody {
  seller_email?: string;
  seller_name?: string;
  lead_name?: string;
  lead_phone?: string;
  lead_email?: string;
  scheduled_at?: string; // ISO string or [AGENDA:...] tag
  agenda_tag?: string; // raw [AGENDA:DD/MM:HH:MM] tag
  clint_deal_id?: string;
  notes?: string;
  source?: string;
}

async function handleBook(request: Request) {
  if (!checkApiKey(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: BookBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (!body.lead_name)
    return Response.json({ ok: false, error: "lead_name required" }, { status: 400 });
  if (!body.seller_email)
    return Response.json({ ok: false, error: "seller_email required" }, { status: 400 });

  let scheduledAt: Date | null = null;
  if (body.agenda_tag) {
    scheduledAt = parseAgendaTag(body.agenda_tag);
  } else if (body.scheduled_at) {
    const tag = body.scheduled_at.match(/\[AGENDA:[^\]]+\]/) ? body.scheduled_at : null;
    scheduledAt = tag ? parseAgendaTag(tag) : new Date(body.scheduled_at);
  }

  if (!scheduledAt || isNaN(scheduledAt.getTime())) {
    return Response.json(
      { ok: false, error: "valid scheduled_at or agenda_tag required" },
      { status: 400 },
    );
  }

  // Respeita a janela de trabalho do vendedor (brasileiros só a partir das 10:00 de Lisboa = 06:00 BR)
  const hours = getWorkingHours(body.seller_email, body.seller_name);
  const h = lisbonHour(scheduledAt);
  if (h < hours.startH || h >= hours.endH) {
    return Response.json(
      {
        ok: false,
        error: "outside_working_hours",
        message: `Este vendedor só atende entre ${String(hours.startH).padStart(2, "0")}:00 e ${String(hours.endH).padStart(2, "0")}:00 (hora de Lisboa). ${hours.label}`,
        working_hours: { start: hours.startH, end: hours.endH, timezone: "Europe/Lisbon" },
      },
      { status: 409 },
    );
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("seller_agenda")
    .insert({
      seller_email: canonicalSellerEmail(body.seller_email),
      seller_name: body.seller_name ?? null,
      lead_name: body.lead_name,
      lead_phone: body.lead_phone ?? null,
      lead_email: body.lead_email ?? null,
      scheduled_at: scheduledAt.toISOString(),
      duration_min: 30,
      meeting_type: "consultoria",
      source: body.source ?? "agente_ia",
      status: "agendado",
      clint_deal_id: body.clint_deal_id ?? null,
      notes: body.notes ?? body.agenda_tag ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, id: inserted.id, scheduled_at: scheduledAt.toISOString() });
}

export const Route = createFileRoute("/api/public/agenda/book")({
  server: {
    handlers: {
      POST: ({ request }) => handleBook(request),
    },
  },
});
