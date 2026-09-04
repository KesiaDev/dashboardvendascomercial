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

  // Só olha uma janela recente (últimos 180 dias) e mais recentes primeiro:
  // são esses leads que aparecem nos relatórios. Evita varrer 80k+ linhas.
  const since = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString();
  const { V3_ORIGIN_NAMES } = await import("@/lib/origem-v3.server");
  const rows: any[] = [];
  const PAGE = 200;
  // paginação por keyset (created_at) — offsets altos estouram o statement timeout
  let cursor: string | null = null;
  for (let page = 0; page < 50; page++) {
    let q = db
      .from("clint_deals")
      .select("id,contact_id,contact_tags,created_at")
      .not("contact_id", "is", null)
      // clint_deals.contact_tags é NOT NULL DEFAULT '{}' (migration 20260803220000),
      // então `.is("contact_tags", null)` NUNCA casava com nada: o sync rodava a
      // cada 30 min e processava 0 linhas desde que foi escrito. O que se quer é
      // "array vazio", que em PostgREST se escreve assim. O backfill manual em
      // api/public/backfill-contact-tags.ts já filtrava certo, com `!r.contact_tags?.length`.
      .eq("contact_tags", "{}")
      // só os funis que interessam ao comercial — evita varrer 80k linhas
      .in("origin_name", V3_ORIGIN_NAMES)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(PAGE);
    if (cursor) q = q.lt("created_at", cursor);
    const { data, error } = await q;
    if (error) {
      // timeout/erro parcial: segue com o que já veio em vez de derrubar a rota
      console.error("contact-tags: page query failed:", error.message);
      break;
    }
    if (!data?.length) break;
    rows.push(...data);
    cursor = data[data.length - 1]!.created_at as string;
    if (data.length < PAGE || rows.length >= maxContacts) break;
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
