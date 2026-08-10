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
    .replace(/[\u0300-\u036f]/g, "");

/**
 * Descobre de onde o lead veio de verdade.
 * Prioridade: funil de entrada específico → campos UTM do deal.
 */
export function classifyOrigemV3(
  originName: string | null,
  raw: any,
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

  if (blob.includes("minicurso") || hasMinicursoFields) return { origem: "Minicurso V3", campanha };
  if (blob.includes("ebook")) return { origem: "Ebook V3", campanha };
  if (blob.includes("palestra")) return { origem: "Funil de Palestras", campanha };
  if (blob.includes("sessao")) return { origem: "Sessão Estratégica", campanha };
  if (blob.includes("indicac") || blob.includes("mgm")) return { origem: "Indicação", campanha };
  if (!blob.trim()) return { origem: "Sem origem (entrada manual)", campanha };
  return { origem: "Outras origens", campanha };
}
