import { PRODUCT_GROUPS, mapProductToGroup } from "./product-groups";
import { resolveSaleSeller, sellerFromAffiliate } from "./sck-attribution";

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

// ── Metas de faturamento (EUR) por nível ─────────────────────────────────────
// N1: Luana · N3: Gisele, Rita, João, Nadal (padrão para novos vendedores)
// Bônus é cumulativo: bater a super meta paga meta + super meta.
export type MetaLevelConfig = {
  level: "N1" | "N3";
  meta_semanal_eur: number;
  super_semanal_eur: number;
  bonus_semanal_eur: number; // por faixa atingida
  meta_mensal_eur: number;
  super_mensal_eur: number;
  bonus_mensal_eur: number; // por faixa atingida
};

export const META_LEVELS: Record<"N1" | "N3", MetaLevelConfig> = {
  N1: {
    level: "N1",
    meta_semanal_eur: 900,
    super_semanal_eur: 1600,
    bonus_semanal_eur: 25,
    meta_mensal_eur: 3600,
    super_mensal_eur: 6400,
    bonus_mensal_eur: 25,
  },
  N3: {
    level: "N3",
    meta_semanal_eur: 1200,
    super_semanal_eur: 2100,
    bonus_semanal_eur: 30,
    meta_mensal_eur: 4800,
    super_mensal_eur: 8400,
    bonus_mensal_eur: 30,
  },
};

const META_N1_SELLERS = ["luana"];

export function metaLevelFor(sellerName: string): MetaLevelConfig {
  const n = (sellerName ?? "").trim().toLowerCase();
  return META_N1_SELLERS.some((s) => n.includes(s)) ? META_LEVELS.N1 : META_LEVELS.N3;
}

export type MetaWeekResult = {
  week: number;
  label: string;
  faturamento_eur: number;
  bateu_meta: boolean;
  bateu_super: boolean;
  bonus_eur: number;
};

export type MetaResult = {
  level: "N1" | "N3";
  config: MetaLevelConfig;
  semanas: MetaWeekResult[];
  bonus_semanal_total_eur: number;
  faturamento_mensal_eur: number;
  bateu_meta_mensal: boolean;
  bateu_super_mensal: boolean;
  bonus_mensal_eur: number;
  bonus_total_eur: number;
};




// Venda do Fechamento (tabela manual_sales) — EUR, confirmada ou pendente
export type ManualSaleRow = {
  id: string;
  seller_name: string;
  product: string;
  value_eur: number;
  sale_date: string;
  confirmation_status: string;
  confirmed_hotmart_valor_brl: number | null;
  client_email?: string | null;
  client_name?: string | null;
};

/**
 * Nome do vendedor gravado no Fechamento/Wise/Clint ("Gisele Pimentel",
 * "João Pessoa", "FABIO NADAL...") → seller_name canônico do bi_seller_config.
 */
export function canonicalSeller(name: string | null | undefined): string | null {
  if (!name) return null;
  return sellerFromAffiliate(name) ?? name;
}


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

// Um giro de roleta = uma venda nova elegível (renovação não gera giro).
// Mentoria e Accelerator são roletas distintas, com prêmios distintos.
export type RoletaSpin = {
  id: string;
  period_id: number | null;
  seller_name: string;
  spin_date: string;
  wheel: string; // "mentoria" | "accelerator"
  source: string; // fechamento | hotmart | wise | manual
  source_sale_id: string | null;
  client_name: string | null;
  product: string | null;
  prize_label: string | null;
  prize_value_eur: number;
  prize_value_brl: number;
  status: string; // pendente | girada
  notes: string | null;
};

