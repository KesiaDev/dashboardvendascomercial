/**
 * Cotação EUR→BRL usada em CÁLCULO DE PAGAMENTO (comissão, faturamento por vendedor,
 * roleta). Fonte de verdade única.
 *
 * Antes desta consolidação existiam quatro fallbacks diferentes espalhados pelo
 * projeto — 5.85, 5.86, 6.0 e um `* 6` cru — e dois deles no mesmo arquivo:
 * `/comissionamento` exibia o card de cotação com `?? 5.85` e calculava a tabela de
 * pagamento com `?? 5.86`. Ou seja, o sistema mostrava um número e pagava outro.
 * `vendas-reais` convertia a 6.00, divergindo ~2,5% do faturamento por vendedor
 * mostrado em `/comissionamento` para as mesmas vendas.
 *
 * NÃO confundir com `DEFAULT_RATE` de `currency-context.tsx`: aquele é a cotação de
 * MERCADO usada só para exibir valores no toggle BRL/EUR da interface, atualizada de
 * uma API pública. Esta aqui é a cotação CONTRATUAL do período de comissionamento,
 * que define quanto a pessoa recebe. São conceitos diferentes e devem continuar
 * separados.
 */
export const FALLBACK_EUR_BRL = 5.85;

/** Período de comissionamento (só a parte que importa para a cotação). */
type PeriodLike = { cotacao_eur?: number | null } | null | undefined;

/**
 * Cotação do período, com fallback único.
 *
 * `bi_commission_periods.cotacao_eur` é NOT NULL com default no banco, então o
 * fallback só entra em cena quando não há período ativo selecionado.
 */
export function eurBrlRate(period?: PeriodLike): number {
  const r = Number(period?.cotacao_eur);
  return Number.isFinite(r) && r > 0 ? r : FALLBACK_EUR_BRL;
}

/** Converte BRL → EUR pela cotação do período. */
export function brlToEur(brl: number, period?: PeriodLike): number {
  return brl / eurBrlRate(period);
}

/** Converte EUR → BRL pela cotação do período. */
export function eurToBrl(eur: number, period?: PeriodLike): number {
  return eur * eurBrlRate(period);
}
