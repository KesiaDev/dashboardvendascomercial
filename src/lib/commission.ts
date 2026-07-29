import { PRODUCT_GROUPS, mapProductToGroup } from "./product-groups";
import { resolveSaleSeller } from "./sck-attribution";

export type CommissionPeriod = {
  id: number;
  nome: string;
  data_inicio: string;
  data_fim: string;
  roleta_pool_brl: number;
  roleta_pool_eur: number;
  cotacao_eur: number; // conversão EUR→BRL para vendas EUR pendentes de confirmação
};

export type SellerConfig = {
  seller_name: string;
  hotmart_affiliate_name: string | null;
  clint_user_name: string | null;
  moeda_padrao: string;
  is_active: boolean;
};

export type CommissionRate = {
  seller_name: string;
  produto_grupo: string;
  rate_pct: number;
  manager_rate_pct: number;
};

export type WisePayment = {
  id: number;
  data_pagamento: string;
  cliente: string;
  valor_eur: number;
  cotacao_eur: number;
  valor_brl: number | null;
  descricao: string | null;
  seller_name: string | null;
  produto_grupo: string | null;
  period_id: number | null;
  email_cliente?: string | null;
  situacao?: string | null;
  inadimplente?: boolean;
  sheet_tab?: string | null;
  source?: string | null;
  synced_at?: string | null;
};


export type CommissionBonus = {
  id: number;
  period_id: number;
  seller_name: string;
  tipo: string;
  valor: number;
  moeda: string;
  notas: string | null;
};

// Venda do Hotmart (tabela sales)
export type SaleRow = {
  produto_grupo: string;
  status: string;
  data_venda: string | null;
  nome_afiliado: string | null;
  origem_checkout: string | null;
  faturamento_liquido_brl: number | null;
  /** Valor TOTAL do produto na moeda da oferta (base de comissão da planilha). */
  preco_total?: number | null;
  moeda_original?: string | null;
  /** Só a 1ª parcela entra na base (evita contar a mesma venda 2x/3x). */
  numero_parcela?: number | null;
};

/**
 * Base de comissão de uma venda Hotmart, em BRL.
 *
 * Regra da planilha manual (validada com junho/26):
 * - usa o VALOR TOTAL do produto (não o líquido recebido, que vem em USD do Hotmart);
 * - conta só na 1ª parcela — parcelas 2/3 não geram nova comissão;
 * - valores em EUR são convertidos pela cotação do período.
 */
export function hotmartBaseBrl(sale: SaleRow, cotacao: number): number {
  const parcela = sale.numero_parcela ?? 1;
  if (parcela > 1) return 0;
  const total = sale.preco_total ?? null;
  if (total == null || total === 0) return sale.faturamento_liquido_brl ?? 0;
  const moeda = (sale.moeda_original ?? "EUR").toUpperCase();
  return moeda === "BRL" ? total : total * cotacao;
}


// Venda do Fechamento (tabela manual_sales) — EUR, confirmada ou pendente
export type ManualSaleRow = {
  id: string;
  seller_name: string;
  product: string;
  value_eur: number;
  sale_date: string;
  confirmation_status: string;
  confirmed_hotmart_valor_brl: number | null;
};

export type ProductLine = {
  produto_grupo: string;
  label: string;
  /** Hotmart com o AFILIADO do vendedor — comissão paga direto pelo Hotmart (split). */
  faturamento_hotmart: number;
  /** Hotmart atribuído por SCK — comissão paga pela EMPRESA. */
  faturamento_sck: number;
  faturamento_fechamento: number;
  faturamento_fechamento_eur: number;
  faturamento_fechamento_confirmado: number;
  faturamento_wise: number;
  rate_pct: number;
  manager_rate_pct: number;
  comissao_seller: number;
  comissao_manager: number;
  // Split: parte da comissão do vendedor que o Hotmart já paga direto
  comissao_seller_hotmart_split: number;
  // Parte que a EMPRESA precisa pagar (fechamento + wise)
  comissao_seller_a_pagar_empresa: number;
};

