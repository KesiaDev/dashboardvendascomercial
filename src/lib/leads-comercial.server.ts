import { tagBucket } from "@/lib/origem-v3.server";

/**
 * Funis da Clint onde chega a "levantada de mão" que o comercial atende.
 * Fonte única usada tanto pelos Funis Perpétuos (Resultados) quanto pelos
 * "leads novos" da Análise Comercial — para os dois números baterem.
 */
export const LEADS_ORIGINS = [
  "PIPELINE_COMERCIAL-V3",
  "Funil - Sessão Estratégica",
  "SESSAO ESTRATEGICA",
];

/** Buckets exibidos (mesma ordem nas duas telas). */
export const LEADS_BUCKETS = ["Sessão Estratégica", "Minicurso V3", "Ebook V3"] as const;

/**
 * Classifica um negócio da Clint em Sessão Estratégica / Minicurso V3 / Ebook V3.
 * Negócio do funil de Sessão Estratégica entra direto como Sessão.
 * Negócio do PIPELINE_COMERCIAL-V3 é classificado pela tag real do contato.
 * `null` = fora do escopo comercial (não conta como lead em nenhuma das telas).
 */
export function leadBucket(
  originName: string | null | undefined,
  contactTags?: string[] | null,
): { bucket: string; tag: string } | null {
  const o = String(originName ?? "");
  if (/sess[aã]o[\s_-]*estrat/i.test(o)) {
    return { bucket: "Sessão Estratégica", tag: "Funil Sessão Estratégica" };
  }
  if (/pipeline[\s_-]*comercial[\s_-]*v3/i.test(o)) return tagBucket(contactTags);
  return null;
}

/**
 * Estágios da Clint em que o lead ainda é só cadastro/automação — ninguém do
 * comercial assumiu. Fora desta lista consideramos "levantada de mão": o lead
 * respondeu a automação/template e virou responsabilidade do vendedor.
 */
const ESTAGIOS_SEM_ATENDIMENTO = /^(base|nutri|abertura|novo|lead|inscri)/i;

/** true quando o lead saiu da automação e passou a ser trabalhado pelo vendedor. */
export function levantouMao(stage: string | null | undefined): boolean {
  const s = String(stage ?? "").trim();
  if (!s) return false;
  return !ESTAGIOS_SEM_ATENDIMENTO.test(s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}
