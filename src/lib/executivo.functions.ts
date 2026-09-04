import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/supabase-paging";
import {
  buildAreaMap,
  compareMetaRealizado,
  computeAreaKpis,
  filterDealsByArea,
  findPhantomWonDeals,
  rankSellers,
  type AreaKpis,
  type ChannelComparison,
  type Deal,
  type SaleRecord,
  type SellerStats,
} from "@/lib/bi";
import { AREA_ORDER, type BusinessArea } from "@/lib/pipeline-areas";

/**
 * KPIs de /executivo, agregados NO SERVIDOR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE MUDA
 *
 * A tela baixava `clint_deals` e `sales` INTEIRAS para o navegador — cerca de
 * 43 MB de JSON — e depois varria os mesmos arrays ~18 vezes na main thread
 * (uma vez por área, duas funções cada), alocando centenas de milhares de
 * objetos Date por render. Ainda por cima, quando a cotação chegava da API de
 * câmbio, tudo era refeito do zero.
 *
 * Agora a leitura acontece dentro do datacenter, ao lado do banco, e o que
 * atravessa a internet são ~15 linhas de resultado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE NÃO UMA RPC EM SQL
 *
 * Seria mais rápido ainda, mas exigiria reescrever em PL/pgSQL: as janelas de
 * vigência de cada vendedor, a exclusão da equipe interna, a detecção de
 * ganhos-fantasma, a coorte de fechamento da conversão e o mapeamento de área.
 * Ou seja, uma SEGUNDA implementação das mesmas regras — exatamente o que a
 * auditoria de 2026-09-03 encontrou espalhado por sete arquivos e que este
 * trabalho existiu para eliminar. As duas versões divergiriam no primeiro ajuste
 * que alguém fizesse só de um lado.
 *
 * Aqui as funções são as MESMAS de `bi.ts`, chamadas do servidor. O resultado é
 * idêntico por construção.
 *
 * O passo seguinte, quando fizer sentido, é uma tabela materializada
 * (`bi_deals_daily`) alimentada pelo cron — aí o cálculo continua em um lugar
 * só, e a leitura vira instantânea.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MOEDA
 *
 * O resultado sai sempre em BRL e o cliente converte para EUR com a cotação de
 * mercado dele. Como a conversão é linear, converter cada negócio e somar dá o
 * mesmo que somar e converter — e assim trocar a moeda no toggle deixa de
 * disparar refetch e recálculo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const DEAL_COLS =
  "id,user_id,user_name,user_email,won_by_user_id,won_by_name,won_by_email,contact_email,status,value,currency,created_at,won_at,lost_at,lost_status_id,stage,stage_id,origin_id,origin_name";

const SALE_COLS = "email_cliente,data_venda,status,produto_original";

export type ExecutivoDashboard = {
  kpis: AreaKpis;
  sellers: SellerStats[];
  byArea: ({ area: BusinessArea } & AreaKpis)[];
  metaComparison: ChannelComparison[];
  /** Ganhos descontados do faturamento por a venda não ter sido aprovada. */
  phantomWonCount: number;
  /** Quantas linhas o servidor leu, para diagnóstico. */
  dealsLidos: number;
};

export const fetchExecutivoDashboardFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from: string | null; to: string | null; area: BusinessArea }) => d)
  .handler(async ({ data }): Promise<ExecutivoDashboard> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const start = data.from ? new Date(data.from) : null;
    const end = data.to ? new Date(data.to) : null;

    // Um negócio entra no cálculo se QUALQUER uma das três datas cai no período:
    // `created_at` alimenta leads e em-aberto, `won_at` os ganhos, `lost_at` os
    // perdidos (a conversão usa a coorte de fechamento). Filtrar só por
    // created_at deixaria de fora um negócio de julho fechado em setembro.
    const periodFilter = <Q>(q: Q) => {
      if (!data.from || !data.to) return q as any;
      const a = `${data.from}`;
      const b = `${data.to}`;
      return (q as any).or(
        `and(created_at.gte.${a},created_at.lte.${b}),` +
          `and(won_at.gte.${a},won_at.lte.${b}),` +
          `and(lost_at.gte.${a},lost_at.lte.${b})`,
      );
    };

    const [deals, pipelineAreas, origins, channels, targets] = await Promise.all([
      fetchAllRows<Deal>(
        ({ from, to }) => periodFilter(db.from("clint_deals").select(DEAL_COLS)).range(from, to),
        () => periodFilter(db.from("clint_deals").select("*", { count: "exact", head: true })),
      ),
      // Tabelas de configuração: pequenas por natureza, mas com teto explícito.
      db.from("bi_pipeline_areas").select("*").limit(2000),
      db.from("clint_origins").select("*").limit(2000),
      db.from("bi_channels").select("*").limit(500),
      db.from("bi_targets").select("*").limit(5000),
    ]);

    // Ganhos-fantasma: um negócio marcado como ganho na Clint cuja venda
    // correspondente na Hotmart não foi aprovada. A função casa pelo e-mail do
    // contato e pela venda de data mais próxima — então precisamos de TODAS as
    // vendas desses e-mails, não só as do período: a venda mais próxima de um
    // ganho de 1º de setembro pode ser de 28 de agosto.
    //
    // Buscar por e-mail (em vez da tabela inteira) dá exatamente o mesmo
    // resultado com uma fração das linhas.
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
          // Um cliente pode ter várias compras ao longo do tempo.
          .limit(c.length * 50),
      ),
    );
    const sales: SaleRecord[] = [];
    for (const { data: rows } of salePages) sales.push(...((rows ?? []) as SaleRecord[]));

    const areaMap = buildAreaMap((pipelineAreas.data ?? []) as any[]);
    const phantomWonIds = findPhantomWonDeals(deals, sales);
    const dealsInArea = filterDealsByArea(deals, areaMap, data.area);

    // "BRL" fixo e taxa 1: o cliente converte. Ver a nota sobre moeda acima.
    const kpis = computeAreaKpis(dealsInArea, start, end, "BRL", 1, phantomWonIds);
    const sellers = rankSellers(dealsInArea, start, end, "BRL", 1, phantomWonIds);

    const byArea = AREA_ORDER.filter((a) => a !== "TESTES" && a !== "OUTROS").map((a) => ({
      area: a,
      ...computeAreaKpis(filterDealsByArea(deals, areaMap, a), start, end, "BRL", 1, phantomWonIds),
    }));

    const metaComparison = compareMetaRealizado(
      deals,
      (origins.data ?? []) as any[],
      (channels.data ?? []) as any[],
      (targets.data ?? []) as any[],
      start,
      end,
    );

    return {
      kpis,
      sellers,
      byArea,
      metaComparison,
      phantomWonCount: phantomWonIds.size,
      dealsLidos: deals.length,
    };
  });