export type RoletaLine = {
  week: number;
  label: string;
  totalSales: number; // vendas na semana (fonte usada)
  winners: string[];  // vencedores (pode ter empate)
  valorPorGanhador_brl: number;
  valorPorGanhador_eur: number;
};

export type SellerCommission = {
  sellerName: string;
  moeda: string;
  byProduct: ProductLine[];
  // Totais
  faturamento_total_brl: number;
  comissao_seller_total: number;
  comissao_seller_hotmart_split_total: number; // paga via Hotmart
  comissao_seller_a_pagar_empresa_total: number; // paga pela empresa
  comissao_manager_total: number;
  wise_eur: number;
  fechamento_eur: number;
  bonuses: CommissionBonus[];
  bonus_total: number;
  // Roleta ganha nesta comissão
  roleta_ganho_brl: number;
  roleta_ganho_eur: number;
  // Auditoria SCK
  hotmart_sales_by_affiliate: number;
  hotmart_sales_by_sck: number;
  // Total que a empresa vai pagar (exclui o split do Hotmart)
  total_a_pagar: number;
};

export type CommissionSummary = {
  period: CommissionPeriod;
  sellers: SellerCommission[];
  manager_total_brl: number;
  manager_bonuses: CommissionBonus[];
  roleta: RoletaLine[];
};

function getProductLabel(pg: string): string {
  return PRODUCT_GROUPS.find((p) => p.id === pg)?.label ?? pg;
}

function isApproved(status: string) {
  const s = (status ?? "").toLowerCase();
  return s === "aprovado" || s === "completo" || s === "approved" || s === "completed";
}

