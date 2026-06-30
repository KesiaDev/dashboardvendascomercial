import { createServerFn } from "@tanstack/react-start";

// Combined sync function used by the public cron trigger (n8n daily 6am).
export async function runFullClintSync() {
  const token = process.env.CLINT_API_TOKEN;
  if (!token) throw new Error("CLINT_API_TOKEN not configured");
  const users = await syncClintUsers();
  const origins = await syncClintOrigins();
  const areas = await syncPipelineAreas();
  const deals = await syncClintDeals({ data: { sinceDays: 90 } });
  return { ok: true, synced_at: new Date().toISOString(), results: { users, origins, areas, deals } };
}


const CLINT_BASE = "https://api.clint.digital";

function parseClintNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\s/g, "");
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

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

/**
 * Sincroniza os funis (origins) da Clint e suas etapas (stages).
 * Necessário para reconstruir o gráfico de funil e o filtro por origem.
 */
export const syncClintOrigins = createServerFn({ method: "POST" }).handler(async () => {
  const token = process.env.CLINT_API_TOKEN;
  if (!token) throw new Error("CLINT_API_TOKEN not configured");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let page = 1;
  const origins: any[] = [];
  while (true) {
    const data = await clintFetch(`/v1/origins?limit=100&page=${page}`, token);
    origins.push(...(data.data ?? []));
    if (!data.hasNext) break;
    page += 1;
    if (page > 20) break;
  }

  const originRows = origins.map((o: any) => ({
    id: o.id,
    name: o.name,
    group_name: o.group?.name?.trim() ?? null,
    archived: !!o.archived_at,
    synced_at: new Date().toISOString(),
  }));

  const stageRows = origins.flatMap((o: any) =>
    (o.stages ?? []).map((s: any) => ({
      id: s.id,
      origin_id: o.id,
      label: s.label,
      stage_order: s.order,
      type: s.type,
      synced_at: new Date().toISOString(),
    })),
  );

  if (originRows.length) {
    const { error } = await supabaseAdmin
      .from("clint_origins")
      .upsert(originRows, { onConflict: "id" });
    if (error) throw error;
  }
  if (stageRows.length) {
    const { error } = await supabaseAdmin
      .from("clint_origin_stages")
      .upsert(stageRows, { onConflict: "id" });
    if (error) throw error;
  }

  return { origins: originRows.length, stages: stageRows.length };
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

    // Origin names (no /v1/lost-status endpoint exists in Clint API)
    const originsResp = await clintFetch(`/v1/origins?limit=200`, token);
    const originMap = new Map<string, string>(
      (originsResp.data ?? []).map((g: any) => [g.id, g.name]),
    );

    // Mapa de usuários para resolver d.won_by (vem como UUID puro na API, não
    // como objeto igual d.user) — usa a tabela já sincronizada por syncClintUsers.
    const { data: usersRows } = await supabaseAdmin
      .from("clint_users")
      .select("id,first_name,last_name,email");
    const userMap = new Map<string, { name: string | null; email: string | null }>(
      (usersRows ?? []).map((u: any) => [
        u.id,
        { name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email || null, email: u.email ?? null },
      ]),
    );

    const lostIds = new Set<string>();
    let page = 1;
    let total = 0;
    try {
      while (true) {
        const q = new URLSearchParams({ limit: "200", page: String(page) });
        if (since) q.set("updated_at_start", since);
        const resp = await clintFetch(`/v1/deals?${q}`, token);
        const items: any[] = resp.data ?? [];
        if (items.length === 0) break;

        const rows = items.map((d: any) => {
          if (d.lost_status_id) lostIds.add(d.lost_status_id);
          const wonByUser = d.won_by ? userMap.get(d.won_by) : undefined;
          return {
            id: d.id,
            user_id: d.user?.id ?? null,
            user_email: d.user?.email ?? null,
            user_name: d.user?.full_name?.trim() ?? null,
            won_by_user_id: d.won_by ?? null,
            won_by_name: wonByUser?.name ?? null,
            won_by_email: wonByUser?.email ?? null,
            contact_id: d.contact?.id ?? null,
            contact_name: d.contact?.name ?? null,
            contact_email: d.contact?.email ?? null,
            contact_phone: d.contact?.phone ?? null,
            contact_ddi: d.contact?.ddi ?? null,
            origin_id: d.origin_id ?? null,
            origin_name: d.origin_id ? (originMap.get(d.origin_id) ?? null) : null,
            stage: d.stage ?? null,
            stage_id: d.stage_id ?? null,
            status: d.status,
            value: parseClintNumber(d.value),
            currency: d.currency ?? null,
            created_at: d.created_at ?? null,
            won_at: d.won_at ?? null,
            lost_at: d.lost_at ?? null,
            lost_status_id: d.lost_status_id ?? null,
            updated_at: d.updated_at ?? null,
            updated_stage_at: d.updated_stage_at ?? null,
            raw: d,
            synced_at: new Date().toISOString(),
          };
        });

        const { error } = await supabaseAdmin
          .from("clint_deals")
          .upsert(rows, { onConflict: "id" });
        if (error) throw error;
        total += rows.length;

        if (!resp.hasNext) break;
        page += 1;
        if (total >= 50_000) break;
      }

      // Register newly seen lost_status_ids (preserve user-set labels via ignoreDuplicates)
      if (lostIds.size) {
        const rows = Array.from(lostIds).map((id) => ({ id, label: null }));
        const { error } = await supabaseAdmin
          .from("clint_lost_statuses")
          .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
        if (error) throw error;
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

/** Permite o usuário renomear um motivo de perda (lost_status_id) com label amigável. */
export const setLostStatusLabel = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; label: string | null }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("clint_lost_statuses")
      .upsert(
        { id: data.id, label: data.label, updated_at: new Date().toISOString() },
        { onConflict: "id" },
      );
    if (error) throw error;
    return { ok: true };
  });

/**
 * Backfill: gera linhas em clint_lost_statuses para todos os lost_status_id já existentes
 * em clint_deals (útil pra quem já tem dados sincronizados antes desta versão).
 */
export const backfillLostStatuses = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ids = new Set<string>();
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("clint_deals")
      .select("lost_status_id")
      .not("lost_status_id", "is", null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) if (r.lost_status_id) ids.add(r.lost_status_id);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  if (ids.size) {
    const rows = Array.from(ids).map((id) => ({ id, label: null }));
    const { error } = await supabaseAdmin
      .from("clint_lost_statuses")
      .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw error;
  }
  return { count: ids.size };
});

