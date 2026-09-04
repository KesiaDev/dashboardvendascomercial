import { eurBrlRate } from "./eur-rate";
import { isApproved } from "./sales-status";
import { PRODUCT_GROUPS, mapProductToGroup } from "./product-groups";
import { resolveSaleSeller, sellerFromAffiliate } from "./sck-attribution";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * REGRAS DE COMISSIONAMENTO (replicadas da planilha "Planilha de Comissão")
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Para cada vendedor, cada linha é um produto e tem 3 fontes de faturamento:
 *
 *   • Faturamento Hotmart → venda em que o "Nome do Afiliado" é o vendedor.
 *     A Hotmart já paga a comissão direto para ele (split). A empresa NÃO paga.
 *   • Faturamento SCK     → venda atribuída pela origem de checkout (sck).
 *     A comissão é paga PELA EMPRESA.
 *   • Faturamento Wise    → recebimento por transferência (fora da Hotmart).
 *     A comissão é paga PELA EMPRESA, sem taxa da plataforma.
 *
 * Fórmulas (validadas contra a planilha de julho/26):
 *
 *   Comissão total recebida = (Hotmart + SCK) × 0,935 × %  +  Wise × %
 *   Comissão a pagar (empresa) =  SCK × 0,935 × %  +  Wise × %  − descontos
 *
 * O fator 0,935 é o líquido depois da taxa da plataforma; o Wise entra cheio
 * porque não passa pela Hotmart.
 *
 * Além disso o vendedor recebe:
 *   • Bônus de meta semanal/mensal (ver META_LEVELS)
 *   • Prêmios da Roleta (1 giro por venda nova; renovação não gera giro)
 *   • Bônus/descontos manuais lançados no período
 */
export const TAXA_LIQUIDO_HOTMART = 0.935;