export function calculateCommissions(
  period: CommissionPeriod,
  sellers: SellerConfig[],
  rates: CommissionRate[],
  hotmartSales: SaleRow[],
  wisePayments: WisePayment[],
  bonuses: CommissionBonus[],
  manualSales: ManualSaleRow[],
): CommissionSummary {
  const start = new Date(period.data_inicio);
  const end = new Date(`${period.data_fim}T23:59:59`);
  const cotacao = period.cotacao_eur ?? 5.85;

  const rateIndex = new Map<string, CommissionRate>();
  for (const r of rates) rateIndex.set(`${r.seller_name}||${r.produto_grupo}`, r);

  // Hotmart no período (aprovadas)
  const hotmartInPeriod = hotmartSales.filter((s) => {
    if (!s.data_venda || !isApproved(s.status)) return false;
    const d = new Date(s.data_venda);
    return d >= start && d <= end;
  });

  // Afiliado → seller canônico
  const affiliateToSeller = new Map<string, string>();
  for (const sc of sellers) {
    if (sc.hotmart_affiliate_name)
      affiliateToSeller.set(sc.hotmart_affiliate_name.toLowerCase(), sc.seller_name);
  }

  // Atribui cada venda Hotmart a um vendedor (afiliado primeiro, SCK fallback)
  type AttributedSale = SaleRow & { _seller: string | null; _source: "afiliado" | "sck" | null };
  const attributed: AttributedSale[] = hotmartInPeriod.map((s) => {
    const { seller, source } = resolveSaleSeller(s.nome_afiliado, s.origem_checkout, affiliateToSeller);
    if (source === "sck" && seller && !sellers.some((sc) => sc.seller_name === seller))
      return { ...s, _seller: null, _source: null };
    return { ...s, _seller: seller, _source: source };
  });

  const wiseInPeriod = wisePayments.filter((w) => w.period_id === period.id);

  const manualInPeriod = manualSales.filter((m) => {
    if (!m.sale_date) return false;
    const d = new Date(m.sale_date);
    return d >= start && d <= end;
  });

  // ── Roleta semanal ────────────────────────────────────────────────────────
  // Regra: vencedor da semana leva pool_semanal; empate divide;
  // semana sem vendas → pool acumula para a próxima.
  const weeks = periodWeeks(period);
  const salesCountByWeek: Record<number, Map<string, number>> = {};
  for (const w of weeks) salesCountByWeek[w.week] = new Map();

  // Conta vendas aprovadas do Hotmart (por vendedor atribuído) + manuais confirmadas
  for (const s of attributed) {
    if (!s._seller || !s.data_venda) continue;
    // Parcelas 2/3 não contam como nova venda na roleta
    if ((s.numero_parcela ?? 1) > 1) continue;
    const d = new Date(s.data_venda);
    const w = weeks.find((x) => d >= x.start && d <= x.end);
    if (!w) continue;
    const m = salesCountByWeek[w.week];
    m.set(s._seller, (m.get(s._seller) ?? 0) + 1);
  }
  for (const m of manualInPeriod) {
    const d = new Date(m.sale_date);
    const w = weeks.find((x) => d >= x.start && d <= x.end);
    if (!w) continue;
    const cnt = salesCountByWeek[w.week];
    cnt.set(m.seller_name, (cnt.get(m.seller_name) ?? 0) + 1);
  }

  const poolSemanalBrl = (period.roleta_pool_brl ?? 0) / weeks.length;
  const poolSemanalEur = (period.roleta_pool_eur ?? 0) / weeks.length;

  const roleta: RoletaLine[] = [];
  let carryBrl = 0;
  let carryEur = 0;
  const roletaBySeller = new Map<string, { brl: number; eur: number }>();

  for (const w of weeks) {
    const counts = salesCountByWeek[w.week];
    const totalSales = Array.from(counts.values()).reduce((a, b) => a + b, 0);
    const disputeBrl = poolSemanalBrl + carryBrl;
    const disputeEur = poolSemanalEur + carryEur;
    if (totalSales === 0) {
      roleta.push({ week: w.week, label: w.label, totalSales: 0, winners: [], valorPorGanhador_brl: 0, valorPorGanhador_eur: 0 });
      carryBrl = disputeBrl;
      carryEur = disputeEur;
      continue;
    }
    let max = 0;
    for (const v of counts.values()) if (v > max) max = v;
    const winners = Array.from(counts.entries()).filter(([, v]) => v === max).map(([k]) => k);
    const perBrl = winners.length > 0 ? disputeBrl / winners.length : 0;
    const perEur = winners.length > 0 ? disputeEur / winners.length : 0;
    for (const wnr of winners) {
      const cur = roletaBySeller.get(wnr) ?? { brl: 0, eur: 0 };
      cur.brl += perBrl;
      cur.eur += perEur;
      roletaBySeller.set(wnr, cur);
    }
    roleta.push({
      week: w.week,
      label: w.label,
      totalSales,
      winners,
      valorPorGanhador_brl: perBrl,
      valorPorGanhador_eur: perEur,
    });
    carryBrl = 0;
    carryEur = 0;
  }

  // ── Por vendedor ──────────────────────────────────────────────────────────
  const sellerResults: SellerCommission[] = [];

  for (const sc of sellers.filter((s) => s.is_active)) {
    const sellerRates = rates.filter((r) => r.seller_name === sc.seller_name);
    const productIds = [...new Set(sellerRates.map((r) => r.produto_grupo))];

    // Hotmart atribuído a este vendedor
    const myHotmart = attributed.filter((s) => s._seller === sc.seller_name);
    const hotmart_sales_by_affiliate = myHotmart.filter((s) => s._source === "afiliado").length;
    const hotmart_sales_by_sck = myHotmart.filter((s) => s._source === "sck").length;

    const myManual = manualInPeriod.filter((m) => m.seller_name === sc.seller_name);
    const fechamento_eur = myManual.reduce((s, m) => s + m.value_eur, 0);

    const myWise = wiseInPeriod.filter((w) => w.seller_name === sc.seller_name);
    const wise_eur = myWise.reduce((s, w) => s + w.valor_eur, 0);

    const manualByGroup = new Map<string, { brl: number; eur: number; confirmed: number }>();
    for (const m of myManual) {
      const pg = mapProductToGroup(m.product);
      const existing = manualByGroup.get(pg) ?? { brl: 0, eur: 0, confirmed: 0 };
      const brl = m.confirmed_hotmart_valor_brl ?? m.value_eur * cotacao;
      existing.brl += brl;
      existing.eur += m.value_eur;
      if (m.confirmed_hotmart_valor_brl) existing.confirmed++;
      manualByGroup.set(pg, existing);
    }

    const wiseSemProduto = myWise
      .filter((w) => !w.produto_grupo)
      .reduce((s, w) => s + (w.valor_brl ?? w.valor_eur * w.cotacao_eur), 0);

    const allProductIds = new Set([
      ...productIds,
      ...Array.from(manualByGroup.keys()),
      ...myWise.filter((w) => w.produto_grupo).map((w) => w.produto_grupo!),
      ...myHotmart.map((s) => s.produto_grupo),
    ]);

    const byProduct: ProductLine[] = [];
    for (const pg of allProductIds) {
      const rate = rateIndex.get(`${sc.seller_name}||${pg}`);
      const rpct = rate?.rate_pct ?? 0;
      const mpct = rate?.manager_rate_pct ?? 0;

      // Base = valor total do produto (1ª parcela), como na planilha manual.
      const fat_hotmart = myHotmart
        .filter((s) => s.produto_grupo === pg && s._source === "afiliado")
        .reduce((s, sale) => s + hotmartBaseBrl(sale, cotacao), 0);

      const fat_sck = myHotmart
        .filter((s) => s.produto_grupo === pg && s._source === "sck")
        .reduce((s, sale) => s + hotmartBaseBrl(sale, cotacao), 0);

      const manual = manualByGroup.get(pg) ?? { brl: 0, eur: 0, confirmed: 0 };

      const fat_wise = myWise
        .filter((w) => w.produto_grupo === pg)
        .reduce((s, w) => s + (w.valor_brl ?? w.valor_eur * w.cotacao_eur), 0);

      const total_brl = fat_hotmart + fat_sck + manual.brl + fat_wise;
      if (total_brl === 0 && rpct === 0 && mpct === 0) continue;

      const comissao_seller = (total_brl * rpct) / 100;
      // Split: só a venda com AFILIADO do vendedor é paga direto pelo Hotmart.
      // SCK, Fechamento e Wise a EMPRESA paga.
      const comissao_seller_hotmart_split = (fat_hotmart * rpct) / 100;
      const comissao_seller_a_pagar_empresa = comissao_seller - comissao_seller_hotmart_split;

      byProduct.push({
        produto_grupo: pg,
        label: getProductLabel(pg),
        faturamento_hotmart: fat_hotmart,
        faturamento_sck: fat_sck,
        faturamento_fechamento: manual.brl,
        faturamento_fechamento_eur: manual.eur,
        faturamento_fechamento_confirmado: manual.confirmed,
        faturamento_wise: fat_wise,
        rate_pct: rpct,
        manager_rate_pct: mpct,
        comissao_seller,
        comissao_manager: (total_brl * mpct) / 100,
        comissao_seller_hotmart_split,
        comissao_seller_a_pagar_empresa,
      });
    }


    const sellerBonuses = bonuses.filter(
      (b) => b.period_id === period.id && b.seller_name === sc.seller_name,
    );
    const bonus_total = sellerBonuses.reduce((s, b) => s + b.valor, 0);

    const comissao_seller_total = byProduct.reduce((s, p) => s + p.comissao_seller, 0);
    const comissao_seller_hotmart_split_total = byProduct.reduce((s, p) => s + p.comissao_seller_hotmart_split, 0);
    const comissao_seller_a_pagar_empresa_total = byProduct.reduce((s, p) => s + p.comissao_seller_a_pagar_empresa, 0);
    const comissao_manager_total = byProduct.reduce((s, p) => s + p.comissao_manager, 0);

    const fatLine = (p: ProductLine) =>
      p.faturamento_hotmart + p.faturamento_sck + p.faturamento_fechamento + p.faturamento_wise;

    const faturamento_total_brl =
      byProduct.reduce((s, p) => s + fatLine(p), 0) + wiseSemProduto;

    const rGanho = roletaBySeller.get(sc.seller_name) ?? { brl: 0, eur: 0 };

    sellerResults.push({
      sellerName: sc.seller_name,
      moeda: sc.moeda_padrao,
      byProduct: byProduct.sort((a, b) => fatLine(b) - fatLine(a)),

      faturamento_total_brl,
      comissao_seller_total,
      comissao_seller_hotmart_split_total,
      comissao_seller_a_pagar_empresa_total,
      comissao_manager_total,
      wise_eur,
      fechamento_eur,
      bonuses: sellerBonuses,
      bonus_total,
      roleta_ganho_brl: rGanho.brl,
      roleta_ganho_eur: rGanho.eur,
      hotmart_sales_by_affiliate,
      hotmart_sales_by_sck,
      // A empresa paga: (comissão sobre fechamento+wise) + bônus + roleta
      total_a_pagar: comissao_seller_a_pagar_empresa_total + bonus_total + rGanho.brl,
    });
  }

  const manager_total_brl = sellerResults.reduce((s, r) => s + r.comissao_manager_total, 0);
  const manager_bonuses = bonuses.filter(
    (b) => b.period_id === period.id && b.seller_name === "Késia",
  );

  return {
    period,
    sellers: sellerResults.sort((a, b) => b.comissao_seller_total - a.comissao_seller_total),
    manager_total_brl,
    manager_bonuses,
    roleta,
  };
}