/**
 * Classifica automaticamente todos os pipelines em áreas de negócio
 * (Comercial, Implantação, Pós-venda, Financeiro, Marketing...) com base
 * no group_name que a própria Clint já atribui a cada origin. Roda com
 * ignoreDuplicates: true para nunca sobrescrever uma classificação manual.
 */
export const syncPipelineAreas = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { classifyByGroupName } = await import("@/lib/pipeline-areas");

  const { data: origins, error } = await supabaseAdmin
    .from("clint_origins")
    .select("id,group_name,archived");
  if (error) throw error;

  const rows = (origins ?? []).map((o) => ({
    pipeline_id: o.id,
    area: classifyByGroupName(o.group_name),
    ativo: !o.archived,
    auto_classified: true,
    updated_at: new Date().toISOString(),
  }));

  if (rows.length) {
    const { error: upErr } = await supabaseAdmin
      .from("bi_pipeline_areas")
      .upsert(rows, { onConflict: "pipeline_id", ignoreDuplicates: true });
    if (upErr) throw upErr;
  }
  return { classified: rows.length };
});

/**
 * Busca o ranking de vendedores DIRETO da API da Clint (mesma fonte que o
 * n8n), sem depender do DB local. Retorna rankings pré-computados para mês,
 * semana, hoje e dia anterior — atribuição por won_by (quem fechou) com
 * fallback para user (responsável), excluindo sellers internos.
 */
