// Atribui uma venda Hotmart a um vendedor pelo `origem_checkout` (SCK).
// Ex.: "mse.joao" → João  ·  "igt21.gisele" → Gisele  ·  "mse.nadal" → Nadal

// Mapeia o "primeiro nome" (case-insensitive, sem acento) para o seller_name canônico.
const SCK_NAME_MAP: Record<string, string> = {
  gisele: "Gisele",
  joao: "João",
  luana: "Luana",
  nadal: "Nadal",
  rita: "Rita",
  kesia: "Késia",
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
