/**
 * Backfill das tags de contato nos deals do Clint.
 * Busca tags via /v1/contacts/{contact_id} e salva em clint_deals.contact_tags.
 * GET /api/public/backfill-contact-tags  (requer x-api-key)
 */
import { createFileRoute } from "@tanstack/react-router";

const CLINT_BASE = "https://api.clint.digital";
const BATCH = 10; // chamadas paralelas ao Clint

function checkApiKey(request: Request): boolean {
  const key = request.headers.get("x-api-key");
  const expected = process.env.INTERNAL_API_KEY;
  return !!expected && key === expected;
}

async function runBackfill() {
  const token = process.env.CLINT_API_TOKEN;
  if (!token) throw new Error("CLINT_API_TOKEN not configured");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  // Busca todos os deals com contact_id (sem paginação limit-safe)
  const rows: any[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await db
      .from("clint_deals")
      .select("id,contact_id,contact_tags")
      .not("contact_id", "is", null)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }

  // Filtra apenas os que não têm tags ainda (contact_tags vazio)
  const pending = rows.filter((r: any) => !r.contact_tags?.length);

  let updated = 0;
  let skipped = 0;
  const errors: { deal_id: string; error: string }[] = [];

  // Deduplica contact_ids para não buscar o mesmo contato duas vezes
  const contactMap = new Map<string, string[]>(); // contact_id → tag names
  const uniqueContactIds = [...new Set(pending.map((r: any) => r.contact_id as string))];

  // Busca tags em batches paralelos
  for (let i = 0; i < uniqueContactIds.length; i += BATCH) {
    const batch = uniqueContactIds.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map(async (contactId) => {
        try {
          const res = await fetch(`${CLINT_BASE}/v1/contacts/${contactId}`, {
            headers: { "api-token": token, accept: "application/json" },
          });
          if (!res.ok) return;
          const json = await res.json();
          const tags: string[] = (json.tags ?? [])
            .map((t: any) => t.name as string)
            .filter(Boolean);
          contactMap.set(contactId, tags);
        } catch {
          // silently skip individual failures
        }
      }),
    );
  }

  // Atualiza clint_deals com as tags
  for (const deal of pending) {
    const tags = contactMap.get(deal.contact_id);
    if (!tags) {
      skipped++;
      continue;
    }

    const { error } = await db.from("clint_deals").update({ contact_tags: tags }).eq("id", deal.id);

    if (error) {
      errors.push({ deal_id: deal.id, error: error.message });
    } else {
      updated++;
    }
  }

  return {
    ok: true,
    total_deals: rows.length,
    pending: pending.length,
    unique_contacts: uniqueContactIds.length,
    contacts_fetched: contactMap.size,
    updated,
    skipped,
    errors: errors.slice(0, 20),
  };
}

async function handle(request: Request) {
  if (!checkApiKey(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runBackfill();
    return Response.json(result);
  } catch (e: unknown) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/public/backfill-contact-tags")({
  server: {
    handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) },
  },
});