// ── Roleta: semanas do período ────────────────────────────────────────────────

export type WeekSlot = { week: number; label: string; start: Date; end: Date };

export function periodWeeks(period: CommissionPeriod): WeekSlot[] {
  const weeks: WeekSlot[] = [];
  let cursor = new Date(period.data_inicio);
  for (let w = 1; w <= 5; w++) {
    const start = new Date(cursor);
    const end = new Date(cursor);
    end.setDate(end.getDate() + 6);
    weeks.push({ week: w, label: `S${w}`, start, end });
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

export function countSalesBySellerWeek(
  period: CommissionPeriod,
  sellers: SellerConfig[],
  sales: SaleRow[],
): { sellerName: string; weeks: number[]; total: number }[] {
  const weeks = periodWeeks(period);
  const start = new Date(period.data_inicio);
  const end = new Date(`${period.data_fim}T23:59:59`);

  const periodSales = sales.filter((s) => {
    if (!s.data_venda || !isApproved(s.status)) return false;
    const d = new Date(s.data_venda);
    return d >= start && d <= end;
  });

  const affiliateToSeller = new Map<string, string>();
  for (const sc of sellers) {
    if (sc.hotmart_affiliate_name)
      affiliateToSeller.set(sc.hotmart_affiliate_name.toLowerCase(), sc.seller_name);
  }

  return sellers
    .filter((s) => s.is_active)
    .map((sc) => {
      const mySales = periodSales.filter(
        (s) =>
          resolveSaleSeller(s.nome_afiliado, s.origem_checkout, affiliateToSeller).seller ===
          sc.seller_name,
      );
      const weekCounts = weeks.map(
        (w) => mySales.filter((s) => {
          const d = new Date(s.data_venda!);
          return d >= w.start && d <= w.end;
        }).length,
      );
      return { sellerName: sc.seller_name, weeks: weekCounts, total: weekCounts.reduce((a, b) => a + b, 0) };
    });
}