export type CommissionPeriod = {
  id: number;
  nome: string;
  data_inicio: string;
  data_fim: string;
  roleta_pool_brl: number;
  roleta_pool_eur: number;
  cotacao_eur: number; // conversão EUR→BRL do período
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

/** Ajuste manual sobre uma venda da Hotmart (observação, troca de vendedor, exclusão). */
export type SaleOverride = {
  transacao: string;
  seller_name: string | null;
  produto_grupo: string | null;
  excluir: boolean;
  observacao: string | null;
};

// Venda do Hotmart (tabela sales)
export type SaleRow = {
  transacao?: string;
  produto_grupo: string;
  produto_original?: string | null;
  status: string;
  data_venda: string | null;
  nome_afiliado: string | null;
  origem_checkout: string | null;
  nome_cliente?: string | null;
  email_cliente?: string | null;
  faturamento_liquido_brl: number | null;
  /** Valor TOTAL do produto na moeda da oferta (base de comissão da planilha). */
  preco_total?: number | null;
  moeda_original?: string | null;
  /**
   * Na Hotmart este campo é a QUANTIDADE de parcelas do parcelamento
   * (installments_number), não o índice da parcela. Cada venda é uma linha
   * única, então NÃO deve ser usado para filtrar nada.
   */
  numero_parcela?: number | null;
};

/**
 * Base de comissão de uma venda Hotmart, em BRL.
 * Usa o valor TOTAL do produto (não o líquido em USD).
 * Todas as vendas aprovadas entram — inclusive as parceladas, exatamente como
 * na planilha de comissão.
 */
export function hotmartBaseBrl(sale: SaleRow, cotacao: number): number {
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
  bonus_semanal_eur: number;
  meta_mensal_eur: number;
  super_mensal_eur: number;
  bonus_mensal_eur: number;
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
  wise_eur: number;
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

// Venda do Fechamento (tabela manual_sales) — só informativo/conferência
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

/** Nome gravado no Fechamento/Wise/Clint → seller_name canônico. */
export function canonicalSeller(name: string | null | undefined): string | null {
  if (!name) return null;
  return sellerFromAffiliate(name) ?? name;
}

export type ProductLine = {
  produto_grupo: string;
  label: string;
  /** Hotmart com o AFILIADO do vendedor — comissão paga direto pela Hotmart. */
  faturamento_hotmart: number;
  /** Hotmart atribuído por SCK — comissão paga pela EMPRESA. */
  faturamento_sck: number;
  faturamento_wise: number;
  faturamento_total: number;
  qtd_hotmart: number;
  qtd_sck: number;
  qtd_wise: number;
  rate_pct: number;
  /** Comissão sobre tudo (o que ele ganhou no mês nesse produto). */
  comissao_total: number;
  /** Parte que a Hotmart já paga direto (split de afiliado). */
  comissao_hotmart_direto: number;
  /** Parte que a EMPRESA precisa pagar (SCK + Wise). */
  comissao_a_pagar: number;
};

// Um giro de roleta = uma venda nova elegível (renovação não gera giro).
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

/** Uma venda da Hotmart já atribuída — usada na aba de conferência/observações. */
export type AttributedSaleRow = SaleRow & {
  seller: string | null;
  source: "afiliado" | "sck" | "manual" | null;
  /** Afiliado Hotmart divergente do SCK vencedor (regra: vale o link/checkout). */
  conflito_afiliado: string | null;
  base_brl: number;
  override: SaleOverride | null;
};

export type SellerCommission = {
  sellerName: string;
  moeda: string;
  byProduct: ProductLine[];
  // Faturamento
  fat_hotmart: number;
  fat_sck: number;
  fat_wise: number;
  faturamento_total_brl: number;
  // Comissões
  comissao_total: number;
  comissao_hotmart_direto: number;
  comissao_a_pagar_vendas: number;
  descontos: number;
  // Extras
  wise_eur: number;
  fechamento_eur: number;
  bonuses: CommissionBonus[];
  bonus_total: number;
  roleta_ganho_brl: number;
  roleta_ganho_eur: number;
  roleta_spins_normais: number;
  roleta_spins_wise: number;
  metas: MetaResult;
  bonus_metas_eur: number;
  bonus_metas_brl: number;
  // Auditoria SCK
  hotmart_sales_by_affiliate: number;
  hotmart_sales_by_sck: number;
  /** Total que a EMPRESA vai pagar (não inclui o split direto da Hotmart). */
  total_a_pagar: number;
};

export type CommissionSummary = {
  period: CommissionPeriod;
  sellers: SellerCommission[];
  roleta: RoletaLine[];
  /** Todas as vendas Hotmart do período já atribuídas (para conferência/ajustes). */
  vendas: AttributedSaleRow[];
};

function getProductLabel(pg: string): string {
  return PRODUCT_GROUPS.find((p) => p.id === pg)?.label ?? pg;
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
  overrides: SaleOverride[] = [],
): CommissionSummary {
  const start = new Date(`${period.data_inicio}T00:00:00`);
  const end = new Date(`${period.data_fim}T23:59:59`);
  const cotacao = eurBrlRate(period);
  const activeSellers = sellers.filter((s) => s.is_active);
  const sellerNames = new Set(activeSellers.map((s) => s.seller_name));

  const overrideIndex = new Map<string, SaleOverride>();
  for (const o of overrides) overrideIndex.set(o.transacao, o);

  const rateIndex = new Map<string, CommissionRate>();
  for (const r of rates) rateIndex.set(`${r.seller_name}||${r.produto_grupo}`, r);

  // Hotmart no período (aprovadas)
  const hotmartInPeriod = hotmartSales.filter((s) => {
    if (!s.data_venda || !isApproved(s.status)) return false;
    const d = new Date(s.data_venda);
    return d >= start && d <= end;
  });

  const affiliateToSeller = new Map<string, string>();
  for (const sc of activeSellers) {
    if (sc.hotmart_affiliate_name)
      affiliateToSeller.set(sc.hotmart_affiliate_name.toLowerCase(), sc.seller_name);
  }

  // Atribui cada venda a um vendedor (afiliado → sck → override manual)
  const vendas: AttributedSaleRow[] = hotmartInPeriod.map((s) => {
    const ov = s.transacao ? (overrideIndex.get(s.transacao) ?? null) : null;
    const auto = resolveSaleSeller(s.nome_afiliado, s.origem_checkout, affiliateToSeller);
    let seller = auto.seller;
    let source: AttributedSaleRow["source"] = auto.source;

    if (seller && !sellerNames.has(seller)) {
      seller = null;
      source = null;
    }

    if (ov?.seller_name) {
      // Venda movida manualmente para outro vendedor: a empresa paga (como SCK),
      // a não ser que o afiliado da Hotmart já seja esse mesmo vendedor.
      const affSeller = auto.source === "afiliado" ? auto.seller : null;
      seller = ov.seller_name;
      source = affSeller === ov.seller_name ? "afiliado" : "manual";
    }

    const produto_grupo = ov?.produto_grupo ?? s.produto_grupo;
    return {
      ...s,
      produto_grupo,
      seller: ov?.excluir ? null : seller,
      source: ov?.excluir ? null : source,
      conflito_afiliado: auto.conflito_afiliado,
      base_brl: hotmartBaseBrl(s, cotacao),
      override: ov,
    };
  });

  const manualInPeriod = manualSales
    .filter((m) => {
      if (!m.sale_date) return false;
      const d = new Date(`${m.sale_date}T12:00:00`);
      return d >= start && d <= end;
    })
    .map((m) => ({ ...m, seller_name: canonicalSeller(m.seller_name) ?? m.seller_name }));

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
      const d = new Date(`${w.data_pagamento}T12:00:00`);
      return d >= start && d <= end;
    })
    .map((w) => {
      const direto = canonicalSeller(w.seller_name);
      const porEmail = w.email_cliente
        ? manualByEmail.get(w.email_cliente.trim().toLowerCase())
        : undefined;
      const porNome = w.cliente ? manualByClient.get(w.cliente.trim().toLowerCase()) : undefined;
      return { ...w, seller_name: direto ?? porEmail ?? porNome ?? null };
    })
    // Inadimplente não gera comissão — o vendedor só recebe quando o cliente paga.
    .filter((w) => !w.inadimplente);

  // ── Roleta por venda ──────────────────────────────────────────────────────
  const weeks = periodWeeks(period);
  const roleta: RoletaLine[] = weeks.map((w) => ({
    week: w.week,
    label: w.label,
    spins: [],
    totalSpins: 0,
    premio_brl: 0,
    premio_eur: 0,
  }));
  const roletaBySeller = new Map<
    string,
    { brl: number; eur: number; normais: number; wise: number }
  >();

  const spinsInPeriod = roletaSpins.filter((sp) => {
    const d = new Date(`${sp.spin_date}T12:00:00`);
    return d >= start && d <= end;
  });

  for (const sp of spinsInPeriod) {
    const seller = canonicalSeller(sp.seller_name) ?? sp.seller_name;
    const brl = Number(sp.prize_value_brl ?? 0) + Number(sp.prize_value_eur ?? 0) * cotacao;
    const eur = Number(sp.prize_value_eur ?? 0) + Number(sp.prize_value_brl ?? 0) / cotacao;
    const cur = roletaBySeller.get(seller) ?? { brl: 0, eur: 0, normais: 0, wise: 0 };
    cur.brl += brl;
    cur.eur += eur;
    if (sp.source === "wise") cur.wise += 1;
    else cur.normais += 1;
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

  for (const sc of activeSellers) {
    const sellerRates = rates.filter((r) => r.seller_name === sc.seller_name);
    const productIds = [...new Set(sellerRates.map((r) => r.produto_grupo))];

    const myVendas = vendas.filter((s) => s.seller === sc.seller_name);
    const hotmart_sales_by_affiliate = myVendas.filter((s) => s.source === "afiliado").length;
    const hotmart_sales_by_sck = myVendas.filter(
      (s) => s.source === "sck" || s.source === "manual",
    ).length;

    const myManual = manualInPeriod.filter((m) => m.seller_name === sc.seller_name);
    const fechamento_eur = myManual.reduce((s, m) => s + m.value_eur, 0);

    const myWise = wiseInPeriod.filter((w) => w.seller_name === sc.seller_name);
    const wise_eur = myWise.reduce((s, w) => s + w.valor_eur, 0);

    // ── Metas (EUR): faturamento Hotmart atribuído + Wise ────────────────────
    const metaCfg = metaLevelFor(sc.seller_name);
    const eurByWeek = new Map<number, number>();
    const wiseEurByWeek = new Map<number, number>();
    const addEur = (dateStr: string | null | undefined, eur: number, isWise = false) => {
      if (!dateStr || !eur) return;
      const d = new Date(dateStr.length <= 10 ? `${dateStr}T12:00:00` : dateStr);
      const w = weeks.find((x) => d >= x.start && d <= x.end);
      if (!w) return;
      eurByWeek.set(w.week, (eurByWeek.get(w.week) ?? 0) + eur);
      if (isWise) wiseEurByWeek.set(w.week, (wiseEurByWeek.get(w.week) ?? 0) + eur);
    };
    for (const s of myVendas) addEur(s.data_venda, s.base_brl / cotacao);
    for (const w of myWise) addEur(w.data_pagamento, w.valor_eur, true);

    const metaSemanas: MetaWeekResult[] = weeks.map((w) => {
      const fat = eurByWeek.get(w.week) ?? 0;
      const bateu = fat >= metaCfg.meta_semanal_eur;
      const super_ = fat >= metaCfg.super_semanal_eur;
      return {
        week: w.week,
        label: w.label,
        faturamento_eur: fat,
        wise_eur: wiseEurByWeek.get(w.week) ?? 0,
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
      (bateuMensal ? metaCfg.bonus_mensal_eur : 0) +
      (bateuSuperMensal ? metaCfg.bonus_mensal_eur : 0);
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

    const allProductIds = new Set([
      ...productIds,
      ...myWise.filter((w) => w.produto_grupo).map((w) => w.produto_grupo!),
      ...myVendas.map((s) => s.produto_grupo),
    ]);

    // Wise sem produto identificado entra na linha "Outros"
    const wiseSemProdutoBrl = myWise
      .filter((w) => !w.produto_grupo)
      .reduce((s, w) => s + (w.valor_brl ?? w.valor_eur * w.cotacao_eur), 0);
    const wiseSemProdutoQtd = myWise.filter((w) => !w.produto_grupo).length;
    if (wiseSemProdutoBrl !== 0) allProductIds.add("outros");

    const byProduct: ProductLine[] = [];
    for (const pg of allProductIds) {
      const rpct = rateIndex.get(`${sc.seller_name}||${pg}`)?.rate_pct ?? 0;

      const linhaHotmart = myVendas.filter(
        (s) => s.produto_grupo === pg && s.source === "afiliado",
      );
      const linhaSck = myVendas.filter(
        (s) => s.produto_grupo === pg && (s.source === "sck" || s.source === "manual"),
      );
      const fat_hotmart = linhaHotmart.reduce((s, sale) => s + sale.base_brl, 0);
      const fat_sck = linhaSck.reduce((s, sale) => s + sale.base_brl, 0);

      const linhaWise = myWise.filter((w) => w.produto_grupo === pg);
      let fat_wise = linhaWise.reduce(
        (s, w) => s + (w.valor_brl ?? w.valor_eur * w.cotacao_eur),
        0,
      );
      let qtd_wise = linhaWise.length;
      if (pg === "outros") {
        fat_wise += wiseSemProdutoBrl;
        qtd_wise += wiseSemProdutoQtd;
      }

      const faturamento_total = fat_hotmart + fat_sck + fat_wise;
      if (faturamento_total === 0) continue;

      const r = rpct / 100;
      // Hotmart/SCK entram líquidos (0,935); Wise entra cheio.
      const comissao_hotmart_direto = fat_hotmart * TAXA_LIQUIDO_HOTMART * r;
      const comissao_a_pagar = fat_sck * TAXA_LIQUIDO_HOTMART * r + fat_wise * r;

      byProduct.push({
        produto_grupo: pg,
        label: getProductLabel(pg),
        faturamento_hotmart: fat_hotmart,
        faturamento_sck: fat_sck,
        faturamento_wise: fat_wise,
        faturamento_total,
        qtd_hotmart: linhaHotmart.length,
        qtd_sck: linhaSck.length,
        qtd_wise,
        rate_pct: rpct,
        comissao_total: comissao_hotmart_direto + comissao_a_pagar,
        comissao_hotmart_direto,
        comissao_a_pagar,
      });
    }

    const sellerBonuses = bonuses.filter(
      (b) => b.period_id === period.id && b.seller_name === sc.seller_name,
    );
    const toBrl = (b: CommissionBonus) =>
      (b.moeda ?? "BRL").toUpperCase() === "EUR" ? b.valor * cotacao : b.valor;
    const descontos = sellerBonuses
      .filter((b) => toBrl(b) < 0 || (b.tipo ?? "").toLowerCase().includes("desconto"))
      .reduce((s, b) => s + Math.abs(toBrl(b)), 0);
    const bonus_total = sellerBonuses
      .filter((b) => !(toBrl(b) < 0 || (b.tipo ?? "").toLowerCase().includes("desconto")))
      .reduce((s, b) => s + toBrl(b), 0);

    const fat_hotmart = byProduct.reduce((s, p) => s + p.faturamento_hotmart, 0);
    const fat_sck = byProduct.reduce((s, p) => s + p.faturamento_sck, 0);
    const fat_wise = byProduct.reduce((s, p) => s + p.faturamento_wise, 0);
    const comissao_total = byProduct.reduce((s, p) => s + p.comissao_total, 0);
    const comissao_hotmart_direto = byProduct.reduce((s, p) => s + p.comissao_hotmart_direto, 0);
    const comissao_a_pagar_vendas = byProduct.reduce((s, p) => s + p.comissao_a_pagar, 0);

    const rGanho = roletaBySeller.get(sc.seller_name) ?? {
      brl: 0,
      eur: 0,
      normais: 0,
      wise: 0,
    };

    sellerResults.push({
      sellerName: sc.seller_name,
      moeda: sc.moeda_padrao,
      byProduct: byProduct.sort((a, b) => b.faturamento_total - a.faturamento_total),
      fat_hotmart,
      fat_sck,
      fat_wise,
      faturamento_total_brl: fat_hotmart + fat_sck + fat_wise,
      comissao_total,
      comissao_hotmart_direto,
      comissao_a_pagar_vendas,
      descontos,
      wise_eur,
      fechamento_eur,
      bonuses: sellerBonuses,
      bonus_total,
      roleta_ganho_brl: rGanho.brl,
      roleta_ganho_eur: rGanho.eur,
      roleta_spins_normais: rGanho.normais,
      roleta_spins_wise: rGanho.wise,
      metas,
      bonus_metas_eur: metas.bonus_total_eur,
      bonus_metas_brl: metas.bonus_total_eur * cotacao,
      hotmart_sales_by_affiliate,
      hotmart_sales_by_sck,
      total_a_pagar:
        comissao_a_pagar_vendas +
        bonus_total -
        descontos +
        rGanho.brl +
        metas.bonus_total_eur * cotacao,
    });
  }

  return {
    period,
    sellers: sellerResults.sort((a, b) => b.total_a_pagar - a.total_a_pagar),
    roleta,
    vendas,
  };
}

// ── Semanas do período ────────────────────────────────────────────────────────

export type WeekSlot = { week: number; label: string; start: Date; end: Date };

export function periodWeeks(period: CommissionPeriod): WeekSlot[] {
  const weeks: WeekSlot[] = [];
  const periodEnd = new Date(`${period.data_fim}T23:59:59`);
  const cursor = new Date(`${period.data_inicio}T00:00:00`);
  for (let w = 1; w <= 5; w++) {
    const start = new Date(cursor);
    if (start > periodEnd) break;
    const end = new Date(cursor);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    weeks.push({ week: w, label: `S${w}`, start, end: end > periodEnd ? periodEnd : end });
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
  const start = new Date(`${period.data_inicio}T00:00:00`);
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
        (w) =>
          mySales.filter((s) => {
            const d = new Date(s.data_venda!);
            return d >= w.start && d <= w.end;
          }).length,
      );
      return {
        sellerName: sc.seller_name,
        weeks: weekCounts,
        total: weekCounts.reduce((a, b) => a + b, 0),
      };
    });
}
