/**
 * Janela de trabalho de cada vendedor, sempre expressa em hora de Lisboa
 * (fuso base da agenda). Vendedores no Brasil (BRT = Lisboa -4h no verão
 * europeu) só ficam disponíveis a partir das 10:00 de Lisboa, que equivale
 * às 06:00 no Brasil — assim o Agente IA da Clint nunca agenda cedo demais.
 */
export type WorkingHours = {
  startH: number;
  endH: number;
  tz: string;
  label: string;
};

const PT_HOURS: WorkingHours = { startH: 9, endH: 18, tz: "Europe/Lisbon", label: "09:00–18:00 (Lisboa)" };
const BR_HOURS: WorkingHours = { startH: 10, endH: 19, tz: "America/Sao_Paulo", label: "10:00–19:00 Lisboa = 06:00–15:00 Brasil" };

/** Vendedores baseados no Brasil (chave = e-mail ou pedaço do nome). */
const BR_SELLERS = [
  "fabio.nadal19@gmail.com",
  "gp5230158@gmail.com",
  "luanaguimaraes.moc@gmail.com",
  "nadal",
  "gisele",
  "luana",
];

function norm(v: string | null | undefined) {
  return (v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function isBrazilSeller(sellerEmail?: string | null, sellerName?: string | null): boolean {
  const e = norm(sellerEmail);
  const n = norm(sellerName);
  return BR_SELLERS.some((k) => (e && e.includes(k)) || (n && n.includes(k)));
}

export function getWorkingHours(sellerEmail?: string | null, sellerName?: string | null): WorkingHours {
  return isBrazilSeller(sellerEmail, sellerName) ? BR_HOURS : PT_HOURS;
}
