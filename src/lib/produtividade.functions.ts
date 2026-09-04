import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/supabase-paging";
import { buildAreaMap, cleanSellerName, filterDealsByArea, periodRange, type Deal } from "@/lib/bi";
import { conversionRate } from "@/lib/conversion";
import type { BusinessArea } from "@/lib/pipeline-areas";
import type { Period } from "@/lib/bi";

/**
 * Agregados de /produtividade, calculados NO SERVIDOR.
 *
 * A tela baixava `clint_deals` inteira e rodava oito agregações sobre o mesmo
 * array no navegador. Agora chegam algumas dezenas de linhas de resultado.
 *
 * ⚠️ ATENÇÃO ÀS TRÊS JANELAS DIFERENTES — elas são o motivo de esta função não
 * poder simplesmente filtrar tudo pelo período escolhido:
 *
 *   1. KPIs, motivos de perda, perdas por dia e detalhe de vendas usam o
 *      PERÍODO selecionado na tela.
 *   2. `funilPorVendedor` é um SNAPSHOT de todos os negócios da área, sem
 *      filtro de período nem de status — é assim de propósito, para espelhar o
 *      export "Detalhamento do funil por vendedor" da Clint. Por isso a leitura
 *      não pode ser recortada por data.
 *   3. `produtividadeTime` cruza com o período do último CSV de atividades
 *      importado, que é outro intervalo, descoberto em tempo de execução.
 *
 * Recortar a leitura por período quebraria (2) e (3) em silêncio.
 */

const DEAL_COLS =
  "id,user_name,user_email,status,value,created_at,won_at,lost_at,lost_status_id,stage,stage_id,origin_id,origin_name,contact_name,contact_email";

// Colunas explícitas em vez de índice aberto. O TanStack Start valida em tempo
// de compilação se o retorno do server function é serializável, e um índice
// aberto com valor unknown reprova por não haver como garantir isso.
type TeamActivityRow = {
  id: number;
  user_name: string;
  periodo_inicio: string;
  periodo_fim: string;
  negocios_trabalhados: number;
  ligacoes: number;
  emails: number;
  tarefas: number;
  whatsapp: number;
  reunioes_agendadas: number;
  imported_at: string;
};

type FollowupRow = {
  id: number;
  titulo_atividade: string;
  quantidade: number;
  periodo_inicio: string;
  periodo_fim: string;
  imported_at: string;
};

export type ProdutividadeData = {
  kpis: { leads: number; won: number; convRate: number; revenue: number; avgCycleMs: number };
  motivosPerda: { label: string; count: number; pct: number }[];
  perdasPorDia: { day: string; count: number }[];
  funilPorVendedor: { user: string; total: number; stages: { stage: string; count: number }[] }[];
  vendasPorVendedor: {
    vendedor: string;
    total: number;
    items: {
      id: string;
      contato: string;
      email: string;
      origem: string;
      vendedor: string;
      valor: number;
      data: string | null;
    }[];
  }[];
  produtividadeTime: (TeamActivityRow & {
    negociosRecebidos: number;
    pctTrabalhados: number | null;
  })[];
  followupRows: FollowupRow[];
  /** Período do último CSV de atividades importado, para o rótulo da tela. */
  activityPeriodo: { periodo_inicio: string; periodo_fim: string } | null;
  followupPeriodo: { periodo_inicio: string; periodo_fim: string } | null;
};

