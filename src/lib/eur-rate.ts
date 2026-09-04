/**
 * Cotação EUR→BRL do período de comissionamento.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NÃO EXISTE FALLBACK. Isto é deliberado.
 *
 * Antes havia quatro cotações fixas espalhadas pelo código (5.85, 5.86, 6.0 e um
 * `* 6` cru) — duas delas no mesmo arquivo, o que fazia `/comissionamento` exibir
 * R$ 5,85 no card e pagar R$ 5,86 na tabela. A consolidação de 03/09 juntou tudo
 * num fallback único; a regra definida em 04/09 foi além e removeu o fallback:
 *
 *   toda conversão EUR→BRL usa EXCLUSIVAMENTE `bi_commission_periods.cotacao_eur`
 *   do período; sem cotação cadastrada, a tela avisa em vez de calcular.
 *
 * O motivo é simples: um número de pagamento errado é pior que um número
 * ausente. Com fallback, ninguém percebe que a cotação do mês não foi cadastrada
 * — o valor sai plausível e errado. Sem fallback, a tela diz o que falta.
 *
 * NÃO confundir com `DEFAULT_RATE` de `currency-context.tsx`: aquele é a cotação
 * de MERCADO, usada só para exibir valores no toggle BRL/EUR da interface,
 * atualizada de uma API pública. Esta aqui é a cotação CONTRATUAL do período,
 * que define quanto a pessoa recebe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Período de comissionamento (só a parte que importa para a cotação). */
type PeriodLike = { cotacao_eur?: number | null } | null | undefined;

/**
 * Cotação do período, ou `null` se não houver uma válida cadastrada.
 *
 * Quem exibe valores deve tratar o `null` mostrando um aviso — ver
 * `RATE_MISSING_MESSAGE`.
 */
export function eurBrlRate(period?: PeriodLike): number | null {
  const r = Number(period?.cotacao_eur);
  return Number.isFinite(r) && r > 0 ? r : null;
}

/** Mensagem única para quando o período está sem cotação. */
export const RATE_MISSING_MESSAGE =
  "Cotação EUR→BRL não cadastrada neste período. Defina a cotação do mês para que os valores em euro possam ser convertidos.";

/**
 * Cotação do período, lançando erro se não houver.
 *
 * Use no SERVIDOR, onde não há como exibir aviso e prosseguir com número errado
 * seria pior que falhar. Na interface, prefira `eurBrlRate` + aviso.
 */
export function requireEurBrlRate(period?: PeriodLike): number {
  const r = eurBrlRate(period);
  if (r === null) throw new Error(RATE_MISSING_MESSAGE);
  return r;
}

/** Converte BRL → EUR pela cotação do período. `null` se não houver cotação. */
export function brlToEur(brl: number, period?: PeriodLike): number | null {
  const r = eurBrlRate(period);
  return r === null ? null : brl / r;
}

/** Converte EUR → BRL pela cotação do período. `null` se não houver cotação. */
export function eurToBrl(eur: number, period?: PeriodLike): number | null {
  const r = eurBrlRate(period);
  return r === null ? null : eur * r;
}
