/**
 * Regras de negócio do comissionamento — calendário, bônus de meta e roleta.
 *
 * Especificação: `docs/logica-comissionamento.md` (engenharia reversa da
 * planilha, 01/09/2026), com os ajustes confirmados pela Kesia em 04/09/2026.
 *
 * Tudo aqui é função pura e testada. O cálculo em si vive em `commission.ts`;
 * este módulo guarda as REGRAS, para que mudá-las seja editar um lugar só.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. CALENDÁRIO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A semana de comissionamento vai SEMPRE de quarta-feira a terça-feira.
 *
 * O "mês" de comissionamento é um bloco de 4 ou 5 semanas inteiras qua→ter e
 * quase nunca coincide com o mês de calendário — ele termina numa terça, por
 * volta do dia 25 ao 1º.
 *
 * A exceção conhecida é agosto/2026, que começa num sábado (01/08) porque a
 * Kesia decidiu, em 04/09/2026, que as vendas de 01–04/08 pertencem a AGOSTO e
 * não a julho. Por isso a primeira semana de um período pode ser CURTA: ela vai
 * do início do período até a primeira terça-feira, e só a partir daí os blocos
 * são qua→ter completos.
 */
const TUESDAY = 2;

export type WeekSlot = { week: number; label: string; start: Date; end: Date };

/**
 * Divide um período em semanas que quebram sempre na terça-feira.
 *
 * A primeira semana vai do início do período até a primeira terça (pode ser
 * curta); as seguintes são blocos qua→ter inteiros; a última é truncada no fim
 * do período.
 *
 * A implementação anterior fatiava em blocos fixos de 7 dias a partir do início
 * do período — o que só coincidia com a semana comercial quando o período
 * começava numa quarta.
 */
