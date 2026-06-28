export type BusinessArea =
  | "COMERCIAL"
  | "IMPLANTACAO"
  | "POS_VENDA"
  | "FINANCEIRO"
  | "MKT"
  | "TESTES"
  | "OUTROS";

export const AREA_LABELS: Record<BusinessArea, string> = {
  COMERCIAL: "Comercial",
  IMPLANTACAO: "Implantação",
  POS_VENDA: "Pós-venda / Sucesso do Cliente",
  FINANCEIRO: "Financeiro",
  MKT: "Marketing / Lead Gen",
  TESTES: "Testes (excluído)",
  OUTROS: "Outros",
};

export const AREA_ORDER: BusinessArea[] = [
  "COMERCIAL",
  "IMPLANTACAO",
  "POS_VENDA",
  "FINANCEIRO",
  "MKT",
  "TESTES",
  "OUTROS",
];

/**
 * Mapa padrão grupo-da-Clint → área de negócio. A Clint já agrupa as 78
 * origins em ~15 grupos (FUNIS PERPETUOS, IGT, Accelerator, etc) — em vez
 * de criar uma nova taxonomia do zero, reaproveitamos essa categorização
 * existente e a comprimimos em áreas de negócio.
 */
const GROUP_TO_AREA: Record<string, BusinessArea> = {
  "FUNIS PERPETUOS": "COMERCIAL",
  FGRS: "COMERCIAL",
  IGT: "COMERCIAL",
  WGT: "COMERCIAL",
  MGT: "COMERCIAL",
  "MASTER AND SCALE": "COMERCIAL",
  WEI: "COMERCIAL",
  Accelerator: "IMPLANTACAO",
  "IMERSÃO IMPLEMENTACAO": "IMPLANTACAO",
  "SUCESSO DO CLIENTE": "POS_VENDA",
  COBRANÇAS: "FINANCEIRO",
  Hotmart: "FINANCEIRO",
  INFOEDITORA: "MKT",
  MKT: "MKT",
  TESTES: "TESTES",
};

export function classifyByGroupName(groupName: string | null | undefined): BusinessArea {
  if (!groupName) return "OUTROS";
  const key = groupName.trim();
  return GROUP_TO_AREA[key] ?? "OUTROS";
}
