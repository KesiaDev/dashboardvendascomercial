// Atribui uma venda Hotmart a um vendedor pelo `origem_checkout` (SCK).
// Ex.: "mse.joao" → João  ·  "igt21.gisele" → Gisele  ·  "mse.nadal" → Nadal

// Mapeia o "primeiro nome" (case-insensitive, sem acento) para o seller_name canônico.
const SCK_NAME_MAP: Record<string, string> = {
  gisele: "Gisele",
  joao: "João",
  luana: "Luana",
  pamela: "Pamela",
  nadal: "Nadal",
  rita: "Rita",
  kesia: "Kesia Nandi",
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Retorna o seller_name canônico atribuído pelo SCK ou null se não bater.
 */
export function sellerFromSck(origemCheckout: string | null | undefined): string | null {
  if (!origemCheckout) return null;
  // Quebra por qualquer separador comum: . - _ /
  const tokens = origemCheckout.toLowerCase().split(/[.\-_/]+/).filter(Boolean);
  if (tokens.length === 0) return null;

  // Tenta do último para o primeiro (nome do vendedor costuma vir no fim).
  for (let i = tokens.length - 1; i >= 0; i--) {
    const key = stripAccents(tokens[i]);
    if (SCK_NAME_MAP[key]) return SCK_NAME_MAP[key];
  }
  return null;
}

/**
 * Resolve o vendedor a partir do campo "Nome do Afiliado" da Hotmart.
 * A Hotmart devolve o nome completo/razão social (ex.: "FABIO NADAL GRIGOLO 08299996988",
 * "Gisele Gagliano Pimentel", "LUANA GUIMARAES DIAS"), por isso o match é por token
 * de nome e não por igualdade exata.
 */
export function sellerFromAffiliate(nomeAfiliado: string | null | undefined): string | null {
  if (!nomeAfiliado) return null;
  const tokens = stripAccents(nomeAfiliado.toLowerCase()).split(/[^a-z0-9]+/).filter(Boolean);
  for (const t of tokens) {
    if (SCK_NAME_MAP[t]) return SCK_NAME_MAP[t];
  }
  return null;
}

// Tokens de SCK que NÃO pertencem a nenhum vendedor do comercial.
// - marketing / tráfego pago / orgânico: venda da área de marketing, fica fora do comissionamento
// - pessoas que não fazem parte da equipa comercial (ex.: janete)
const IGNORED_SCK_TOKENS = new Set([
  "janete",
  "mkt",
  "marketing",
  "ads",
  "meta",
  "google",
  "organico",
  "organic",
  "email",
  "youtube",
  "instagram",
]);

export function isIgnoredOrigin(origemCheckout: string | null | undefined): boolean {
  if (!origemCheckout) return false;
  const tokens = stripAccents(origemCheckout.toLowerCase()).split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((t) => IGNORED_SCK_TOKENS.has(t));
}

/**
 * Regra única de atribuição de uma venda Hotmart:
 * 1. Quando afiliado e SCK apontam para vendedores DIFERENTES, **vale o
 *    link/checkout (SCK)** — regra definida no fecho de agosto/26.
 *    Ex.: venda com afiliado Nadal e SCK "mse.joao" pertence ao **João**.
 *    O afiliado "perdedor" volta em `conflito_afiliado` para auditoria
 *    (a Hotmart ainda paga o split ao afiliado — conferir no fecho).
 * 2. Nome do Afiliado, quando não há SCK de outro vendedor.
 * 3. SCK (origem_checkout), quando não há afiliado reconhecido.
 * 4. Origens de marketing ou pessoas fora do comercial → não atribui a ninguém.
 */
export function resolveSaleSeller(
  nomeAfiliado: string | null | undefined,
  origemCheckout: string | null | undefined,
  affiliateToSeller?: Map<string, string>,
): {
  seller: string | null;
  source: "afiliado" | "sck" | null;
  /** Afiliado Hotmart divergente do SCK vencedor (venda em conflito). */
  conflito_afiliado: string | null;
} {
  const byAff =
    affiliateToSeller?.get((nomeAfiliado ?? "").toLowerCase()) ?? sellerFromAffiliate(nomeAfiliado);
  const bySck = isIgnoredOrigin(origemCheckout) ? null : sellerFromSck(origemCheckout);

  // Conflito afiliado × link: vale o link (SCK). Guardamos o afiliado para auditoria.
  if (byAff && bySck && byAff !== bySck)
    return { seller: bySck, source: "sck", conflito_afiliado: byAff };

  if (byAff) return { seller: byAff, source: "afiliado", conflito_afiliado: null };
  if (bySck) return { seller: bySck, source: "sck", conflito_afiliado: null };
  return { seller: null, source: null, conflito_afiliado: null };
}
