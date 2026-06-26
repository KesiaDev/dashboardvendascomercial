export function formatBRL(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatCurrency(value: number | null | undefined, currency: string): string {
  if (value == null || Number.isNaN(value)) value = 0;
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function formatInt(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}
