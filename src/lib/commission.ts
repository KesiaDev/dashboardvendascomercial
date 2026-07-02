import { PRODUCT_GROUPS } from "./product-groups";

export type CommissionPeriod = {
  id: number;
  nome: string;
  data_inicio: string;
  data_fim: string;
  roleta_pool_brl: number;
  roleta_pool_eur: number;
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

export type SaleRow = {
  produto_grupo: string;
  status: string;
  data_venda: string | null;
  nome_afiliado: string | null;
  faturamento_liquido_brl: number | null;
};

export type SellerCommission = {
  sellerName: string;
  moeda: string;
  byProduct: {
    produto_grupo: string;
    label: string;
    faturamento: number;
    faturamento_wise: number;
    rate_pct: number;
    manager_rate_pct: number;
    comissao_seller: number;
    comissao_manager: number;
  }[];
  wise_eur: number;
  faturamento_total_brl: number;
  comissao_seller_total: number;
  comissao_manager_total: number;
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

function getProductLabel(produto_grupo: string): string {
  return PRODUCT_GROUPS.find((p) => p.id === produto_grupo)?.label ?? produto_grupo;
}

export function calculateCommissions(
  period: CommissionPeriod,
  sellers: SellerConfig[],
  rates: CommissionRate[],
  sales: SaleRow[],
  wisePayments: WisePayment[],
  bonuses: CommissionBonus[],
): CommissionSummary {
  const start = new Date(period.data_inicio);
  const end = new Date(`${period.data_fim}T23:59:59`);

  const rateIndex = new Map<string, CommissionRate>();
  for (const r of rates) rateIndex.set(`${r.seller_name}||${r.produto_grupo}`, r);

  const periodSales = sales.filter((s) => {
    if (!s.data_venda) return false;
    const st = s.status?.toLowerCase() ?? "";
    if (st !== "aprovado" && st !== "completo" && st !== "approved" && st !== "completed") return false;
    const d = new Date(s.data_venda);
    return d >= start && d <= end;
  });

  const affiliateToSeller = new Map<string, string>();
  for (const sc of sellers) {
    if (sc.hotmart_affiliate_name)
      affiliateToSeller.set(sc.hotmart_affiliate_name.toLowerCase(), sc.seller_name);
  }

  const wiseInPeriod = wisePayments.filter((w) => w.period_id === period.id);

  const sellerResults: SellerCommission[] = [];

  for (const sc of sellers.filter((s) => s.is_active)) {
    const sellerRates = rates.filter((r) => r.seller_name === sc.seller_name);
    const productIds = [...new Set(sellerRates.map((r) => r.produto_grupo))];

    const myHotmartSales = periodSales.filter((s) => {
      if (!s.nome_afiliado) return false;
      return affiliateToSeller.get(s.nome_afiliado.toLowerCase()) === sc.seller_name;
    });

    const myWise = wiseInPeriod.filter((w) => w.seller_name === sc.seller_name);
    const wise_eur = myWise.reduce((sum, w) => sum + w.valor_eur, 0);

    const byProduct = productIds.map((pg) => {
      const rate = rateIndex.get(`${sc.seller_name}||${pg}`);
      const fat_hotmart = myHotmartSales
        .filter((s) => s.produto_grupo === pg)
        .reduce((sum, s) => sum + (s.faturamento_liquido_brl ?? 0), 0);

      const fat_wise = myWise
        .filter((w) => w.produto_grupo === pg)
        .reduce((sum, w) => sum + (w.valor_brl ?? w.valor_eur * w.cotacao_eur), 0);

      const faturamento = fat_hotmart + fat_wise;
      const rpct = rate?.rate_pct ?? 0;
      const mpct = rate?.manager_rate_pct ?? 0;

      return {
        produto_grupo: pg,
        label: getProductLabel(pg),
        faturamento: fat_hotmart,
        faturamento_wise: fat_wise,
        rate_pct: rpct,
        manager_rate_pct: mpct,
        comissao_seller: (faturamento * rpct) / 100,
        comissao_manager: (faturamento * mpct) / 100,
      };
    });

    const wise_sem_produto = myWise
      .filter((w) => !w.produto_grupo)
      .reduce((sum, w) => sum + (w.valor_brl ?? w.valor_eur * w.cotacao_eur), 0);

    const sellerBonuses = bonuses.filter(
      (b) => b.period_id === period.id && b.seller_name === sc.seller_name,
    );
    const bonus_total = sellerBonuses.reduce((sum, b) => sum + b.valor, 0);

    const comissao_seller_total = byProduct.reduce((s, p) => s + p.comissao_seller, 0);
    const comissao_manager_total = byProduct.reduce((s, p) => s + p.comissao_manager, 0);
    const faturamento_total_brl =
      byProduct.reduce((s, p) => s + p.faturamento + p.faturamento_wise, 0) + wise_sem_produto;

    sellerResults.push({
      sellerName: sc.seller_name,
      moeda: sc.moeda_padrao,
      byProduct: byProduct.filter((p) => p.faturamento + p.faturamento_wise > 0 || p.comissao_seller > 0),
      wise_eur,
      faturamento_total_brl,
      comissao_seller_total,
      comissao_manager_total,
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
    if (!s.data_venda) return false;
    const st = s.status?.toLowerCase() ?? "";
    if (st !== "aprovado" && st !== "completo" && st !== "approved" && st !== "completed") return false;
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
        (w) =>
          mySales.filter((s) => {
            const d = new Date(s.data_venda!);
            return d >= w.start && d <= w.end;
          }).length,
      );
      return { sellerName: sc.seller_name, weeks: weekCounts, total: weekCounts.reduce((a, b) => a + b, 0) };
    });
}
