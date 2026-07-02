import { PRODUCT_GROUPS, mapProductToGroup } from "./product-groups";

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
  faturamento_liquido_brl: number | null;
};

// Venda do Fechamento (tabela manual_sales) — EUR, confirmada ou pendente
export type ManualSaleRow = {
  id: string;
  seller_name: string;
  product: string; // nome original (ex: "Mentor Tráfego Pago 2.0 - AU")
  value_eur: number;
  sale_date: string;
  confirmation_status: string;
  confirmed_hotmart_valor_brl: number | null; // BRL real quando confirmado pelo Hotmart
};

export type ProductLine = {
  produto_grupo: string;
  label: string;
  // Hotmart BRL (por nome do afiliado)
  faturamento_hotmart: number;
  // Fechamento/EUR convertido — confirmado_hotmart usa o BRL real; pendente usa EUR×cotacao
  faturamento_fechamento: number;
  faturamento_fechamento_eur: number; // original em EUR (para exibição)
  faturamento_fechamento_confirmado: number; // quantos tinham confirmed_hotmart_valor_brl
  // bi_wise_payments (import CSV admin)
  faturamento_wise: number;
  rate_pct: number;
  manager_rate_pct: number;
  comissao_seller: number;
  comissao_manager: number;
};

export type SellerCommission = {
  sellerName: string;
  moeda: string;
  byProduct: ProductLine[];
  // Totais
  faturamento_total_brl: number;
  comissao_seller_total: number;
  comissao_manager_total: number;
  // Wise EUR (apenas para exibição)
  wise_eur: number;
  // Fechamento EUR (apenas para exibição)
  fechamento_eur: number;
  bonuses: CommissionBonus[];
  bonus_total: number;
  total_a_pagar: number;
};