export const fetchProdutividadeFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { period: Period; area: BusinessArea }) => d)
  .handler(async ({ data }): Promise<ProdutividadeData> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { start, end } = periodRange(data.period);

    const [deals, pipelineAreas, stages, lostStatuses, teamActivity, followupActivities] =
      await Promise.all([
        // Sem recorte de data: ver a nota sobre as três janelas, no topo.
        fetchAllRows<Deal>(
          ({ from, to }) => db.from("clint_deals").select(DEAL_COLS).range(from, to),
          () => db.from("clint_deals").select("*", { count: "exact", head: true }),
        ),
        db.from("bi_pipeline_areas").select("*").limit(2000),
        db.from("clint_stages").select("*").limit(2000),
        db.from("clint_lost_statuses").select("*").limit(2000),
        db.from("bi_team_activity").select("*").limit(20000),
        db.from("bi_followup_activities").select("*").limit(20000),
      ]);

    const areaMap = buildAreaMap((pipelineAreas.data ?? []) as any[]);
    const dealsInArea = filterDealsByArea(deals, areaMap, data.area);

    const stageLabel = new Map(
      ((stages.data ?? []) as { id: string; label: string }[]).map((s) => [s.id, s.label]),
    );
    const lostLabel = new Map(
      ((lostStatuses.data ?? []) as { id: string; label: string | null }[]).map((s) => [
        s.id,
        s.label ?? "Outro",
      ]),
    );

    const inPeriod = (iso: string | null) => {
      if (!iso) return false;
      const d = new Date(iso);
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    };

    // ── 1. KPIs (período selecionado) ──
    const leads = dealsInArea.filter((d) => inPeriod(d.created_at));
    const won = dealsInArea.filter((d) => d.status === "WON" && inPeriod(d.won_at));
    const conv = conversionRate(dealsInArea, start, end);
    const revenue = won.reduce((s, d) => s + (d.value ?? 0), 0);
    const cycles = won
      .filter((d) => d.created_at && d.won_at)
      .map((d) => new Date(d.won_at!).getTime() - new Date(d.created_at!).getTime())
      .filter((ms) => ms > 0);
    const avgCycleMs = cycles.length > 0 ? cycles.reduce((a, b) => a + b, 0) / cycles.length : 0;

    // ── 2. Motivos de perda e perdas por dia (período selecionado) ──
    const lost = dealsInArea.filter((d) => d.status === "LOST" && inPeriod(d.lost_at));
    const motivoMap = new Map<string, number>();
    const diaMap = new Map<string, number>();
    for (const d of lost) {
      const label = d.lost_status_id ? (lostLabel.get(d.lost_status_id) ?? "Outro") : "Sem motivo";
      motivoMap.set(label, (motivoMap.get(label) ?? 0) + 1);
      diaMap.set(
        new Date(d.lost_at!).toISOString().slice(0, 10),
        (diaMap.get(new Date(d.lost_at!).toISOString().slice(0, 10)) ?? 0) + 1,
      );
    }
    const motivosPerda = Array.from(motivoMap.entries())
      .map(([label, count]) => ({ label, count, pct: lost.length > 0 ? count / lost.length : 0 }))
      .sort((a, b) => b.count - a.count);
    // A formatação dd/MM fica no cliente; aqui vai a data ISO.
    const perdasPorDia = Array.from(diaMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, count]) => ({ day, count }));

    // ── 3. Funil por vendedor: SNAPSHOT, sem período nem status ──
    const sellerStages = new Map<string, Map<string, number>>();
    for (const d of dealsInArea) {
      const user = d.user_name ?? d.user_email ?? "—";
      const stage = d.stage_id ? (stageLabel.get(d.stage_id) ?? d.stage ?? "—") : (d.stage ?? "—");
      if (!sellerStages.has(user)) sellerStages.set(user, new Map());
      const m = sellerStages.get(user)!;
      m.set(stage, (m.get(stage) ?? 0) + 1);
    }
    const funilPorVendedor = Array.from(sellerStages.entries())
      .map(([user, stageMap]) => {
        const st = Array.from(stageMap.entries())
          .map(([stage, count]) => ({ stage, count }))
          .sort((a, b) => b.count - a.count);
        return { user, total: st.reduce((s, x) => s + x.count, 0), stages: st };
      })
      .sort((a, b) => b.total - a.total);

    // ── 4. Detalhe de vendas (período selecionado) ──
    const salesDetail = won
      .map((d) => ({
        id: d.id,
        contato: (d as any).contact_name ?? "—",
        email: d.contact_email ?? "—",
        origem: d.origin_name ?? "—",
        vendedor: d.user_name ?? d.user_email ?? "—",
        valor: d.value ?? 0,
        data: d.won_at,
      }))
      .sort((a, b) => new Date(b.data ?? 0).getTime() - new Date(a.data ?? 0).getTime());

    const vendorMap = new Map<string, ProdutividadeData["vendasPorVendedor"][number]>();
    for (const s of salesDetail) {
      const g = vendorMap.get(s.vendedor) ?? { vendedor: s.vendedor, total: 0, items: [] };
      g.total += s.valor;
      g.items.push(s);
      vendorMap.set(s.vendedor, g);
    }
    const vendasPorVendedor = Array.from(vendorMap.values()).sort((a, b) => b.total - a.total);

    // ── 5. Produtividade do time: janela do último CSV importado ──
    const activity = (teamActivity.data ?? []) as TeamActivityRow[];
    const latestActivity =
      activity.length === 0
        ? null
        : activity.reduce((l, r) => (r.periodo_fim > l.periodo_fim ? r : l), activity[0]);

    let produtividadeTime: ProdutividadeData["produtividadeTime"] = [];
    if (latestActivity) {
      const rangeStart = new Date(latestActivity.periodo_inicio);
      const rangeEnd = new Date(`${latestActivity.periodo_fim}T23:59:59`);
      const leadsByUser = new Map<string, number>();
      for (const d of dealsInArea) {
        if (!d.created_at) continue;
        const dt = new Date(d.created_at);
        if (dt < rangeStart || dt > rangeEnd) continue;
        const user = cleanSellerName(d.user_name ?? d.user_email ?? "—");
        leadsByUser.set(user, (leadsByUser.get(user) ?? 0) + 1);
      }
      produtividadeTime = activity
        .filter(
          (r) =>
            r.periodo_inicio === latestActivity.periodo_inicio &&
            r.periodo_fim === latestActivity.periodo_fim,
        )
        .map((r) => {
          const recebidos = leadsByUser.get(cleanSellerName(r.user_name)) ?? 0;
          return {
            ...r,
            negociosRecebidos: recebidos,
            pctTrabalhados: recebidos > 0 ? r.negocios_trabalhados / recebidos : null,
          };
        })
        .sort((a, b) => b.negocios_trabalhados - a.negocios_trabalhados);
    }

    // ── 6. Follow-up: só o último período importado ──
    const followups = (followupActivities.data ?? []) as FollowupRow[];
    const latestFollowup =
      followups.length === 0
        ? null
        : followups.reduce((l, r) => (r.periodo_fim > l.periodo_fim ? r : l), followups[0]);
    const followupRows = latestFollowup
      ? followups
          .filter(
            (r) =>
              r.periodo_inicio === latestFollowup.periodo_inicio &&
              r.periodo_fim === latestFollowup.periodo_fim,
          )
          .sort((a, b) => b.quantidade - a.quantidade)
      : [];

    return {
      kpis: { leads: leads.length, won: won.length, convRate: conv.rate, revenue, avgCycleMs },
      motivosPerda,
      perdasPorDia,
      funilPorVendedor,
      vendasPorVendedor,
      produtividadeTime,
      followupRows,
      activityPeriodo: latestActivity
        ? {
            periodo_inicio: latestActivity.periodo_inicio,
            periodo_fim: latestActivity.periodo_fim,
          }
        : null,
      followupPeriodo: latestFollowup
        ? {
            periodo_inicio: latestFollowup.periodo_inicio,
            periodo_fim: latestFollowup.periodo_fim,
          }
        : null,
    };
  });
