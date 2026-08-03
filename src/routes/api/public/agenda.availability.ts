import { createFileRoute } from "@tanstack/react-router";

function checkApiKey(request: Request): boolean {
  const key = request.headers.get("x-api-key");
  const expected = process.env.INTERNAL_API_KEY;
  return !!expected && key === expected;
}

function isDST(date: Date): boolean {
  const year = date.getFullYear();
  const start = lastSunday(year, 2);
  const end = lastSunday(year, 9);
  return date >= start && date < end;
}

function lastSunday(year: number, month: number): Date {
  const d = new Date(year, month + 1, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function lisbonToUTC(year: number, month: number, day: number, hour: number, minute: number): Date {
  const offset = isDST(new Date(year, month, day)) ? 1 : 0;
  return new Date(Date.UTC(year, month, day, hour - offset, minute));
}

function utcToLisbon(date: Date): { year: number; month: number; day: number; hour: number; minute: number; dow: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Lisbon",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
    weekday: "short",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: parseInt(get("year")),
    month: parseInt(get("month")) - 1,
    day: parseInt(get("day")),
    hour: parseInt(get("hour")),
    minute: parseInt(get("minute")),
    dow: dowMap[get("weekday")] ?? 0,
  };
}

interface Slot { date: string; time: string; iso: string }

function generateDaySlots(
  year: number, month: number, day: number,
  bookings: Date[], slotMin = 30, startH = 9, endH = 18,
): Slot[] {
  const slots: Slot[] = [];
  for (let h = startH; h < endH; h++) {
    for (let m = 0; m < 60; m += slotMin) {
      const slotUTC = lisbonToUTC(year, month, day, h, m);
      const conflict = bookings.some(
        (b) => Math.abs(slotUTC.getTime() - b.getTime()) < slotMin * 60 * 1000,
      );
      if (!conflict) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        slots.push({ date: dateStr, time: timeStr, iso: slotUTC.toISOString() });
      }
    }
  }
  return slots;
}

async function handleAvailability(request: Request) {
  if (!checkApiKey(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const sellerEmail = url.searchParams.get("seller_email");
  const dateStr = url.searchParams.get("date"); // YYYY-MM-DD in Lisbon tz
  const days = Math.min(parseInt(url.searchParams.get("days") ?? "7", 10), 30);
  const maxSlots = parseInt(url.searchParams.get("max") ?? "10", 10);

  if (!sellerEmail) {
    return Response.json({ ok: false, error: "seller_email required" }, { status: 400 });
  }

  const now = new Date();
  let startUTC: Date;
  if (dateStr) {
    const [y, mo, d] = dateStr.split("-").map(Number);
    startUTC = lisbonToUTC(y, mo - 1, d, 0, 0);
  } else {
    startUTC = new Date(now);
    startUTC.setUTCHours(0, 0, 0, 0);
  }
  const endUTC = new Date(startUTC.getTime() + days * 24 * 60 * 60 * 1000);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: bookings, error } = await supabaseAdmin
    .from("seller_agenda")
    .select("scheduled_at")
    .eq("seller_email", sellerEmail.toLowerCase())
    .neq("status", "cancelado")
    .gte("scheduled_at", startUTC.toISOString())
    .lte("scheduled_at", endUTC.toISOString());

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const bookedTimes = (bookings ?? []).map((b) => new Date(b.scheduled_at));
  const allSlots: Slot[] = [];

  const cursor = new Date(startUTC);
  while (cursor < endUTC && allSlots.length < maxSlots * 3) {
    const loc = utcToLisbon(cursor);
    if (loc.dow !== 0 && loc.dow !== 6) { // skip weekends
      const daySlots = generateDaySlots(loc.year, loc.month, loc.day, bookedTimes);
      // Only future slots
      allSlots.push(...daySlots.filter((s) => new Date(s.iso) > now));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return Response.json({
    ok: true,
    seller_email: sellerEmail,
    slots: allSlots.slice(0, maxSlots),
    generated_at: now.toISOString(),
  });
}

export const Route = createFileRoute("/api/public/agenda/availability")({
  server: {
    handlers: {
      GET: ({ request }) => handleAvailability(request),
    },
  },
});
