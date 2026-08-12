/** Funis da campanha V3 na Clint. */
export const V3_ORIGIN_NAMES = [
  "PIPELINE_COMERCIAL-V3",
  "MINICURSO-V3",
  "EBOOK-V3",
  "FUNIL DE PALESTRAS",
  "Funil - Sessão Estratégica",
];

/** Nome amigável do FUNIL REAL da Clint (nunca campanha/UTM). */
const FUNIL_LABEL: Record<string, string> = {
  "PIPELINE_COMERCIAL-V3": "Pipeline Comercial V3",
  "MINICURSO-V3": "Minicurso V3",
  "EBOOK-V3": "Ebook V3",
  "FUNIL DE PALESTRAS": "Funil de Palestras",
  "Funil - Sessão Estratégica": "Sessão Estratégica (funil)",
};

export const SEM_TAG = "Sem tag na Clint";

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_]/g, " ");

/**
 * Escolhe a TAG principal do contato (tags reais da Clint).
 * Prioriza tags de captação; se não houver, usa a primeira tag; se o contato
 * não tem tag sincronizada, devolve "Sem tag na Clint" — nunca UTM.
 */
export function mainTag(contactTags?: string[] | null): string {
  const tags = (contactTags ?? []).filter((t) => String(t ?? "").trim());
  if (!tags.length) return SEM_TAG;
  const find = (pred: (t: string) => boolean) => tags.find((t) => pred(norm(t)));
  return (
    find((t) => t.includes("sessao") && t.includes("estrateg")) ??
    find((t) => t.includes("minicurso") || t.includes("mini curso")) ??
    find((t) => t.includes("ebook") || t.includes("e book")) ??
    find((t) => t.includes("palestra")) ??
    find((t) => t.includes("v3")) ??
    tags[0]!
  );
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
