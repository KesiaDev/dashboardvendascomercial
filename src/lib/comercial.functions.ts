import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/supabase-paging";
import {
  cleanSellerName,
  effectiveWinner,
  findPhantomWonDeals,
  isExcludedSeller,
  type Deal,
  type SaleRecord,
} from "@/lib/bi";
import { conversionRate } from "@/lib/conversion";

/**
 * Agregados de /comercial, calculados NO SERVIDOR.
 *
 * A tela baixava CINCO conjuntos completos — clint_deals, sales, origens,
 * etapas e motivos de perda — e rodava dez agregações sobre eles no navegador.
 * Só as duas primeiras já eram dezenas de MB.
 *
 * A lógica foi movida verbatim das `useMemo` da rota: mesmos laços, mesmas
 * janelas, mesmos filtros. O que muda é o lado em que roda.
 *
 * TRÊS JANELAS convivem aqui e precisam continuar distintas:
 *
 *   • `filtered`           created_at no período E no funil selecionado
 *                          (alimenta o funil, motivos de perda e o `total`)
 *   • `filteredAllOrigins` created_at no período, TODOS os funis
 *                          (alimenta os leads por vendedor)
 *   • ganhos               won_at no período, todos os funis
 *                          (a venda conta no mês em que fechou, não no mês em
 *                          que o lead entrou)
 *
 * Por isso a leitura casa created_at OU won_at OU lost_at — recortar só por
 * created_at perderia os negócios antigos fechados no período.
 *
 * MOEDA: o resultado sai em BRL e o cliente converte na exibição. A cotação
 * precisa vir do cliente porque há negócios em EUR na base — somá-los sem
 * converter trataria euro como real.
 */

const DEAL_COLS =
  "id,user_id,user_name,user_email,won_by_user_id,won_by_name,won_by_email,contact_email,status,value,currency,created_at,won_at,lost_at,lost_status_id,stage,stage_id,origin_id,origin_name";

const SALE_COLS = "email_cliente,data_venda,status,produto_original";

type Stage = { id: string; origin_id: string; label: string; stage_order: number; type: string };

export type ComercialDashboard = {
  metrics: {
    total: number;
    won: number;
    lost: number;
    open: number;
    revenue: number;
    convRate: number;
    respRate: number;
    noShow: number;
    avgCycle: number;
    reuniaoAgendada: number;
    reuniaoRealizada: number;
  };
  funnelData: { label: string; count: number; pct: number; type: string }[];
  lostData: { id: string; name: string; unnamed: boolean; value: number }[];
  sellers: {
    name: string;
    email: string;
    leads: number;
    won: number;
    lost: number;
    open: number;
    revenue: number;
  }[];
};

