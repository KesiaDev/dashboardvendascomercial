import { canonicalSeller } from "@/lib/commission";

export const PAGE = 1000;

/** Nome canônico do funil, unificando Clint (origin_name) e fechamento (funnel). */
export function canonicalFunnel(raw: string | null | undefined): string {
  const k = (raw ?? "").trim();
  if (!k) return "— sem funil —";
  const u = k.toUpperCase();
  if (/^IGT\s*23/.test(u)) return "IGT 23";
  if (/^IGT\s*22/.test(u)) return "IGT 22";
  if (/^WGT/.test(u)) return "WGT - Perpétuo";
  if (u.includes("PIPELINE_COMERCIAL") || u.includes("COMERCIAL-V3") || u.includes("COMERCIAL V3"))
    return "PIPELINE_COMERCIAL-V3";
  if (/SESS[AÃ]O\s+ESTRAT[EÉ]GICA/.test(u)) return "Sessão Estratégica";
  if (u.includes("MASTER AND SCALE") || u.includes("MAS_")) return "Master and Scale";
  if (u.includes("RENOVA")) return "Renovação";
  if (u.includes("FOLLOW")) return "Follow-up Mentoria";
  if (u.includes("MINICURSO")) return "Minicurso V3";
  if (u.includes("EBOOK") || u.includes("E-BOOK")) return "Ebook V3";
  if (u.includes("PALESTRA")) return "Funil de Palestras";
  return k;
}

/**
 * Funis que os vendedores realmente trabalham — mesma lista do formulário de
 * fechamento manual (FUNNELS em manual-sales.functions.ts), já canonicalizada.
 * Tudo que não estiver aqui (automação de marketing, testes, cobrança...) é
 * ignorado no relatório de conversão.
 */
export const FUNIS_VENDEDOR = new Set<string>(
  [
    "PIPELINE_COMERCIAL-V3",
    "Minicurso V3",
    "Ebook V3",
    "IGT23",
    "Master and Scale — LDP_03_MAS_MGT",
    "Funil - Sessão Estratégica",
    "SESSÃO ESTRATÉGICA",
    "Funil de Indicações",
    "WGRS 1",
    "Renovação Mariana",
    "Funil Retomada de Leads Perdidos",
    "Funil Potencial Compra Futura",
    "Renovação",
    "Retrabalho Leads",
    "WGT - Perpétuo",
    "WGT-2",
    "CONVIDAR PARA IMERSÃO",
  ].map(canonicalFunnel),
);

/** Vendedores fora do relatório de conversão por enquanto. */
export const VENDEDORES_EXCLUIDOS = new Set(["aline", "kesia", "camila"]);

export function isVendedorExcluido(name: string): boolean {
  const n = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  for (const ex of VENDEDORES_EXCLUIDOS) if (n.includes(ex)) return true;
  return false;
}

export function canonicalSellerName(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "— sem vendedor —";
  return canonicalSeller(s) ?? s;
}

// Padrões de tag por categoria (case-insensitive substring match)
export const TAG_FILTER_OPTIONS = [
  { value: "", label: "Todas as origens" },
  { value: "ebook", label: "Ebook" },
  { value: "minicurso", label: "Minicurso" },
  { value: "wgt", label: "WGT Perpétuo" },
  { value: "igt", label: "IGT" },
  { value: "palavras", label: "Palavras" },
] as const;

const TAG_PATTERNS: Record<string, string[]> = {
  ebook: ["ebook", "e-book"],
  minicurso: ["minicurso", "mc-"],
  wgt: ["wgt"],
  igt: ["igt"],
  palavras: ["palavras"],
};

export function dealMatchesTagFilter(tags: string[], tagFilter: string): boolean {
  if (!tagFilter) return true;
  const pats = TAG_PATTERNS[tagFilter] ?? [tagFilter];
  return tags.some((t) => pats.some((p) => t.toLowerCase().includes(p)));
}

/**
 * No WGT (webinar perpétuo) a maior parte dos inscritos é responsabilidade do
 * marketing. Só entra na análise comercial o lead que "Acessou" a oferta (ou
 * etapa posterior) — a partir daí quem trabalha é o comercial.
 */
const WGT_STAGES_COMERCIAL = new Set(
  [
    "acessou",
    "abandono de carrinho",
    "abandono de checkout",
    "iniciou checkout",
    "fup",
    "fup 1",
    "retomada - leads perdidos",
    "ganho",
    "fechado",
  ].map((s) => s),
);

const normStage = (s: string | null | undefined) =>
  (s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** O negócio deve entrar nas métricas do comercial? */
export function isComercialDeal(originName: string | null | undefined, stage: string | null | undefined): boolean {
  const o = normStage(originName);
  if (!o.startsWith("wgt")) return true;
  return WGT_STAGES_COMERCIAL.has(normStage(stage));
}

export async function pagedDeals(db: any, column: string, from: string, to: string, tagFilter = "") {
  const selectCols = tagFilter
    ? "origin_name,user_name,status,stage,contact_tags"
    : "origin_name,user_name,status,stage";
  const rows: any[] = [];
  for (let page = 0; page < 30; page++) {
    let q = db
      .from("clint_deals")
      .select(selectCols)
      .gte(column, `${from}T00:00:00Z`)
      .lte(column, `${to}T23:59:59Z`)
      .order(column, { ascending: true })
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (column === "lost_at") q = q.eq("status", "LOST");
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

export async function fetchManualSales(db: any, from: string, to: string) {
  const { data, error } = await db
    .from("manual_sales")
    .select("id,funnel,seller_name,value_eur,sale_date,installment_number")
    .gte("sale_date", from)
    .lte("sale_date", to)
    .eq("installment_number", 1)
    .limit(20000);
  if (error) throw new Error(error.message);
  return data ?? [];
}