export type RoletaLine = {
  week: number;
  label: string;
  spins: RoletaSpin[];
  totalSpins: number;
  premio_brl: number;
  premio_eur: number;
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
  // Metas de faturamento (bônus automáticos)
  metas: MetaResult;
  bonus_metas_eur: number;
  bonus_metas_brl: number;
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
  roletaSpins: RoletaSpin[] = [],
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

  const manualInPeriod = manualSales
    .filter((m) => {
      if (!m.sale_date) return false;
      const d = new Date(m.sale_date);
      return d >= start && d <= end;
    })
    // normaliza "Gisele Pimentel" → "Gisele" para casar com bi_seller_config
    .map((m) => ({ ...m, seller_name: canonicalSeller(m.seller_name) ?? m.seller_name }));

  // Wise: entra pelo period_id OU pela data de pagamento dentro do período.
  // Quando a planilha não traz o vendedor, tentamos casar pelo e-mail/nome do
  // cliente com o Fechamento do mesmo período.
  const manualByEmail = new Map<string, string>();
  const manualByClient = new Map<string, string>();
  for (const m of manualInPeriod) {
    if (m.client_email) manualByEmail.set(m.client_email.trim().toLowerCase(), m.seller_name);
    if (m.client_name) manualByClient.set(m.client_name.trim().toLowerCase(), m.seller_name);
  }

  const wiseInPeriod = wisePayments
    .filter((w) => {
      if (w.period_id === period.id) return true;
      if (w.period_id != null) return false;
      if (!w.data_pagamento) return false;
      const d = new Date(w.data_pagamento);
      return d >= start && d <= end;
    })
    .map((w) => {
      const direto = canonicalSeller(w.seller_name);
      const porEmail = w.email_cliente ? manualByEmail.get(w.email_cliente.trim().toLowerCase()) : undefined;
      const porNome = w.cliente ? manualByClient.get(w.cliente.trim().toLowerCase()) : undefined;
      return { ...w, seller_name: direto ?? porEmail ?? porNome ?? null };
    })
    // Inadimplente não gera comissão — o vendedor só recebe quando o cliente paga.
    .filter((w) => !w.inadimplente);


  // ── Roleta por venda ──────────────────────────────────────────────────────
  // Cada venda nova elegível gera 1 giro (renovação não gera).
  // O prêmio é o que saiu na roleta (Mentoria e Accelerator têm prêmios
  // diferentes) e é lançado/editado manualmente em cada giro.
  const weeks = periodWeeks(period);
  const roleta: RoletaLine[] = weeks.map((w) => ({
    week: w.week,
    label: w.label,
    spins: [],
    totalSpins: 0,
    premio_brl: 0,
    premio_eur: 0,
  }));
  const roletaBySeller = new Map<string, { brl: number; eur: number }>();

  const spinsInPeriod = roletaSpins.filter((sp) => {
    const d = new Date(`${sp.spin_date}T12:00:00`);
    return d >= start && d <= end;
  });

  for (const sp of spinsInPeriod) {
    const seller = canonicalSeller(sp.seller_name) ?? sp.seller_name;
    const brl = Number(sp.prize_value_brl ?? 0) + Number(sp.prize_value_eur ?? 0) * cotacao;
    const eur = Number(sp.prize_value_eur ?? 0) + Number(sp.prize_value_brl ?? 0) / cotacao;
    const cur = roletaBySeller.get(seller) ?? { brl: 0, eur: 0 };
    cur.brl += brl;
    cur.eur += eur;
    roletaBySeller.set(seller, cur);

    const d = new Date(`${sp.spin_date}T12:00:00`);
    const wk = weeks.find((x) => d >= x.start && d <= x.end);
    const line = wk ? roleta.find((r) => r.week === wk.week) : undefined;
    if (line) {
      line.spins.push({ ...sp, seller_name: seller });
      line.totalSpins += 1;
      line.premio_brl += brl;
      line.premio_eur += eur;
    }
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

    // ── Metas de faturamento (EUR) por semana comercial e no mês ────────────
    const metaCfg = metaLevelFor(sc.seller_name);
    const eurByWeek = new Map<number, number>();
    const addEur = (dateStr: string | null | undefined, eur: number) => {
      if (!dateStr || !eur) return;
      const d = new Date(dateStr);
      const w = weeks.find((x) => d >= x.start && d <= x.end);
      if (!w) return;
      eurByWeek.set(w.week, (eurByWeek.get(w.week) ?? 0) + eur);
    };
    for (const s of myHotmart) addEur(s.data_venda, hotmartBaseBrl(s, cotacao) / cotacao);
    for (const m of myManual) addEur(m.sale_date, m.value_eur);
    for (const w of myWise) addEur(w.data_pagamento, w.valor_eur);

    const metaSemanas: MetaWeekResult[] = weeks.map((w) => {
      const fat = eurByWeek.get(w.week) ?? 0;
      const bateu = fat >= metaCfg.meta_semanal_eur;
      const super_ = fat >= metaCfg.super_semanal_eur;
      return {
        week: w.week,
        label: w.label,
        faturamento_eur: fat,
        bateu_meta: bateu,
        bateu_super: super_,
        bonus_eur:
          (bateu ? metaCfg.bonus_semanal_eur : 0) + (super_ ? metaCfg.bonus_semanal_eur : 0),
      };
    });
    const faturamento_mensal_eur = metaSemanas.reduce((s, w) => s + w.faturamento_eur, 0);
    const bateuMensal = faturamento_mensal_eur >= metaCfg.meta_mensal_eur;
    const bateuSuperMensal = faturamento_mensal_eur >= metaCfg.super_mensal_eur;
    const bonusMensalEur =
      (bateuMensal ? metaCfg.bonus_mensal_eur : 0) + (bateuSuperMensal ? metaCfg.bonus_mensal_eur : 0);
    const bonusSemanalTotalEur = metaSemanas.reduce((s, w) => s + w.bonus_eur, 0);

    const metas: MetaResult = {
      level: metaCfg.level,
      config: metaCfg,
      semanas: metaSemanas,
      bonus_semanal_total_eur: bonusSemanalTotalEur,
      faturamento_mensal_eur,
      bateu_meta_mensal: bateuMensal,
      bateu_super_mensal: bateuSuperMensal,
      bonus_mensal_eur: bonusMensalEur,
      bonus_total_eur: bonusSemanalTotalEur + bonusMensalEur,
    };


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
      metas,
      bonus_metas_eur: metas.bonus_total_eur,
      bonus_metas_brl: metas.bonus_total_eur * cotacao,
      hotmart_sales_by_affiliate,
      hotmart_sales_by_sck,
      // A empresa paga: (comissão sobre fechamento+wise) + bônus + roleta + metas
      total_a_pagar:
        comissao_seller_a_pagar_empresa_total +
        bonus_total +
        rGanho.brl +
        metas.bonus_total_eur * cotacao,

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
