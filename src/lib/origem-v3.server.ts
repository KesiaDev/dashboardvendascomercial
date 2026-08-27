/** Funis que interessam ao comercial na Clint (V3 + Sessão Estratégica + WGT Perpétuo). */
export const V3_ORIGIN_NAMES = [
  "PIPELINE_COMERCIAL-V3",
  "MINICURSO-V3",
  "EBOOK-V3",
  "FUNIL DE PALESTRAS",
  "Funil - Sessão Estratégica",
  // funil antigo da Sessão Estratégica (jun–ago/2025); mesmo funil, nome legado.
  "SESSAO ESTRATEGICA",
  "WGT - Perpétuo",
];

/** Nome amigável do FUNIL REAL da Clint (nunca campanha/UTM). */
const FUNIL_LABEL: Record<string, string> = {
  "PIPELINE_COMERCIAL-V3": "Pipeline Comercial V3",
  "MINICURSO-V3": "Minicurso V3",
  "EBOOK-V3": "Ebook V3",
  "FUNIL DE PALESTRAS": "Funil de Palestras",
  "Funil - Sessão Estratégica": "Sessão Estratégica (funil)",
  "WGT - Perpétuo": "WGT Perpétuo",
};

export const SEM_TAG = "Sem tag na Clint";

/** Únicos funis/tags que o comercial acompanha no card "Origem dos leads V3". */
export const ORIGENS_PERMITIDAS = [
  "Pipeline Comercial V3",
  "Minicurso V3",
  "Ebook V3",
  "Sessão Estratégica",
] as const;

/** Unifica rótulos duplicados (ex.: "Sessão Estratégica (funil)"/"(MSE)") e descarta o resto. */
export function canonOrigem(label: string | null | undefined): string | null {
  const n = String(label ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_]/g, " ");
  if (!n) return null;
  if (/sessao\s*estrateg|(^|\W)mse(\W|$)/.test(n)) return "Sessão Estratégica";
  if (/minicurso|mini curso/.test(n)) return "Minicurso V3";
  if (/ebook|e book/.test(n)) return "Ebook V3";
  if (/pipeline\s*comercial|funil\s*v3/.test(n)) return "Pipeline Comercial V3";
  return null;
}

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_]/g, " ");

/**
 * Sub-tags de etapa/automação que NÃO são origem do lead
 * (ex.: "SESSAO_ESTRATEGICA-V3 - CLICOU WHATSAPP", "IGT23 - DISPARO AULA 1").
 * Guardamos só a raiz da tag, antes do " - ".
 */
const tagRoot = (t: string) => String(t ?? "").split(/\s+[-–]\s+/)[0]!.trim();

/** Rótulo canônico das tags que interessam ao comercial. */
const TAG_CANON: Array<[RegExp, string]> = [
  [/sessao\s*estrateg/, "Sessão Estratégica"],
  [/wgt/, "WGT Perpétuo"],
  [/minicurso|mini curso/, "Minicurso V3"],
  [/ebook|e book/, "Ebook V3"],
  [/palestra/, "Palestras"],
  [/^funil\s*v3$|^funil$/, "Funil V3"],
  [/^igt/, "IGT"],
  [/^fgrs/, "FGRS"],
];

/**
 * Escolhe a TAG principal do contato (tags reais da Clint), na ordem de
 * prioridade comercial e já normalizada (sem sub-tag de automação/etapa).
 * Sem tag sincronizada → "Sem tag na Clint". UTM nunca é usada.
 */
export function mainTag(contactTags?: string[] | null): string {
  const roots = (contactTags ?? [])
    .map((t) => tagRoot(String(t ?? "")))
    .filter(Boolean);
  if (!roots.length) return SEM_TAG;
  for (const [re, label] of TAG_CANON) {
    if (roots.some((t) => re.test(norm(t)))) return label;
  }
  return roots[0]!;
}

/**
 * Origem = FUNIL REAL onde o lead entrou na Clint.
 * Detalhe (campanha) = TAG REAL do contato. UTM não é usado.
 */
export function classifyOrigemV3(
  originName: string | null,
  _raw?: any,
  contactTags?: string[] | null,
): { origem: string; campanha: string } {
  const origem = FUNIL_LABEL[originName ?? ""] ?? originName ?? "Sem funil (entrada manual)";
  return { origem, campanha: mainTag(contactTags) };
}

/** Nome do funil/campanha embutido no SCK do checkout Hotmart (ex.: "igt23.rita" → IGT 23). */
const SCK_FUNNEL_LABEL: Array<[RegExp, string]> = [
  [/^igt\s*2?3/, "IGT 23"],
  [/^igt\s*2?2/, "IGT 22"],
  [/^igt/, "IGT"],
  [/^wgt/, "WGT - Perpétuo"],
  [/^mse/, "Sessão Estratégica (MSE)"],
  [/^irr/, "Retomada / Reativação"],
  [/^upsell/, "Upsell"],
  [/^mas/, "Master and Scale"],
  [/^renov/, "Renovação"],
];

/** Extrai o funil de checkout a partir do SCK. Ignora tokens que são nomes de vendedor. */
export function sckFunnel(origemCheckout: string | null | undefined): string | null {
  const raw = String(origemCheckout ?? "").trim();
  if (!raw) return null;
  const tokens = norm(raw).split(/[^a-z0-9]+/).filter(Boolean);
  for (const t of tokens) {
    for (const [re, label] of SCK_FUNNEL_LABEL) if (re.test(t)) return label;
  }
  return null;
}

/** Compara nomes de vendedor por token (ex.: "João Pessoa" ≈ "joao"). */
export function sameSeller(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = new Set(norm(a).split(/[^a-z0-9]+/).filter((t) => t.length > 2));
  const tb = norm(b).split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  return tb.some((t) => ta.has(t));
}

/** Tags do funil PIPELINE_COMERCIAL-V3 que o comercial acompanha (ordem de prioridade). */
export const TAG_BUCKETS: Array<[RegExp, string]> = [
  [/^ebook[\s_-]*v3/, "Ebook V3"],
  [/^minicurso[\s_-]*v3/, "Minicurso V3"],
  [/^sessao[\s_-]*estrateg/, "Sessão Estratégica"],
];

/** Bucket do lead a partir das tags reais do contato (null = fora do escopo). */
export function tagBucket(contactTags?: string[] | null): { bucket: string; tag: string } | null {
  const tags = (contactTags ?? []).map((t) => String(t ?? "").trim()).filter(Boolean);
  for (const [re, label] of TAG_BUCKETS) {
    const hits = tags.filter((t) => re.test(norm(t))).sort((a, b) => b.length - a.length);
    if (hits.length) return { bucket: label, tag: hits[0]! };
  }
  return null;
}
