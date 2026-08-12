import { canonicalFunnel, canonicalSellerName, isVendedorExcluido } from "@/lib/conversao-funil.server";

export type FunilId = "WEBINAR" | "V3" | "SESSAO";

export const FUNIL_LABEL: Record<FunilId, string> = {
  WEBINAR: "WGT (Webinar)",
  V3: "Pipeline V3",
  SESSAO: "Sessão Estratégica",
};

/** Classifica um funil bruto (Clint origin_name ou funnel do fechamento) num dos 3 funis principais. */
export function funilPrincipal(raw: string | null | undefined): FunilId | null {
  const c = canonicalFunnel(raw)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (c.includes("wgt") || c.includes("webinar")) return "WEBINAR";
  if (c.includes("pipeline_comercial") || c.includes("pipeline comercial")) return "V3";
  if (c.includes("sessao estrategica")) return "SESSAO";
  return null;
}

const PAGE = 1000;

export async function pagedSelect(
  db: any,
  table: string,
  cols: string,
  column: string,
  from: string,
  to: string,
  maxPages = 60,
) {
  const { count, error: countErr } = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte(column, from)
    .lte(column, to);
  if (countErr) throw new Error(countErr.message);
  const total = Math.min(count ?? 0, maxPages * PAGE);
  if (total === 0) return [] as any[];
  const pages = Math.ceil(total / PAGE);
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      db
        .from(table)
        .select(cols)
        .gte(column, from)
        .lte(column, to)
        .order(column, { ascending: true })
        .range(i * PAGE, (i + 1) * PAGE - 1),
    ),
  );
  const rows: any[] = [];
  for (const { data, error } of results) {
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
  }
  return rows;
}


export type FunilAgg = {
  id: FunilId;
  label: string;
  leads: number;
  vendas: number;
  leads30: number;
  vendas30: number;
  leads7: number;
  vendas7: number;
  /** série mensal: { "2026-08": { leads, vendas } } */
  meses: Record<string, { leads: number; vendas: number }>;
};

export type VendedorAgg = {
  seller: string;
  leads: number;
  reunioesAgendadas: number;
  reunioesRealizadas: number;
  vendas: number;
  /** vendas por funil */
  porFunil: Record<FunilId, number>;
};

export function emptyFunil(id: FunilId): FunilAgg {
  return {
    id,
    label: FUNIL_LABEL[id],
    leads: 0,
    vendas: 0,
    leads30: 0,
    vendas30: 0,
    leads7: 0,
    vendas7: 0,
    meses: {},
  };
}

export function monthKey(iso: string) {
  return iso.slice(0, 7);
}

export { canonicalSellerName, isVendedorExcluido };