export const fetchClintRankingFn = createServerFn({ method: "GET" })
  .inputValidator((d: { year: number; month: number }) => d)
  .handler(async ({ data }) => {
    const token = process.env.CLINT_API_TOKEN;
    if (!token) throw new Error("CLINT_API_TOKEN not configured");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: usersRows = [] } = await supabaseAdmin
      .from("clint_users")
      .select("id,first_name,last_name,email");
    const userMap = new Map<string, string>(
      (usersRows as any[]).map((u) => [
        u.id,
        `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || (u.email as string) || "—",
      ]),
    );

    // Whitelist de FUNIS que contam para o ranking comercial (decisão de negócio:
    // somente vendas de PIPELINE_COMERCIAL-V3, Sessão Estratégica e Renovações).
    // Atribuição: por RESPONSÁVEL do negócio (d.user), pois nesses funis a Clint
    // raramente preenche `won_by`. Esse é o número que a equipe acompanha
    // (ex.: Gisele com ~24 em junho).
    const ORIGIN_PATTERNS = [
      /pipeline[_\s-]*comercial/i,
      /sess[aã]o\s*estrat[eé]gica/i,
      /^\s*renova[cç][aã]o/i,
      /live\s*de\s*renova/i,
      /renova[cç][aã]o\s*mentoria/i,
      /renova[cç][aã]o\s*mgt/i,
      /follow[-\s]*up\s*mentoria/i,
      // FGRS e IGT (turmas ativas) — vendas do João etc.
      /^\s*fgrs\s*\d+/i,
      /perpetuo\s*fgrs/i,
      /funil\s*-\s*fgrs/i,
      /^\s*igt\s*\d+/i,
      /^\s*igt\d+/i,
      /funil\s*-\s*igt/i,
    ];
    const _originNameMap = new Map<string, string>();
    const allowedOriginIds = new Set<string>();
    {
      let p = 1;
      while (true) {
        const r = await clintFetch(`/v1/origins?limit=200&page=${p}`, token);
        for (const o of (r.data ?? [])) {
          _originNameMap.set(o.id, o.name ?? "");
          if (ORIGIN_PATTERNS.some((re) => re.test(o.name ?? ""))) {
            allowedOriginIds.add(o.id);
          }
        }
        if (!r.hasNext) break;
        if (++p > 10) break;
      }
    }
    if (allowedOriginIds.size === 0) {
      const { data: originsRows = [] } = await supabaseAdmin
        .from("clint_origins")
        .select("id,name");
      for (const o of originsRows as any[]) {
        _originNameMap.set(o.id, o.name ?? "");
        if (ORIGIN_PATTERNS.some((re) => re.test(o.name ?? ""))) {
          allowedOriginIds.add(o.id);
        }
      }
    }

    const now = new Date();
    const targetYear  = data.year;
    const targetMonth = data.month;
    const isCurrentMonth =
      targetYear === now.getFullYear() && targetMonth === now.getMonth() + 1;

    const monthStart = new Date(targetYear, targetMonth - 1, 1);
    const monthEnd   = new Date(targetYear, targetMonth, 1);

    const since = new Date(monthStart.getTime() - 3 * 86_400_000).toISOString();
    const all: any[] = [];
    let page = 1;
    while (true) {
      const q = new URLSearchParams({ limit: "200", page: String(page), updated_at_start: since });
      const resp = await clintFetch(`/v1/deals?${q}`, token);
      const items: any[] = resp.data ?? [];
      if (!items.length) break;
      all.push(...items);
      if (!resp.hasNext) break;
      if (++page > 50) break;
    }

    const EXCLUDED = new Set(["camila faria", "aline goncalves", "kesia nandi"]);
    const normStr = (s: string) =>
      s.trim().toLowerCase().replace(/\s+/g, " ")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    function buildRanking(start: Date, end: Date | null) {
      const map = new Map<string, { name: string; won: number; revenue: number }>();
      for (const d of all) {
        if (d.status !== "WON" || !d.won_at) continue;
        const wonAt = new Date(d.won_at);
        if (wonAt < start) continue;
        if (end && wonAt >= end) continue;
        const v = parseFloat(String(d.value ?? 0)) || 0;
        // Não filtra v<=0: renovações são lançadas na Clint com valor 0
        // e precisam entrar na contagem do vendedor (faturamento real vem do CSV Hotmart).
        if (allowedOriginIds.size > 0 && !allowedOriginIds.has(d.origin_id)) continue;

        // Crédito para o RESPONSÁVEL (d.user), com fallback para won_by quando
        // o responsável não está preenchido.
        const userId: string | undefined =
          (typeof d.user === "string" ? d.user : d.user?.id)
          || (typeof d.won_by === "string" ? d.won_by : d.won_by?.id);
        if (!userId) continue;
        const userName: string =
          (typeof d.user === "object" && (d.user?.full_name || d.user?.email))
          || userMap.get(userId)
          || (typeof d.won_by === "object" && (d.won_by?.full_name || d.won_by?.email))
          || "—";
        const clean = userName.trim().replace(/\s+/g, " ");
        if (EXCLUDED.has(normStr(clean))) continue;
        const cur = map.get(userId) ?? { name: clean, won: 0, revenue: 0 };
        cur.won += 1;
        cur.revenue += v;
        map.set(userId, cur);
      }
      return Array.from(map.values())
        .sort((a, b) => b.revenue - a.revenue)
        .map((s, i) => ({ user_id: `clint-${i}`, name: s.name, won: s.won, revenue: s.revenue, leads: 0, lost: 0, open: 0, email: "" }));
    }

    const mes = buildRanking(monthStart, monthEnd);

    const todayStart     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);

    // Semana comercial: segunda → domingo (preferência do usuário).
    const dayOfWeek = todayStart.getDay(); // 0 = domingo, 1 = segunda, ..., 6 = sábado
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    const weekStart = new Date(todayStart.getTime() - daysSinceMonday * 86_400_000);


    return {
      mes,
      semana: isCurrentMonth ? buildRanking(weekStart, null) : [],
      dia:    isCurrentMonth ? buildRanking(todayStart, null) : [],
      destaques: {
        dia:    isCurrentMonth ? (buildRanking(todayStart, null)[0] ?? null) : null,
        semana: isCurrentMonth ? (buildRanking(weekStart, null)[0] ?? null) : null,
        mes:    mes[0] ?? null,
      },
      _debug: {
        allowedOriginCount: allowedOriginIds.size,
        totalDeals: all.length,
      },
    };
  });

/**
 * Reclassificação manual de um pipeline específico (usado na tela de
 * configuração de áreas). Marca auto_classified=false para essa origin
 * nunca mais ser sobrescrita por syncPipelineAreas.
 */
export const setPipelineArea = createServerFn({ method: "POST" })
  .inputValidator((d: { pipelineId: string; area: string; ativo: boolean }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("bi_pipeline_areas").upsert(
      {
        pipeline_id: data.pipelineId,
        area: data.area,
        ativo: data.ativo,
        auto_classified: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "pipeline_id" },
    );
    if (error) throw error;
    return { ok: true };
  });
