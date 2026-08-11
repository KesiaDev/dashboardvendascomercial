/** Funis da campanha V3 na Clint. */
export const V3_ORIGIN_NAMES = [
  "PIPELINE_COMERCIAL-V3",
  "MINICURSO-V3",
  "EBOOK-V3",
  "FUNIL DE PALESTRAS",
  "Funil - Sessão Estratégica",
];

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_]/g, " ");

/** Classificação por tags do contato na Clint (mais confiável que UTM). */
function classifyByTags(contactTags: string[] | null | undefined): string | null {
  if (!contactTags?.length) return null;
  const tags = contactTags.map(norm);
  const some = (...pats: string[]) => tags.some((t) => pats.some((p) => t.includes(p)));

  if (some("minicurso", "mini curso")) return "Minicurso V3";
  if (some("ebook", "e book")) return "Ebook V3";
  if (tags.some((t) => t.includes("sessao") && (t.includes("estrategica") || t.includes("estrategia"))))
    return "Sessão Estratégica";
  if (some("palestra")) return "Funil de Palestras";
  return null;
}

/**
 * Descobre de onde o lead veio de verdade.
 * Prioridade: funil de entrada específico → tags do contato na Clint → UTM.
 */
export function classifyOrigemV3(
  originName: string | null,
  raw: any,
  contactTags?: string[] | null,
): { origem: string; campanha: string } {
  const fields = (raw?.fields ?? {}) as Record<string, unknown>;
  const campanha = String(fields["utm_campaign"] ?? "") || "(sem campanha)";
  const blob = norm(
    [fields["utm_campaign"], fields["pagina_origem"], fields["utm_content"], fields["origem_funil"]].join(" "),
  );
  const hasMinicursoFields = Object.keys(fields).some((k) => k.startsWith("mc_"));

  const byOrigin: Record<string, string> = {
    "MINICURSO-V3": "Minicurso V3",
    "EBOOK-V3": "Ebook V3",
    "FUNIL DE PALESTRAS": "Funil de Palestras",
    "Funil - Sessão Estratégica": "Sessão Estratégica",
  };
  const direct = byOrigin[originName ?? ""];
  if (direct) return { origem: direct, campanha };

  const byTag = classifyByTags(contactTags);
  if (byTag) return { origem: byTag, campanha };


  if (blob.includes("minicurso") || hasMinicursoFields) return { origem: "Minicurso V3", campanha };
  if (blob.includes("ebook")) return { origem: "Ebook V3", campanha };
  if (blob.includes("palestra")) return { origem: "Funil de Palestras", campanha };
  if (blob.includes("sessao")) return { origem: "Sessão Estratégica", campanha };
  if (blob.includes("indicac") || blob.includes("mgm")) return { origem: "Indicação", campanha };
  if (!blob.trim()) return { origem: "Sem origem (entrada manual)", campanha };
  return { origem: "Outras origens", campanha };
}
