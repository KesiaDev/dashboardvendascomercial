/**
 * Sincroniza as tags do contato da Clint para clint_deals.contact_tags.
 * Incremental: só busca contatos de deals que ainda não têm tags gravadas.
 */
const CLINT_BASE = "https://api.clint.digital";
const BATCH = 10; // chamadas paralelas ao Clint

export async function runContactTagsBackfill(maxContacts = 100_000) {
  const token = process.env["CLINT_API_TOKEN"];
  if (!token) throw new Error("CLINT_API_TOKEN not configured");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const rows: any[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await db
      .from("clint_deals")
      .select("id,contact_id,contact_tags,created_at")
      .not("contact_id", "is", null)
      .is("contact_tags", null)
      // leads mais recentes primeiro — são os que aparecem nos relatórios
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }

  const pending = rows.filter((r: any) => !r.contact_tags?.length);

  let updated = 0;
  let skipped = 0;
  const errors: { deal_id: string; error: string }[] = [];

  const contactMap = new Map<string, string[]>();
  const uniqueContactIds = [...new Set(pending.map((r: any) => r.contact_id as string))].slice(
    0,
    maxContacts,
  );

  for (let i = 0; i < uniqueContactIds.length; i += BATCH) {
    const batch = uniqueContactIds.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map(async (contactId) => {
        try {
          const res = await fetch(`${CLINT_BASE}/v1/contacts/${contactId}`, {
            headers: { "api-token": token, accept: "application/json" },
          });
          if (!res.ok) return;
          const json: any = await res.json();
          const payload = json?.data ?? json;
          const tags: string[] = (payload?.tags ?? [])
            .map((t: any) => (typeof t === "string" ? t : t?.name))
            .filter(Boolean);
          contactMap.set(contactId, tags);
        } catch {
          // ignora falhas individuais
        }
      }),
    );
  }

  for (const deal of pending) {
    const tags = contactMap.get(deal.contact_id);
    if (!tags) {
      skipped++;
      continue;
    }
    const { error } = await db.from("clint_deals").update({ contact_tags: tags }).eq("id", deal.id);
    if (error) errors.push({ deal_id: deal.id, error: error.message });
    else updated++;
  }

  return {
    ok: true,
    total_pending_deals: rows.length,
    pending: pending.length,
    unique_contacts: uniqueContactIds.length,
    contacts_fetched: contactMap.size,
    updated,
    skipped,
    errors: errors.slice(0, 20),
  };
}