export function weeksOfPeriod(dataInicio: string, dataFim: string): WeekSlot[] {
  const periodEnd = new Date(`${dataFim}T23:59:59.999`);
  const weeks: WeekSlot[] = [];
  const cursor = new Date(`${dataInicio}T00:00:00`);

  // Guarda contra período inválido (fim antes do início).
  if (cursor > periodEnd) return weeks;

  let week = 1;
  while (cursor <= periodEnd && week <= 6) {
    const start = new Date(cursor);
    const end = new Date(cursor);
    // Avança até a próxima terça (se já for terça, fecha no mesmo dia).
    while (end.getDay() !== TUESDAY) end.setDate(end.getDate() + 1);
    end.setHours(23, 59, 59, 999);

    weeks.push({
      week,
      label: `S${week}`,
      start,
      end: end > periodEnd ? periodEnd : end,
    });

    cursor.setTime(end.getTime());
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
    week += 1;
  }
  return weeks;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. BÔNUS DE META
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Faixas de bônus, iguais para TODOS os vendedores.
 *
 * Substituem o modelo N1/N3, que tinha metas diferentes por pessoa (900/1600
 * contra 1200/2100) e pagava de forma CUMULATIVA — bater a super pagava meta +
 * super. Agora é faixa única e não cumulativa: quem faz €1.700 na semana ganha
 * €60, não €90.
 *
 * Confirmado com a Kesia em 04/09/2026.
 */
export const BONUS_SEMANAL_EUR = [
  { min: 1600, bonus: 60 },
  { min: 900, bonus: 30 },
] as const;

export const BONUS_MENSAL_EUR = [
  { min: 6400, bonus: 60 },
  { min: 3200, bonus: 30 },
] as const;

/** Bônus da semana, em EUR, para um faturamento elegível. Não cumulativo. */
export function bonusSemanalEur(faturamentoEur: number): number {
  return BONUS_SEMANAL_EUR.find((f) => faturamentoEur >= f.min)?.bonus ?? 0;
}

/** Bônus do mês, em EUR, sobre o faturamento elegível do período inteiro. */
export function bonusMensalEur(faturamentoEur: number): number {
  return BONUS_MENSAL_EUR.find((f) => faturamentoEur >= f.min)?.bonus ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ELEGIBILIDADE DE PRODUTO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Produtos que geram giro de roleta.
 *
 * Da especificação: Programa Accelerator, Mentoria GTP 2.0 (e a variante - AU),
 * Formação GRS 2.0, Master and Scale, Estrategista. Renovações NÃO giram, e
 * Traffic Master não está na lista.
 */
export const ROLETA_PRODUCT_GROUPS: readonly string[] = [
  "accelerator",
  "gtp_au",
  "formacao_rs",
  "master_scale",
  "estrategista",
];

/**
 * Produtos que contam para o bônus de meta: os mesmos da roleta, mais a
 * "ACC Taxa Inicial".
 *
 * A taxa inicial do Accelerator não tem grupo próprio em `product-groups.ts` —
 * cai em "accelerator" quando o nome contém "accelerator", e em "outros" caso
 * contrário. Por isso o teste é feito também pelo NOME do produto.
 */
export const BONUS_PRODUCT_GROUPS: readonly string[] = ROLETA_PRODUCT_GROUPS;

/** A "ACC Taxa Inicial" aparece com nomes variados no export da Hotmart. */
export function isAccTaxaInicial(produtoOriginal: string | null | undefined): boolean {
  const n = (produtoOriginal ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return n.includes("taxa inicial") || (n.includes("acc") && n.includes("inicial"));
}

/** O produto conta para o bônus de meta? */
export function isBonusProduct(
  produtoGrupo: string | null | undefined,
  produtoOriginal?: string | null,
): boolean {
  if (isAccTaxaInicial(produtoOriginal)) return true;
  return BONUS_PRODUCT_GROUPS.includes(produtoGrupo ?? "");
}

/** O produto gera giro de roleta? (Taxa inicial NÃO gira — só conta para bônus.) */
export function isRoletaProduct(produtoGrupo: string | null | undefined): boolean {
  return ROLETA_PRODUCT_GROUPS.includes(produtoGrupo ?? "");
}

/**
 * A venda é uma PRIMEIRA VENDA (e não uma cobrança recorrente)?
 *
 * A especificação define primeira venda por "número da parcela ≤ 1", uma coluna
 * do export que a planilha lia. Na tabela `sales` deste projeto o conceito é
 * outro: cada transação é UMA linha, e `numero_parcela` guarda a QUANTIDADE de
 * parcelas do parcelamento (`installments_number` da API), não o índice da
 * parcela — está documentado no tipo `SaleRow` em commission.ts.
 *
 * Ou seja: uma compra em 12x é uma linha só, e filtrar por `numero_parcela <= 1`
 * eliminaria todas as vendas parceladas, que são vendas novas legítimas.
 *
 * O que de fato aparece como linha adicional ao longo do tempo são as
 * RENOVAÇÕES, que a Hotmart registra como produto próprio ("Renovação Mentoria",
 * "Renovação Accelerator"…). É esse o critério aqui.
 *
 * ⚠️ Se algum dia a ingestão passar a criar uma linha por parcela cobrada, é
 * ESTA função que muda — e só ela.
 */
export function isPrimeiraVenda(
  produtoGrupo: string | null | undefined,
  produtoOriginal?: string | null,
): boolean {
  if ((produtoGrupo ?? "").startsWith("renov_")) return false;
  const n = (produtoOriginal ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return !n.includes("renova");
}

/**
 * Valor CHEIO do produto em EUR — a base dos cortes de €200 e €1.000 da roleta.
 *
 * `preco_total` é o valor total do produto na moeda da oferta; é a mesma base
 * que `hotmartBaseBrl` usa para calcular a comissão. Quando a oferta não é em
 * euro, converte pela cotação do período.
 */
export function valorCheioEur(
  precoTotal: number | null | undefined,
  moedaOriginal: string | null | undefined,
  cotacaoEurBrl: number,
): number | null {
  const v = Number(precoTotal);
  if (!Number.isFinite(v) || v <= 0) return null;
  const moeda = (moedaOriginal ?? "EUR").toUpperCase();
  if (moeda === "EUR") return v;
  if (moeda === "BRL") return cotacaoEurBrl > 0 ? v / cotacaoEurBrl : null;
  // Outras moedas (USD…) não têm cotação cadastrada — não dá para decidir.
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ROLETA
// ─────────────────────────────────────────────────────────────────────────────

/** Valor mínimo, em EUR, do valor cheio do produto para gerar giro. */
export const ROLETA_MIN_EUR = 200;
/** A partir deste valor cheio, o giro é da roleta Y (prêmios maiores). */
export const ROLETA_WHEEL_Y_MIN_EUR = 1000;

export type RoletaWheel = "X" | "Y";

export type RoletaCandidate = {
  produto_grupo: string | null;
  /** Valor CHEIO do produto em EUR (não o valor da parcela). */
  valor_cheio_eur: number | null;
  /** É a primeira venda? Parcela recorrente e renovação não giram. */
  primeira_venda: boolean;
};

/**
 * Uma venda gera giro? Se sim, de qual roleta?
 *
 * Regra confirmada em 04/09/2026: produto principal, valor cheio ≥ €200 e
 * primeira venda. Y quando o valor cheio ≥ €1.000, senão X.
 */
export function roletaSpinFor(sale: RoletaCandidate): RoletaWheel | null {
  if (!sale.primeira_venda) return null;
  if (!isRoletaProduct(sale.produto_grupo)) return null;
  const valor = Number(sale.valor_cheio_eur);
  if (!Number.isFinite(valor) || valor < ROLETA_MIN_EUR) return null;
  return valor >= ROLETA_WHEEL_Y_MIN_EUR ? "Y" : "X";
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. COMISSÃO DE GESTORA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Percentual que a gestora recebe sobre o faturamento de cada vendedor.
 *
 * Da especificação (§7): 1% sobre tudo, 0% em renovações.
 *
 * Isto NÃO estava sendo calculado. A coluna `manager_rate_pct` existe em
 * `bi_commission_rates`, o formulário a grava como 0 e o motor de cálculo nunca
 * a lia — ou seja, a comissão de gestora simplesmente não entrava no total.
 * Confirmado com a Kesia em 04/09/2026 que a regra é a do documento.
 */
export const MANAGER_RATE_PCT = 1;
export const MANAGER_RATE_PCT_RENOVACAO = 0;

/** Percentual de gestora aplicável a um grupo de produto. */
export function managerRatePct(produtoGrupo: string | null | undefined): number {
  return (produtoGrupo ?? "").startsWith("renov_") ? MANAGER_RATE_PCT_RENOVACAO : MANAGER_RATE_PCT;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. VIGÊNCIA DE PERCENTUAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escolhe, entre as linhas de percentual de um vendedor+produto, a que estava
 * vigente numa data.
 *
 * `bi_commission_rates.effective_from` existia mas era LETRA MORTA: o cálculo
 * indexava por `vendedor||produto` e ficava com a última linha que aparecesse,
 * sem olhar data nenhuma — e a gravação chumbava "2026-01-01". Na prática havia
 * um percentual por vendedor+produto para sempre, e qualquer ajuste reescrevia
 * meses já fechados e pagos, em silêncio.
 *
 * Agora vale a linha com o maior `effective_from` que seja <= à data de
 * referência (o início do período). Assim mudar um percentual passa a valer
 * daí para a frente, sem tocar no que já foi pago.
 */
export function rateInEffect<T extends { effective_from?: string | null }>(
  rows: T[],
  on: string,
): T | null {
  const day = on.slice(0, 10);
  let best: T | null = null;
  for (const r of rows) {
    const from = (r.effective_from ?? "1970-01-01").slice(0, 10);
    if (from > day) continue;
    const bestFrom = (best?.effective_from ?? "1970-01-01").slice(0, 10);
    if (!best || from > bestFrom) best = r;
  }
  return best;
}
