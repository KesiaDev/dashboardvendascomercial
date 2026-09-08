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
  // Funis de marketing (grupo MKT). Só entram quando o lead foi de facto
  // entregue ao comercial — ver HANDOFF_TAGS.
  "MINICURSO-V3",
  "EBOOK-V3",
];

/** Buckets exibidos (mesma ordem nas duas telas). */
export const LEADS_BUCKETS = ["Sessão Estratégica", "Minicurso V3", "Ebook V3"] as const;

/**
 * Tags da Clint que marcam a passagem do lead do marketing para o comercial:
 * clicou no WhatsApp da sessão, falou com a IA comercial, pediu falar com
 * especialista/equipa, ou entrou numa lista de hotleads do comercial.
 * "FALOU COM IA - MKT" NÃO conta: o lead ainda está com o marketing.
 */
export const HANDOFF_TAGS: RegExp[] = [
  /clicou\s*whatsapp/i,
  /falou\s*com\s*ia\s*-\s*com\b/i,
  /falar\s*com\s*(especialista|equipa|equipe)/i,
  /lista\s*comercial/i,
  /comercial\s*hotlead/i,
  /^comercial[\s_-]/i,
  /disparo\s*comercial/i,
];

/** true quando alguma tag do contato indica entrega ao comercial. */
export function entregueAoComercial(contactTags?: string[] | null): boolean {
  const tags = contactTags ?? [];
  return tags.some((t) => {
    const s = String(t ?? "");
    if (/falou\s*com\s*ia\s*-\s*mkt/i.test(s)) return false;
    return HANDOFF_TAGS.some((re) => re.test(s));
  });
}

/**
 * Classifica um negócio da Clint em Sessão Estratégica / Minicurso V3 / Ebook V3.
 * Negócio do funil de Sessão Estratégica entra direto como Sessão.
 * Negócio do PIPELINE_COMERCIAL-V3 é classificado pela tag real do contato.
 * Negócio de MINICURSO-V3 / EBOOK-V3 (funis de marketing) só entra quando tem
 * tag de entrega ao comercial.
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
  if (/minicurso[\s_-]*v3/i.test(o)) {
    return entregueAoComercial(contactTags)
      ? { bucket: "Minicurso V3", tag: "Minicurso V3 → comercial" }
      : null;
  }
  if (/ebook[\s_-]*v3/i.test(o)) {
    return entregueAoComercial(contactTags)
      ? { bucket: "Ebook V3", tag: "Ebook V3 → comercial" }
      : null;
  }
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
