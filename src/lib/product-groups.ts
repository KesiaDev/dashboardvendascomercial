// Mapeamento dos nomes de produto (CSV) para os grupos do dashboard.
// A correspondência é feita por palavras-chave em ordem (a primeira que casar ganha).

export interface ProductGroup {
  id: string;
  label: string;
  color: string; // tailwind/hsl token-friendly hex
}

export const PRODUCT_GROUPS: ProductGroup[] = [
  { id: "gtp_au", label: "Gestor Tráfego Pago 2.0 - AU", color: "#6366f1" },
  { id: "formacao_rs", label: "Formação Gestor Redes Sociais 2.0", color: "#06b6d4" },
  { id: "accelerator", label: "Programa Accelerator", color: "#10b981" },
  { id: "estrategista", label: "Estrategista de Infoprodutos", color: "#f59e0b" },
  { id: "master_scale", label: "Master and Scale 2025", color: "#ec4899" },
  { id: "traffic_master", label: "Traffic Master", color: "#8b5cf6" },
  { id: "renov_mentoria", label: "Renovação Mentoria", color: "#3b82f6" },
  { id: "renov_tm", label: "Renovação Traffic Master", color: "#a855f7" },
  { id: "renov_acc", label: "Renovação Accelerator", color: "#14b8a6" },
  { id: "outros", label: "Outros", color: "#64748b" },
];

export function mapProductToGroup(productName: string): string {
  const name = (productName || "").toLowerCase().trim();

  // Renovações primeiro (mais específicas)
  if (name.includes("accelerator") && name.includes("renova")) return "renov_acc";
  if ((name.includes("traffic master") || name.includes("tráfico master")) && name.includes("renova")) return "renov_tm";
  if (name.includes("mentoria") && name.includes("tráfego") && name.includes("renova")) return "renov_mentoria";
  if (name.includes("formação") && name.includes("renova")) return "formacao_rs";

  // Produtos principais
  if (name.includes("mentoria") && name.includes("tráfego")) return "gtp_au";
  if (name.includes("formação") && name.includes("redes sociais")) return "formacao_rs";
  if (name.includes("accelerator")) return "accelerator";
  if (name.includes("estrategista") && name.includes("infoproduto")) return "estrategista";
  if (name.includes("master and scale") || name.includes("master and scala")) return "master_scale";
  if (name.includes("traffic master") || name.includes("tráfico master")) return "traffic_master";

  return "outros";
}

export function getGroupById(id: string): ProductGroup {
  return PRODUCT_GROUPS.find((g) => g.id === id) ?? PRODUCT_GROUPS[PRODUCT_GROUPS.length - 1];
}

// Categorias de status normalizadas
export type StatusCategory = "aprovado" | "cancelado" | "chargeback" | "reembolso" | "outro";

export function categorizeStatus(status: string): StatusCategory {
  const s = (status || "").toLowerCase().trim();
  if (s === "aprovado" || s === "completo" || s === "completed" || s === "approved") return "aprovado";
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
