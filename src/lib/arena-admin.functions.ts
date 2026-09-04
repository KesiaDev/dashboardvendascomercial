import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAdminEmail } from "@/lib/auth";

function assertAdmin(claims: any) {
  const email = (claims?.email ?? "").toString();
  const role = (claims?.user_metadata?.role ?? "").toString().trim().toLowerCase();
  if (!isAdminEmail(email) && role !== "admin") throw new Error("Acesso restrito ao administrador");
}

function leagueForXp(xp: number): string {
  if (xp >= 20000) return "Lenda";
  if (xp >= 10000) return "Elite";
  if (xp >= 5000) return "Diamante";
  if (xp >= 2000) return "Ouro";
  if (xp >= 500) return "Prata";
  return "Bronze";
}

type SimRow = {
  id: string;
  seller_user_id: string;
  started_at: string;
  ended_at: string | null;
  score: number | null;
  xp_earned: number | null;
  outcome: string | null;
  status: string;
  evaluation: any;
};

function competencyAverages(sims: SimRow[]) {
  const sums: Record<string, { sum: number; n: number }> = {};
  for (const s of sims) {
    const comps = (s.evaluation as any)?.competencias ?? {};
    for (const [k, v] of Object.entries(comps)) {
      if (typeof v === "number") {
        sums[k] ??= { sum: 0, n: 0 };
        sums[k].sum += v;
        sums[k].n += 1;
      }
    }
  }
  return Object.entries(sums)
    .map(([k, v]) => ({ k, avg: Math.round((v.sum / v.n) * 10) / 10 }))
    .sort((a, b) => b.avg - a.avg);
}

