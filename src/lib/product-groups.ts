import { isApproved } from "./sales-status";

// Mapeamento dos nomes de produto (CSV) para os grupos do dashboard.
// A correspondência é feita por palavras-chave em ordem (a primeira que casar ganha).

export type ProductCategoria = "entrada" | "upsell" | "renovacao" | "outro";

export interface ProductGroup {
  id: string;
  label: string;
  color: string; // tailwind/hsl token-friendly hex
  /** Posição na escada de valor — ver docs/business-model.md (escada de upsell). */
  categoria: ProductCategoria;
  /** Produto do qual este é upsell/renovação — null se for produto de entrada/paralelo. */
  parentId: string | null;
}

export const PRODUCT_GROUPS: ProductGroup[] = [
  {
    id: "gtp_au",
    label: "Gestor Tráfego Pago 2.0 - AU",
    color: "#6366f1",
    categoria: "entrada",
    parentId: null,
  },
  {
    id: "formacao_rs",
    label: "Formação Gestor Redes Sociais 2.0",
    color: "#06b6d4",
    categoria: "entrada",
    parentId: null,
  },
  {
    id: "accelerator",
    label: "Programa Accelerator",
    color: "#10b981",
    categoria: "upsell",
    parentId: "gtp_au",
  },
  {
    id: "estrategista",
    label: "Estrategista de Infoprodutos",
    color: "#f59e0b",
    categoria: "outro",
    parentId: null,
  },
  {
    id: "master_scale",
    label: "Master and Scale 2025",
    color: "#ec4899",
    categoria: "outro",
    parentId: null,
  },
  {
    id: "traffic_master",
    label: "Traffic Master",
    color: "#8b5cf6",
    categoria: "upsell",
    parentId: "accelerator",
  },
  {
    id: "renov_mentoria",
    label: "Renovação Mentoria",
    color: "#3b82f6",
    categoria: "renovacao",
    parentId: "gtp_au",
  },
  {
    id: "renov_tm",
    label: "Renovação Traffic Master",
    color: "#a855f7",
    categoria: "renovacao",
    parentId: "traffic_master",
  },
  {
    id: "renov_acc",
    label: "Renovação Accelerator",
    color: "#14b8a6",
    categoria: "renovacao",
    parentId: "accelerator",
  },
  { id: "outros", label: "Outros", color: "#64748b", categoria: "outro", parentId: null },
];

function norm(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function mapProductToGroup(productName: string): string {
  const name = norm(productName);
  // "mentor", "mentoria", "mentor trafego pago 2.0 - au", "gestor de trafego"…
  const isMentoria =
    name.includes("mentor") || (name.includes("gestor") && name.includes("trafego"));
  const isTM = name.includes("traffic master") || name.includes("trafico master");
  const isRenov = name.includes("renova");

  // Renovações primeiro (mais específicas)
  if (isRenov && name.includes("accelerator")) return "renov_acc";
  if (isRenov && isTM) return "renov_tm";
  if (isRenov && isMentoria) return "renov_mentoria";
  if (isRenov && name.includes("formacao")) return "formacao_rs";
  if (isRenov) return "renov_mentoria"; // "Renovação" genérica = mentoria

  // Produtos principais
  if (name.includes("formacao") && name.includes("redes sociais")) return "formacao_rs";
  if (name.includes("accelerator")) return "accelerator";
  if (name.includes("estrategista") && name.includes("infoproduto")) return "estrategista";
  if (name.includes("master and scale") || name.includes("master and scala")) return "master_scale";
  if (isTM) return "traffic_master";
  if (isMentoria) return "gtp_au";

  return "outros";
}

/** Retorna true se o nome do produto (do fechamento manual ou Hotmart) for uma renovação. */
export function isRenewalProduct(productName: string | null | undefined): boolean {
  return (productName || "").toLowerCase().includes("renova");
}

export function getGroupById(id: string): ProductGroup {
  return PRODUCT_GROUPS.find((g) => g.id === id) ?? PRODUCT_GROUPS[PRODUCT_GROUPS.length - 1];
}

// Categorias de status normalizadas
export type StatusCategory = "aprovado" | "cancelado" | "chargeback" | "reembolso" | "outro";

export function categorizeStatus(status: string): StatusCategory {
  const s = (status || "").toLowerCase().trim();
  // "aprovado" delega para o módulo canônico — esta cópia perdia "complete".
  if (isApproved(s)) return "aprovado";
  if (s === "cancelado" || s === "cancelled" || s === "canceled") return "cancelado";
  if (s === "chargeback") return "chargeback";
  if (s.includes("reembols") || s.includes("refund") || s === "reclamado") return "reembolso";
  return "outro";
}

export const STATUS_LABELS: Record<StatusCategory, string> = {
  aprovado: "Aprovado",
  cancelado: "Cancelado",
  chargeback: "Chargeback",
  reembolso: "Reembolso / Reclamado",
  outro: "Outro",
};

export const STATUS_COLORS: Record<StatusCategory, string> = {
  aprovado: "#10b981",
  cancelado: "#94a3b8",
  chargeback: "#ef4444",
  reembolso: "#f59e0b",
  outro: "#64748b",
};
