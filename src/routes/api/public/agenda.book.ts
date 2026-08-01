import { createFileRoute } from "@tanstack/react-router";

const MONTHS_PT: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/**
 * Converte data/hora de Europe/Lisbon para UTC.
 * Verão (última dom. março → última dom. outubro) = UTC+1, inverno = UTC+0.
 */
function lisbonToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const lastSunday = (m: number) => {
    const d = new Date(Date.UTC(year, m, 0)); // último dia do mês m
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.getTime();
  };
  const dstStart = lastSunday(3) + 1 * 3600_000;
  const dstEnd = lastSunday(10) + 1 * 3600_000;
  const offset = naive >= dstStart && naive < dstEnd ? 1 : 0;
  return new Date(naive - offset * 3600_000);
}

type Parsed = { date: Date; tag: string; matched: string };

/** Aceita ISO, [AGENDA:DD/MM:HH:MM] e linguagem natural em PT. */
function parseWhen(input: string, fallbackYear: number): Parsed | null {
  const text = (input ?? "").trim();
  if (!text) return null;

  // 1) ISO 8601 (ex.: 2026-08-05T14:00:00Z ou 2026-08-05T14:00)
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/);
  if (iso) {
    const [, y, mo, d, h, mi] = iso;
    const hasZone = /(?:Z|[+-]\d{2}:?\d{2})\s*$/.test(text);
    const date = hasZone
      ? new Date(text)
      : lisbonToUtc(+y, +mo, +d, +h, +mi);
    if (!isNaN(date.getTime())) return { date, tag: iso[0], matched: "iso" };
  }

  // 2) [AGENDA:DD/MM:HH:MM]
  const tagM = text.match(/\[AGENDA:\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?[:\s]+(\d{1,2})[:hH](\d{2})\s*\]/);
  if (tagM) {
    const [full, d, mo, y, h, mi] = tagM;
    const year = y ? (y.length === 2 ? 2000 + +y : +y) : fallbackYear;
    const date = lisbonToUtc(year, +mo, +d, +h, +mi);
    if (!isNaN(date.getTime())) return { date, tag: full, matched: "tag" };
  }

  // 3) DD/MM[/AAAA] ... HH[h:]MM  (ex.: "22/07 às 14h00", "dia 5/8 14:30")
  const nat = text.match(
    /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?[^\d]{0,20}?(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i,
  );
  if (nat) {
    const [full, d, mo, y, h, mi] = nat;
    const year = y ? (y.length === 2 ? 2000 + +y : +y) : fallbackYear;
    const date = lisbonToUtc(year, +mo, +d, +h, mi ? +mi : 0);
    if (!isNaN(date.getTime())) return { date, tag: full.trim(), matched: "natural_ddmm" };
  }

  // 4) "5 de agosto às 14h30"
  const pt = text.match(
    /(\d{1,2})\s+de\s+([a-zç]{3,10})(?:\s+de\s+(\d{4}))?[^\d]{0,20}?(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i,
  );
  if (pt) {
    const [full, d, monthWord, y, h, mi] = pt;
    const mo = MONTHS_PT[monthWord.slice(0, 3).toLowerCase()];
    if (mo) {
      const date = lisbonToUtc(y ? +y : fallbackYear, mo, +d, +h, mi ? +mi : 0);
      if (!isNaN(date.getTime())) return { date, tag: full.trim(), matched: "natural_extenso" };
    }
  }

  return null;
}

async function logCall(db: any, status: string, payload: unknown, errorMsg?: string) {
  try {
    await db.from("coach_integration_logs").insert({
      event_type: "agenda_book",
      payload: payload as any,
      status,
      error_msg: errorMsg ?? null,
    });
  } catch {
    /* logging nunca deve quebrar o endpoint */
  }
}

async function handleBook(request: Request) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    await logCall(db, "error", { raw: "invalid json" }, "invalid_json");
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const expected = process.env.INTERNAL_API_KEY;
  const provided =
    request.headers.get("x-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    (body.api_key as string) ??
    "";
  if (expected && provided !== expected) {
    await logCall(db, "error", body, "unauthorized (x-api-key inválida)");
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sellerEmail = ((body.seller_email as string) ?? "").toLowerCase().trim();
  const sellerName = (body.seller_name as string) ?? null;
  const leadName = ((body.lead_name as string) ?? (body.contact_name as string) ?? "Lead").trim();
  const leadPhone = (body.lead_phone as string) ?? (body.contact_phone as string) ?? null;
  const leadEmail = (body.lead_email as string) ?? (body.contact_email as string) ?? null;
  const clintDealId = (body.clint_deal_id as string) ?? (body.deal_id as string) ?? null;
  const durationMin = Number(body.duration_min ?? 20) || 20;

  if (!sellerEmail) {
    await logCall(db, "error", body, "seller_email_required");
    return Response.json({ ok: false, error: "seller_email_required" }, { status: 400 });
  }

  // Fontes possíveis do horário, em ordem de confiança
  const candidates = [
    body.scheduled_at,
    body.agenda_tag,
    body.datetime,
    body.meeting_datetime,
    body.when,
    body.message,
    body.text,
    body.content,
  ]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0);

  const year = new Date().getUTCFullYear();
  let parsed: Parsed | null = null;
  for (const c of candidates) {
    parsed = parseWhen(c, year);
    if (parsed) break;
  }

  if (!parsed) {
    await logCall(db, "error", body, "datetime_not_found");
    return Response.json(
      {
        ok: false,
        error: "datetime_not_found",
        detail:
          "Envie scheduled_at (ISO), agenda_tag [AGENDA:DD/MM:HH:MM] ou message com data/hora (ex.: '22/07 às 14h00').",
        received_fields: Object.keys(body),
      },
      { status: 400 },
    );
  }

  // Dedup — mesma reunião (vendedor + lead + horário)
  const { data: existing } = await db
    .from("seller_agenda")
    .select("id")
    .eq("seller_email", sellerEmail)
    .eq("scheduled_at", parsed.date.toISOString())
    .eq("lead_name", leadName)
    .maybeSingle();

  if (existing?.id) {
    await logCall(db, "processed", { ...body, duplicate: true, scheduled_at_utc: parsed.date.toISOString() });
    return Response.json({ ok: true, id: existing.id, duplicate: true, scheduled_at: parsed.date.toISOString() });
  }

  const { data: inserted, error } = await db
    .from("seller_agenda")
    .insert({
      seller_email: sellerEmail,
      seller_name: sellerName,
      lead_name: leadName,
      lead_phone: leadPhone,
      lead_email: leadEmail,
      scheduled_at: parsed.date.toISOString(),
      duration_min: durationMin,
      meeting_type: (body.meeting_type as string) ?? "consultoria",
      source: "agente_ia",
      clint_deal_id: clintDealId,
      status: "agendado",
      notes: (body.notes as string) ?? parsed.tag,
    })
    .select("id")
    .single();

  if (error) {
    await logCall(db, "error", body, error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  await logCall(db, "processed", {
    ...body,
    scheduled_at_utc: parsed.date.toISOString(),
    parser: parsed.matched,
  });
  return Response.json({
    ok: true,
    id: inserted?.id ?? null,
    scheduled_at: parsed.date.toISOString(),
    parser: parsed.matched,
  });
}

export const Route = createFileRoute("/api/public/agenda/book")({
  server: {
    handlers: {
      POST: ({ request }) => handleBook(request),
      GET: () =>
        Response.json({
          ok: true,
          status: "endpoint active",
          usage:
            "POST x-api-key + { seller_email, lead_name, lead_phone?, clint_deal_id?, scheduled_at|agenda_tag|message }",
        }),
    },
  },
});
