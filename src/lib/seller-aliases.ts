/**
 * Alguns vendedores existem com mais de um e-mail (login do dashboard vs.
 * e-mail na Clint). Aqui unificamos: um e-mail canónico + os seus aliases,
 * para que agenda, disponibilidade e permissões tratem tudo como a mesma pessoa.
 */
export type SellerAlias = { canonical: string; name: string; aliases: string[] };

export const SELLER_ALIASES: SellerAlias[] = [
  {
    canonical: "gp5230158@gmail.com",
    name: "Gisele Pimentel",
    aliases: ["giselegagliano@lucianolarrossa.com"],
  },
];

const lower = (v?: string | null) => (v ?? "").trim().toLowerCase();

/** Devolve o e-mail canónico do vendedor (ou o próprio, se não houver alias). */
export function canonicalSellerEmail(email?: string | null): string {
  const e = lower(email);
  if (!e) return "";
  for (const g of SELLER_ALIASES) {
    if (e === g.canonical || g.aliases.some((a) => lower(a) === e)) return g.canonical;
  }
  return e;
}

/** Todos os e-mails equivalentes (canónico + aliases) de um vendedor. */
export function sellerEmailVariants(email?: string | null): string[] {
  const e = lower(email);
  if (!e) return [];
  const g = SELLER_ALIASES.find(
    (x) => e === x.canonical || x.aliases.some((a) => lower(a) === e),
  );
  return g ? [g.canonical, ...g.aliases.map(lower)] : [e];
}

/** Nome preferido quando o vendedor tem alias configurado. */
export function canonicalSellerName(email?: string | null): string | null {
  const c = canonicalSellerEmail(email);
  return SELLER_ALIASES.find((g) => g.canonical === c)?.name ?? null;
}

/** true se os dois e-mails pertencem à mesma pessoa. */
export function isSameSeller(a?: string | null, b?: string | null): boolean {
  const ca = canonicalSellerEmail(a);
  return !!ca && ca === canonicalSellerEmail(b);
}
