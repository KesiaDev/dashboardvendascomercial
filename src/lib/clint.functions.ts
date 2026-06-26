import { createServerFn } from "@tanstack/react-start";

const CLINT_BASE = "https://api.clint.digital";

async function clintFetch(path: string, token: string) {
  const res = await fetch(`${CLINT_BASE}${path}`, {
    headers: { "api-token": token, accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Clint API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export const syncClintUsers = createServerFn({ method: "POST" }).handler(async () => {
  const token = process.env.CLINT_API_TOKEN;
  if (!token) throw new Error("CLINT_API_TOKEN not configured");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let page = 1;
  const users: any[] = [];
  while (true) {
    const data = await clintFetch(`/v1/users?limit=100&page=${page}`, token);
    users.push(...(data.data ?? []));
    if (!data.hasNext) break;
    page += 1;
    if (page > 20) break;
  }
  const rows = users.map((u: any) => ({
    id: u.id,
    email: u.email,
    first_name: u.first_name,
    last_name: u.last_name,
    synced_at: new Date().toISOString(),
  }));
  if (rows.length) {
    const { error } = await supabaseAdmin.from("clint_users").upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }
  return { count: rows.length };
});

export const syncClintDeals = createServerFn({ method: "POST" })
  .inputValidator((d: { sinceDays?: number; full?: boolean }) => d ?? {})
  .handler(async ({ data }) => {
    const token = process.env.CLINT_API_TOKEN;
    if (!token) throw new Error("CLINT_API_TOKEN not configured");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const sinceDays = data?.sinceDays ?? 180;
    const since = data?.full
      ? null
      : new Date(Date.now() - sinceDays * 86_400_000).toISOString();

    const { data: logRow, error: logErr } = await supabaseAdmin
      .from("clint_sync_log")
      .insert({ kind: "deals", since })
      .select("id")
      .single();
    if (logErr) throw logErr;
    const logId = logRow!.id;

    // Reference data for enrichment
    const [lostStatuses, origins] = await Promise.all([
      clintFetch(`/v1/lost-status?limit=200`, token),
      clintFetch(`/v1/origins?limit=200`, token),
    ]);
    const lostMap = new Map<string, string>(
      (lostStatuses.data ?? []).map((g: any) => [g.id, g.name]),
    );
    const originMap = new Map<string, string>(
      (origins.data ?? []).map((g: any) => [g.id, g.name]),
    );

    let page = 1;
    let total = 0;
    try {
      while (true) {
        const q = new URLSearchParams({ limit: "200", page: String(page) });
        if (since) q.set("updated_at_start", since);
        const resp = await clintFetch(`/v1/deals?${q}`, token);
        const items: any[] = resp.data ?? [];
        if (items.length === 0) break;

        const rows = items.map((d: any) => ({
          id: d.id,
          user_id: d.user?.id ?? null,
          user_email: d.user?.email ?? null,
          user_name: d.user?.full_name?.trim() ?? null,
          contact_id: d.contact?.id ?? null,
          contact_name: d.contact?.name ?? null,
          contact_email: d.contact?.email ?? null,
          contact_phone: d.contact?.phone ?? null,
          contact_ddi: d.contact?.ddi ?? null,
          origin_id: d.origin_id ?? null,
          origin_name: d.origin_id ? originMap.get(d.origin_id) ?? null : null,
          stage: d.stage ?? null,
          stage_id: d.stage_id ?? null,
          status: d.status,
          value: parseClintNumber(d.value),
          currency: d.currency ?? null,
          created_at: d.created_at ?? null,
          won_at: d.won_at ?? null,
          lost_at: d.lost_at ?? null,
          lost_status_id: d.lost_status_id ?? null,
          lost_status_name: d.lost_status_id ? lostMap.get(d.lost_status_id) ?? null : null,
          updated_at: d.updated_at ?? null,
          updated_stage_at: d.updated_stage_at ?? null,
          raw: d,
          synced_at: new Date().toISOString(),
        }));

        const { error } = await supabaseAdmin
          .from("clint_deals")
          .upsert(rows, { onConflict: "id" });
        if (error) throw error;
        total += rows.length;

        if (!resp.hasNext) break;
        page += 1;
        if (total >= 50_000) break; // safety cap per run
      }

      await supabaseAdmin
        .from("clint_sync_log")
        .update({
          finished_at: new Date().toISOString(),
          rows_synced: total,
          status: "ok",
        })
        .eq("id", logId);

      return { count: total, since };
    } catch (e: any) {
      await supabaseAdmin
        .from("clint_sync_log")
        .update({
          finished_at: new Date().toISOString(),
          rows_synced: total,
          status: "error",
          error: String(e?.message ?? e),
        })
        .eq("id", logId);
      throw e;
    }
  });
