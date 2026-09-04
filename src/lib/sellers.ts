/**
 * Identidade de vendedor — fonte de verdade única.
 *
 * Antes existiam SETE listas hardcoded, com conteúdos diferentes: `bi.ts`
 * (KNOWN_SELLERS e CANONICAL_SELLERS), `performance.functions.ts`,
 * `_app.coach.tsx` (cópia byte-a-byte da anterior), `_app.fechamento.tsx`,
 * `_app.resultados.tsx` e `manual-sales.functions.ts`. Mais três listas de
 * exclusão divergentes.
 *
 * Consequências que isso já causava:
 *   • `_app.resultados.tsx` não incluía a Kesia — as vendas dela eram invisíveis
 *     naquela tela.
 *   • `bi.ts` tinha a Pamela e não a Luana; `performance.functions.ts` o inverso.
 *   • A exclusão em `bi.ts` comparava string exata COM cedilha, então um registro
 *     "Aline Goncalves" vindo de export CSV passava pelo filtro e entrava no
 *     faturamento.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUADRO MUDA COM O TEMPO — e é por isso que `isMetricSeller` exige uma data.
 *
 * Fabio Nadal foi vendedor até agosto/2026 e saiu do time comercial em setembro.
 * Se a lista fosse fixa, tirar o Nadal mudaria os números de agosto
 * RETROATIVAMENTE: o faturamento fechado do mês passado deixaria de bater com o
 * relatório que já foi enviado. Cada pessoa tem, por isso, uma janela de vigência.
 *
 * Confirmado com a Kesia em 2026-09-03.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type SellerId = "kesia" | "gisele" | "joao" | "rita" | "pamela" | "nadal";

type SellerEntry = {
  id: SellerId;
  /** Nome exibido em relatórios e rankings. */
  name: string;
  /**
   * Como reconhecer a pessoa em qualquer origem: nome da Clint, "Nome do
   * Afiliado" da Hotmart (ex.: "FABIO NADAL GRIGOLO 08299996988"), prefixo de
   * e-mail, código no `sck` do checkout.
   *
   * Cada entrada é uma ALTERNATIVA, e dentro dela TODAS as palavras precisam
   * aparecer — comparadas como palavra inteira, nunca como substring.
   *
   * Match por substring é o que gera falso positivo: "pessoa" sozinho casaria
   * com qualquer "Outra Pessoa". Por isso o João exige as duas palavras.
   */
  match: string[][];
  /** Primeiro dia em que entra nas métricas. Ausente = desde sempre. */
  metricsFrom?: string;
  /** Último dia em que entra nas métricas (inclusive). Ausente = ainda ativo. */
  metricsUntil?: string;
};

const SELLERS: SellerEntry[] = [
  { id: "kesia", name: "Kesia Nandi", match: [["kesia"], ["nandi"], ["kesiawnandi"]] },
  { id: "gisele", name: "Gisele Pimentel", match: [["gisele"], ["giselegagliano"]] },
  {
    id: "joao",
    name: "João Pessoa",
    // "pessoa" sozinho é palavra comum demais — exige o par.
    match: [["joao", "pessoa"], ["joaopessoa"], ["jpessoa"], ["jpessoa20"]],
  },
  { id: "rita", name: "Rita Bandeira", match: [["rita"], ["ritabandeira"]] },
  { id: "pamela", name: "Pamela", match: [["pamela"]] },
  {
    id: "nadal",
    name: "Fabio Nadal",
    match: [["nadal"], ["fabionadal"]],
    // Saiu do time comercial em setembro/2026. Agosto e meses anteriores
    // continuam contando com ele — não reescrevemos história.
    metricsUntil: "2026-08-31",
  },
];

/**
 * Pessoas que aparecem como responsável em negócios mas nunca contam como
 * vendedor: equipe interna, suporte, e quem saiu antes desta consolidação.
 *
 * Luana Guimarães saiu da empresa e já estava excluída de todas as métricas
 * antes deste módulo existir; mantemos assim para não alterar retroativamente
 * meses já fechados. Se a data de saída dela for confirmada, vale movê-la para
 * SELLERS com `metricsUntil`.
 */
const NEVER_METRIC_TOKENS = ["camila", "aline", "luana"];

/** Sem acento, minúsculo, espaços colapsados. Resiste a variação de grafia. */
export function normalizeSellerText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Palavras do texto, já normalizadas. O e-mail entra só pelo que vem antes do
 * @, senão o domínio casaria com nomes curtos.
 */
function wordsOf(value: string | null | undefined): string[] {
  const norm = normalizeSellerText(value);
  if (!norm) return [];
  const subject = norm.includes("@") ? norm.split("@")[0] : norm;
  return subject.split(/[^a-z0-9]+/).filter(Boolean);
}

/** Alguma alternativa casa, com todas as suas palavras presentes? */
function matches(match: string[][], words: string[]): boolean {
  return match.some((alt) => alt.every((token) => words.includes(token)));
}

/**
 * Identifica o vendedor a partir de qualquer texto: nome da Clint, nome de
 * afiliado da Hotmart, e-mail, ou código do checkout.
 *
 * Devolve `null` para quem não é vendedor — inclusive equipe interna.
 */
export function resolveSeller(value: string | null | undefined): SellerEntry | null {
  const words = wordsOf(value);
  if (!words.length) return null;
  if (NEVER_METRIC_TOKENS.some((t) => words.includes(t))) return null;
  return SELLERS.find((s) => matches(s.match, words)) ?? null;
}

/** Nome canônico do vendedor, ou o texto original limpo se não for vendedor. */
export function canonicalSellerName(value: string | null | undefined): string {
  const seller = resolveSeller(value);
  if (seller) return seller.name;
  return (value ?? "").trim().replace(/\s+/g, " ");
}

/** Este texto identifica alguém que nunca entra em métrica de vendedor? */
export function isExcludedSeller(value: string | null | undefined): boolean {
  const words = wordsOf(value);
  return NEVER_METRIC_TOKENS.some((t) => words.includes(t));
}

/**
 * A pessoa conta nas métricas na data informada?
 *
 * `on` é a data do FATO (fechamento do negócio, data da venda) — não "hoje".
 * Passar a data do fato é o que impede que a saída de alguém reescreva meses
 * já fechados.
 */
export function isMetricSeller(value: string | null | undefined, on: Date | string): boolean {
  const seller = resolveSeller(value);
  if (!seller) return false;
  const day = typeof on === "string" ? on.slice(0, 10) : on.toISOString().slice(0, 10);
  if (seller.metricsFrom && day < seller.metricsFrom) return false;
  if (seller.metricsUntil && day > seller.metricsUntil) return false;
  return true;
}

/** Quadro de vendedores vigente na data informada, em ordem de exibição. */
export function activeSellers(on: Date | string): SellerEntry[] {
  const day = typeof on === "string" ? on.slice(0, 10) : on.toISOString().slice(0, 10);
  return SELLERS.filter(
    (s) => !(s.metricsFrom && day < s.metricsFrom) && !(s.metricsUntil && day > s.metricsUntil),
  );
}

/** Todos os vendedores já cadastrados, ativos ou não. Para filtros históricos. */
export function allSellers(): SellerEntry[] {
  return [...SELLERS];
}
