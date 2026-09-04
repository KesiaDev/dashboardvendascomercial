/**
 * Taxa de conversão — fonte de verdade única.
 *
 * Existiam CINCO fórmulas diferentes (`bi.ts`, `_app.comercial.tsx`,
 * `_app.funis.tsx`, `data.functions.ts` e `metas-funil.tsx`), e a de `bi.ts` —
 * que alimenta /executivo — misturava duas janelas de tempo:
 *
 *     perdidos contados por created_at   ← quando o lead ENTROU
 *     ganhos   contados por won_at       ← quando o negócio FECHOU
 *     convRate = ganhos / (ganhos + perdidos)
 *
 * Isso é uma razão entre duas coortes diferentes. Num mês com ciclo de venda
 * longo, /executivo e /comercial divergiam estruturalmente para o mesmo período
 * — a diretoria via um número e o comercial via outro, e nenhum dos dois estava
 * definido.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEFINIÇÃO OFICIAL, confirmada com a Kesia em 2026-09-03:
 *
 *     conversão(período) = ganhos / (ganhos + perdidos)
 *
 * com AMBOS contados pela DATA DE FECHAMENTO — ganhos por `won_at`, perdidos
 * por `lost_at`. Responde "do que fechou neste mês, quanto virou venda?".
 *
 * Consequências desta escolha, para quem for ler o número:
 *   • É a taxa de fechamento da EQUIPE, não a qualidade do lead.
 *   • Negócios ainda em aberto não entram no denominador.
 *   • O número estabiliza quando o mês acaba e não muda mais depois.
 *
 * Para medir qualidade de lead ou de campanha, o correto é a coorte de criação
 * (`cohort: "created"`), que é uma pergunta diferente e não deve ser comparada
 * com esta.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ConversionDeal = {
  status: string | null;
  created_at?: string | null;
  won_at?: string | null;
  lost_at?: string | null;
};

export type ConversionCohort = "closed" | "created";

export type ConversionResult = {
  won: number;
  lost: number;
  /** Ganhos + perdidos. É o denominador na coorte de fechamento. */
  closed: number;
  /** Em aberto no período — só preenchido na coorte de criação. */
  open: number;
  /** Denominador efetivamente usado, explícito para conferência. */
  denominator: number;
  /** 0 a 1. Zero quando não há denominador — nunca NaN. */
  rate: number;
  cohort: ConversionCohort;
};

function inWindow(iso: string | null | undefined, start: Date | null, end: Date | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (start && t < start.getTime()) return false;
  if (end && t > end.getTime()) return false;
  return true;
}

/**
 * Taxa de conversão de um conjunto de negócios num período.
 *
 * @param deals   negócios já filtrados por área/origem/vendedor
 * @param start   início do período (inclusive), ou null para sem limite
 * @param end     fim do período (inclusive), ou null para sem limite
 * @param cohort  "closed" (padrão, definição oficial) ou "created"
 *
 * Na coorte "closed", um negócio ganho sem `won_at` — ou perdido sem `lost_at` —
 * não pode ser datado e portanto não entra em nenhum período. Isso é
 * intencional: melhor faltar do que cair no mês errado.
 */
export function conversionRate(
  deals: ConversionDeal[],
  start: Date | null,
  end: Date | null,
  cohort: ConversionCohort = "closed",
): ConversionResult {
  let won = 0;
  let lost = 0;
  let open = 0;

  for (const d of deals) {
    const status = (d.status ?? "").toUpperCase();
    if (cohort === "closed") {
      if (status === "WON" && inWindow(d.won_at, start, end)) won += 1;
      else if (status === "LOST" && inWindow(d.lost_at, start, end)) lost += 1;
      continue;
    }
    // coorte de criação: tudo datado pela entrada do lead
    if (!inWindow(d.created_at, start, end)) continue;
    if (status === "WON") won += 1;
    else if (status === "LOST") lost += 1;
    else open += 1;
  }

  const closed = won + lost;
  const denominator = cohort === "closed" ? closed : closed + open;
  return {
    won,
    lost,
    closed,
    open: cohort === "closed" ? 0 : open,
    denominator,
    rate: denominator > 0 ? won / denominator : 0,
    cohort,
  };
}