function collectStrings(sims: SimRow[], field: "pontos_fortes" | "melhorias") {
  const counts: Record<string, number> = {};
  for (const s of sims) {
    const arr = (s.evaluation as any)?.[field];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        const key = String(item).trim();
        if (key) counts[key] = (counts[key] ?? 0) + 1;
      }
    }
  }
  return Object.entries(counts)
    .map(([text, n]) => ({ text, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);
}

// ---------- Visão geral da equipa ----------
export const getArenaTeamOverviewFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [simsRes, progRes, missionsRes, usersRes] = await Promise.all([
      supabaseAdmin
        .from("arena_simulations")
        .select(
          "id, seller_user_id, started_at, ended_at, score, xp_earned, outcome, status, evaluation",
        )
        .order("started_at", { ascending: false })
        .limit(2000),
      supabaseAdmin.from("arena_progress").select("*"),
      supabaseAdmin
        .from("arena_missions")
        .select("id, seller_user_id, mission_date, completed_simulation_id"),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    const sims = (simsRes.data ?? []) as unknown as SimRow[];
    const emailById = new Map<string, string>();
    const nameById = new Map<string, string>();
    for (const u of usersRes.data?.users ?? []) {
      emailById.set(u.id, u.email ?? "—");
      const meta: any = u.user_metadata ?? {};
      nameById.set(u.id, meta.full_name ?? meta.name ?? (u.email ?? "—").split("@")[0]);
    }

    const ids = new Set<string>([
      ...sims.map((s) => s.seller_user_id),
      ...(progRes.data ?? []).map((p: any) => p.seller_user_id),
      ...(missionsRes.data ?? []).map((m: any) => m.seller_user_id),
    ]);

    const now = Date.now();
    const sellers = [...ids].map((uid) => {
      const mine = sims.filter((s) => s.seller_user_id === uid);
      const finished = mine.filter((s) => s.status === "finished");
      const wins = finished.filter(
        (s) => s.outcome === "venda" || s.outcome === "agendamento",
      ).length;
      const avgScore = finished.length
        ? Math.round(
            (finished.reduce((a, s) => a + Number(s.score ?? 0), 0) / finished.length) * 10,
          ) / 10
        : 0;
      const prog: any = (progRes.data ?? []).find((p: any) => p.seller_user_id === uid);
      const xp = prog?.xp ?? 0;
      const last = mine[0]?.started_at ?? null;
      const daysSince = last ? Math.floor((now - new Date(last).getTime()) / 86_400_000) : null;
      const last7 = mine.filter(
        (s) => now - new Date(s.started_at).getTime() <= 7 * 86_400_000,
      ).length;
      const last30 = mine.filter(
        (s) => now - new Date(s.started_at).getTime() <= 30 * 86_400_000,
      ).length;
      const missions = (missionsRes.data ?? []).filter((m: any) => m.seller_user_id === uid);
      const comps = competencyAverages(finished);
      return {
        userId: uid,
        email: emailById.get(uid) ?? "—",
        name: nameById.get(uid) ?? "—",
        xp,
        league: leagueForXp(xp),
        streak: prog?.streak_days ?? 0,
        total: mine.length,
        finished: finished.length,
        open: mine.filter((s) => s.status === "open").length,
        winRate: finished.length ? Math.round((wins / finished.length) * 100) : 0,
        avgScore,
        last7,
        last30,
        lastPlayedAt: last,
        daysSinceLastPlay: daysSince,
        missionsGenerated: missions.length,
        missionsCompleted: missions.filter((m: any) => m.completed_simulation_id).length,
        strongest: comps.slice(0, 3),
        weakest: comps.slice(-3).reverse(),
      };
    });

    sellers.sort((a, b) => b.total - a.total || b.avgScore - a.avgScore);

    const finishedAll = sims.filter((s) => s.status === "finished");
    return {
      sellers,
      team: {
        sellers: sellers.length,
        active7: sellers.filter((s) => s.last7 > 0).length,
        totalSims: sims.length,
        finished: finishedAll.length,
        avgScore: finishedAll.length
          ? Math.round(
              (finishedAll.reduce((a, s) => a + Number(s.score ?? 0), 0) / finishedAll.length) * 10,
            ) / 10
          : 0,
        weakest: competencyAverages(finishedAll).slice(-5).reverse(),
        commonImprovements: collectStrings(finishedAll, "melhorias"),
      },
    };
  });

// ---------- Detalhe de um vendedor ----------
export const getArenaSellerDetailFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ context, data }) => {
    assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [simsRes, missionsRes] = await Promise.all([
      supabaseAdmin
        .from("arena_simulations")
        .select(
          "id, seller_user_id, started_at, ended_at, score, xp_earned, outcome, status, evaluation, persona_id, arena_personas(persona, difficulty, product, channel)",
        )
        .eq("seller_user_id", data.userId)
        .order("started_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("arena_missions")
        .select("id, mission_date, spec, completed_simulation_id")
        .eq("seller_user_id", data.userId)
        .order("mission_date", { ascending: false })
        .limit(30),
    ]);

    const sims = (simsRes.data ?? []) as any[];
    const finished = sims.filter((s) => s.status === "finished") as unknown as SimRow[];
    return {
      sims: sims.map((s) => ({
        id: s.id,
        started_at: s.started_at,
        ended_at: s.ended_at,
        status: s.status,
        score: s.score,
        outcome: s.outcome,
        xp_earned: s.xp_earned,
        product: s.arena_personas?.product ?? null,
        difficulty: s.arena_personas?.difficulty ?? null,
        channel: s.arena_personas?.channel ?? null,
        persona_nome: s.arena_personas?.persona?.nome ?? null,
        resumo: s.evaluation?.resumo ?? null,
      })),
      missions: missionsRes.data ?? [],
      competencies: competencyAverages(finished),
      strengths: collectStrings(finished, "pontos_fortes"),
      improvements: collectStrings(finished, "melhorias"),
    };
  });

// ---------- Transcrição completa (admin) ----------
export const getArenaSimAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [sim, msgs] = await Promise.all([
      supabaseAdmin
        .from("arena_simulations")
        .select("*, arena_personas(*)")
        .eq("id", data.id)
        .single(),
      supabaseAdmin
        .from("arena_messages")
        .select("*")
        .eq("simulation_id", data.id)
        .order("sent_at", { ascending: true }),
    ]);
    if (sim.error) throw sim.error;
    return { simulation: sim.data, messages: msgs.data ?? [] };
  });
