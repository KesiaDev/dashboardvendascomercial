// Dicionário de funil/canal de aquisição — normaliza duas fontes que hoje não se
// conversam (group_name da Clint, sck da Hotmart) em um único id, seguindo o
// mapeamento de docs/business-model.md (seção "Como a empresa ganha dinheiro").

export type ChannelTipo = "aquisicao" | "renovacao" | "outro";

export interface Channel {
  id: string;
  label: string;
  tipo: ChannelTipo;
  /** group_name da Clint (docs/pipelines.md) que pertencem a este canal. */
  clintGroupNames: string[];
  /** Prefixo do sck/Origem de Checkout (ex.: "igt20.joao" → prefixo "igt"). */
  sckPrefixes: string[];
}

export const CHANNELS: Channel[] = [
  { id: "igt", label: "IGT", tipo: "aquisicao", clintGroupNames: ["IGT"], sckPrefixes: ["igt"] },
  { id: "fgrs", label: "FGRS", tipo: "aquisicao", clintGroupNames: ["FGRS"], sckPrefixes: ["fgrs"] },
  // A planilha de metas trata Webinar Mentoria, Perpétuo Mentoria e Webinar FGRS como
  // funis distintos (seções separadas, investimento/meta próprios) — mesmo que hoje não
  // seja possível diferenciá-los com certeza via sck/group_name (ver gap-analysis.md,
  // limitação a resolver quando o "Realizado automático" for implementado).
  { id: "webinar_mentoria", label: "Webinar Mentoria", tipo: "aquisicao", clintGroupNames: ["WGT"], sckPrefixes: [] },
  {
    id: "perpetuo_mentoria",
    label: "Perpétuo Mentoria",
    tipo: "aquisicao",
    clintGroupNames: ["FUNIS PERPETUOS", "MGT"],
    sckPrefixes: ["mse"],
  },
  { id: "webinar_fgrs", label: "Webinar FGRS", tipo: "aquisicao", clintGroupNames: [], sckPrefixes: [] },
  { id: "ldp", label: "LDP (Live Direto ao Ponto)", tipo: "aquisicao", clintGroupNames: ["INFOEDITORA"], sckPrefixes: ["ldp"] },
  { id: "mas", label: "Master and Scale", tipo: "aquisicao", clintGroupNames: ["MASTER AND SCALE"], sckPrefixes: ["mas"] },
  { id: "accelerator", label: "Accelerator (perpétuo)", tipo: "aquisicao", clintGroupNames: ["Accelerator"], sckPrefixes: [] },
  { id: "evento_presencial", label: "Evento Presencial", tipo: "aquisicao", clintGroupNames: [], sckPrefixes: [] },
  { id: "perpetuo_ia", label: "Perpétuo IA", tipo: "aquisicao", clintGroupNames: [], sckPrefixes: [] },
  { id: "renovacao", label: "Renovação", tipo: "renovacao", clintGroupNames: ["SUCESSO DO CLIENTE"], sckPrefixes: [] },
  { id: "outros", label: "Outros / não classificado", tipo: "outro", clintGroupNames: [], sckPrefixes: [] },
];

function sckPrefix(sck: string | null | undefined): string | null {
  if (!sck) return null;
  const m = sck.toLowerCase().match(/^[a-z]+/);
  return m ? m[0] : null;
}

/**
 * Classifica um deal/venda em um canal. Prioriza o sck (mais específico — vem
 * do parâmetro de rastreio real da campanha) e só recorre ao group_name da
 * Clint quando não há sck (ex.: negócio criado direto na Clint, sem origem de
 * checkout/tracking).
 */
export function classifyChannel(groupName: string | null | undefined, sck: string | null | undefined): string {
  const prefix = sckPrefix(sck);
  if (prefix) {
    const bySck = CHANNELS.find((c) => c.sckPrefixes.includes(prefix));
    if (bySck) return bySck.id;
  }
  if (groupName) {
    const byGroup = CHANNELS.find((c) => c.clintGroupNames.includes(groupName));
    if (byGroup) return byGroup.id;
  }
  return "outros";
}