export const fetchComercialDashboardFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { from: string | null; to: string | null; originId: string; rate: number }) => d,
  )
  .handler(async ({ data }): Promise<ComercialDashboard> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const start = data.from ? new Date(data.from) : null;
    const end = data.to ? new Date(data.to) : null;
    const rate = data.rate > 0 ? data.rate : 1;
    /** Valor do negócio em BRL, convertendo os que estão em EUR. */
    const brl = (d: Deal) =>
      (d.currency ?? "BRL").toUpperCase() === "EUR" ? (d.value ?? 0) * rate : (d.value ?? 0);

    const periodFilter = <Q>(q: Q) => {
      if (!data.from || !data.to) return q as any;
      const a = data.from;
      const b = data.to;
      return (q as any).or(
        `and(created_at.gte.${a},created_at.lte.${b}),` +
          `and(won_at.gte.${a},won_at.lte.${b}),` +
          `and(lost_at.gte.${a},lost_at.lte.${b})`,
      );
    };

    const [deals, stagesRes, lostRes] = await Promise.all([
      fetchAllRows<Deal>(
        ({ from, to }) => periodFilter(db.from("clint_deals").select(DEAL_COLS)).range(from, to),
        () => periodFilter(db.from("clint_deals").select("*", { count: "exact", head: true })),
      ),
      db.from("clint_stages").select("*").limit(5000),
      db.from("clint_lost_statuses").select("*").limit(2000),
    ]);

    // Ganhos-fantasma: só as vendas dos e-mails dos ganhos, não a tabela toda.
    // A função casa pela venda de data mais próxima, que pode estar fora do
    // período — por isso o recorte é por e-mail e não por data.
    const wonEmails = Array.from(
      new Set(
        deals
          .filter((d) => d.status === "WON" && d.contact_email)
          .map((d) => d.contact_email!.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    const emailChunks: string[][] = [];
    for (let i = 0; i < wonEmails.length; i += 200) emailChunks.push(wonEmails.slice(i, i + 200));
    const salePages = await Promise.all(
      emailChunks.map((c) =>
        db
          .from("sales")
          .select(SALE_COLS)
          .in("email_cliente", c)
          .limit(c.length * 50),
      ),
    );
    const sales: SaleRecord[] = [];
    for (const { data: rows } of salePages) sales.push(...((rows ?? []) as SaleRecord[]));
    const phantomWonIds = findPhantomWonDeals(deals, sales);

    const stages = ((stagesRes.data ?? []) as Stage[])
      .filter((s) => s.origin_id === data.originId)
      .sort((a, b) => a.stage_order - b.stage_order);
    const stageOrderById = new Map<string, number>();
    for (const s of stages) stageOrderById.set(s.id, s.stage_order);

    const inCreatedPeriod = (d: Deal) => {
      if (!d.created_at) return !start && !end;
      const dt = new Date(d.created_at);
      if (start && dt < start) return false;
      if (end && dt > end) return false;
      return true;
    };

    const filtered = deals.filter(
      (d) => (!data.originId || d.origin_id === data.originId) && inCreatedPeriod(d),
    );
    const filteredAllOrigins = deals.filter(inCreatedPeriod);

    // ── KPIs e funil (verbatim da useMemo `metrics` da rota) ──
    let won = 0;
    let lost = 0;
    let open = 0;
    let revenue = 0;
    const cycleMs: number[] = [];
    const stageReached = new Map<number, number>();
    let respondedBase = 0;
    let reuniaoAgendada = 0;
    let reuniaoRealizada = 0;
    const reuniaoAgOrder = stages.find((s) => s.type === "reuniao_agendada")?.stage_order;
    const reuniaoReOrder = stages.find((s) => s.type === "reuniao_realizada")?.stage_order;
    const baseOrder = 1;

    for (const d of filtered) {
      const winner = effectiveWinner(d);
      const excluded = isExcludedSeller(d.user_name) || (winner && isExcludedSeller(winner.name));
      if (d.status === "WON" && !phantomWonIds.has(d.id) && !excluded) {
        won += 1;
        revenue += brl(d);
        if (d.won_at && d.created_at) {
          cycleMs.push(new Date(d.won_at).getTime() - new Date(d.created_at).getTime());
        }
      } else if (d.status === "LOST") {
        lost += 1;
      } else {
        open += 1;
      }

      const order = d.stage_id ? stageOrderById.get(d.stage_id) : undefined;
      if (order !== undefined) {
        for (let i = 1; i <= order; i++) stageReached.set(i, (stageReached.get(i) ?? 0) + 1);
        if (order > baseOrder) respondedBase += 1;
        if (reuniaoAgOrder && order >= reuniaoAgOrder) reuniaoAgendada += 1;
        if (reuniaoReOrder && order >= reuniaoReOrder) reuniaoRealizada += 1;
      }
    }

    const total = filtered.length;
    const conv = conversionRate(
      deals.filter((d) => {
        if (data.originId && d.origin_id !== data.originId) return false;
        const winner = effectiveWinner(d);
        if (isExcludedSeller(d.user_name)) return false;
        if (winner && isExcludedSeller(winner.name)) return false;
        return !phantomWonIds.has(d.id);
      }),
      start,
      end,
    );

    const maxStage = stageReached.get(1) ?? 0;
    const funnelData = stages.map((s) => {
      const count = stageReached.get(s.stage_order) ?? 0;
      return { label: s.label, count, pct: maxStage > 0 ? count / maxStage : 0, type: s.type };
    });

    // ── Motivos de perda ──
    const lostLabelById = new Map<string, string>();
    for (const l of (lostRes.data ?? []) as { id: string; label: string | null }[]) {
      if (l.label) lostLabelById.set(l.id, l.label);
    }
    const lostCount = new Map<string, number>();
    for (const d of filtered) {
      if (d.status !== "LOST" || !d.lost_status_id) continue;
      lostCount.set(d.lost_status_id, (lostCount.get(d.lost_status_id) ?? 0) + 1);
    }
    const lostData = Array.from(lostCount.entries())
      .map(([id, value]) => ({
        id,
        name: lostLabelById.get(id) ?? `Motivo ${id.slice(0, 6)}`,
        unnamed: !lostLabelById.has(id),
        value,
      }))
      .sort((a, b) => b.value - a.value);

    // ── Detalhe por vendedor ──
    type Row = ComercialDashboard["sellers"][number];
    const byUser = new Map<string, Row>();

    // Leads recebidos no período (created_at), todos os funis
    for (const d of filteredAllOrigins) {
      if (!d.user_id) continue;
      const cur = byUser.get(d.user_id) ?? {
        name: cleanSellerName(d.user_name ?? d.user_email ?? "—"),
        email: d.user_email ?? "",
        leads: 0,
        won: 0,
        lost: 0,
        open: 0,
        revenue: 0,
      };
      cur.leads += 1;
      if (d.status === "OPEN") cur.open += 1;
      else if (d.status === "LOST") cur.lost += 1;
      byUser.set(d.user_id, cur);
    }

    // Ganhos do período por won_at — a venda conta no mês em que FECHOU,
    // independente de quando o lead entrou ou em qual funil.
    for (const d of deals) {
      if (d.status !== "WON" || !d.won_at || !(d.value && d.value > 0)) continue;
      if (phantomWonIds.has(d.id)) continue;
      const winner = effectiveWinner(d);
      if (!winner) continue;
      const wonDate = new Date(d.won_at);
      if (start && wonDate < start) continue;
      if (end && wonDate > end) continue;

      if (!byUser.has(winner.id)) {
        byUser.set(winner.id, {
          name: cleanSellerName(winner.name),
          email: winner.email,
          leads: 0,
          won: 0,
          lost: 0,
          open: 0,
          revenue: 0,
        });
      }
      const cur = byUser.get(winner.id)!;
      cur.won += 1;
      cur.revenue += brl(d);
    }

    const sellers = Array.from(byUser.values())
      .filter((s) => !isExcludedSeller(s.name))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      metrics: {
        total,
        won,
        lost,
        open,
        revenue,
        convRate: conv.rate,
        respRate: total > 0 ? respondedBase / total : 0,
        noShow: reuniaoAgendada > 0 ? (reuniaoAgendada - reuniaoRealizada) / reuniaoAgendada : 0,
        avgCycle: cycleMs.length ? cycleMs.reduce((a, b) => a + b, 0) / cycleMs.length : 0,
        reuniaoAgendada,
        reuniaoRealizada,
      },
      funnelData,
      lostData,
      sellers,
    };
  });