export type CommissionSummary = {
  period: CommissionPeriod;
  sellers: SellerCommission[];
  manager_total_brl: number;
  manager_bonuses: CommissionBonus[];
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

  // Índice: seller+produto → rates
  const rateIndex = new Map<string, CommissionRate>();
  for (const r of rates) rateIndex.set(`${r.seller_name}||${r.produto_grupo}`, r);

  // Hotmart: filtra aprovadas no período
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

  // Wise: filtra pelo period_id
  const wiseInPeriod = wisePayments.filter((w) => w.period_id === period.id);

  // Manual (Fechamento): filtra pelo range de datas
  const manualInPeriod = manualSales.filter((m) => {
    if (!m.sale_date) return false;
    const d = new Date(m.sale_date);
    return d >= start && d <= end;
  });

  const sellerResults: SellerCommission[] = [];

  for (const sc of sellers.filter((s) => s.is_active)) {
    const sellerRates = rates.filter((r) => r.seller_name === sc.seller_name);
    // Todos os grupos de produto nos quais este vendedor tem taxa
    const productIds = [...new Set(sellerRates.map((r) => r.produto_grupo))];

    // ── Fonte 1: Hotmart por nome do afiliado ──
    const myHotmart = hotmartInPeriod.filter((s) => {
      if (!s.nome_afiliado) return false;
      return affiliateToSeller.get(s.nome_afiliado.toLowerCase()) === sc.seller_name;
    });

    // ── Fonte 2: manual_sales (Fechamento) por seller_name ──
    const myManual = manualInPeriod.filter((m) => m.seller_name === sc.seller_name);
    const fechamento_eur = myManual.reduce((s, m) => s + m.value_eur, 0);

    // ── Fonte 3: bi_wise_payments por seller_name ──
    const myWise = wiseInPeriod.filter((w) => w.seller_name === sc.seller_name);
    const wise_eur = myWise.reduce((s, w) => s + w.valor_eur, 0);

    // Agrupa manual por produto_grupo
    const manualByGroup = new Map<string, { brl: number; eur: number; confirmed: number }>();
    for (const m of myManual) {
      const pg = mapProductToGroup(m.product);
      const existing = manualByGroup.get(pg) ?? { brl: 0, eur: 0, confirmed: 0 };
      // Usa BRL real do Hotmart se confirmado, senão converte pelo câmbio do período
      const brl = m.confirmed_hotmart_valor_brl ?? m.value_eur * cotacao;
      existing.brl += brl;
      existing.eur += m.value_eur;
      if (m.confirmed_hotmart_valor_brl) existing.confirmed++;
      manualByGroup.set(pg, existing);
    }

    // Wise sem produto atribuído → soma no faturamento geral mas sem comissão por produto
    const wiseSemProduto = myWise
      .filter((w) => !w.produto_grupo)
      .reduce((s, w) => s + (w.valor_brl ?? w.valor_eur * w.cotacao_eur), 0);

    // Todos os produtos relevantes (taxa + dados reais)
    const allProductIds = new Set([
      ...productIds,
      ...Array.from(manualByGroup.keys()),
      ...myWise.filter((w) => w.produto_grupo).map((w) => w.produto_grupo!),
    ]);

    const byProduct: ProductLine[] = [];
    for (const pg of allProductIds) {
      const rate = rateIndex.get(`${sc.seller_name}||${pg}`);
      const rpct = rate?.rate_pct ?? 0;
      const mpct = rate?.manager_rate_pct ?? 0;

      const fat_hotmart = myHotmart
        .filter((s) => s.produto_grupo === pg)
        .reduce((s, sale) => s + (sale.faturamento_liquido_brl ?? 0), 0);

      const manual = manualByGroup.get(pg) ?? { brl: 0, eur: 0, confirmed: 0 };

      const fat_wise = myWise
        .filter((w) => w.produto_grupo === pg)
        .reduce((s, w) => s + (w.valor_brl ?? w.valor_eur * w.cotacao_eur), 0);

      const total_brl = fat_hotmart + manual.brl + fat_wise;
      if (total_brl === 0 && rpct === 0 && mpct === 0) continue;

      byProduct.push({
        produto_grupo: pg,
        label: getProductLabel(pg),
        faturamento_hotmart: fat_hotmart,
        faturamento_fechamento: manual.brl,
        faturamento_fechamento_eur: manual.eur,
        faturamento_fechamento_confirmado: manual.confirmed,
        faturamento_wise: fat_wise,
        rate_pct: rpct,
        manager_rate_pct: mpct,
        comissao_seller: (total_brl * rpct) / 100,
        comissao_manager: (total_brl * mpct) / 100,
      });
    }

    const sellerBonuses = bonuses.filter(
      (b) => b.period_id === period.id && b.seller_name === sc.seller_name,
    );
    const bonus_total = sellerBonuses.reduce((s, b) => s + b.valor, 0);

    const comissao_seller_total = byProduct.reduce((s, p) => s + p.comissao_seller, 0);
    const comissao_manager_total = byProduct.reduce((s, p) => s + p.comissao_manager, 0);
    const faturamento_total_brl =
      byProduct.reduce((s, p) => s + p.faturamento_hotmart + p.faturamento_fechamento + p.faturamento_wise, 0) +
      wiseSemProduto;

    sellerResults.push({
      sellerName: sc.seller_name,
      moeda: sc.moeda_padrao,
      byProduct: byProduct.sort((a, b) =>
        (b.faturamento_hotmart + b.faturamento_fechamento + b.faturamento_wise) -
        (a.faturamento_hotmart + a.faturamento_fechamento + a.faturamento_wise)
      ),
      faturamento_total_brl,
      comissao_seller_total,
      comissao_manager_total,
      wise_eur,
      fechamento_eur,
      bonuses: sellerBonuses,
      bonus_total,
      total_a_pagar: comissao_seller_total + bonus_total,
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
        (s) => s.nome_afiliado && affiliateToSeller.get(s.nome_afiliado.toLowerCase()) === sc.seller_name,
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
