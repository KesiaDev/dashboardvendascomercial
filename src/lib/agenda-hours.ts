/**
 * Janela de trabalho de cada vendedor, sempre expressa em hora de Lisboa
 * (fuso base da agenda). Vendedores no Brasil só ficam disponíveis a partir
 * das 10:00 de Lisboa (= 06:00 no Brasil) — a restrição importante é de
 * manhã; à noite trabalham até tarde. Portugal (Rita e João) começa às 07:00.
 */
export type WorkingHours = {
  startH: number;
  endH: number;
  tz: string;
  label: string;
};

const PT_HOURS: WorkingHours = {
  startH: 7,
  endH: 22,
  tz: "Europe/Lisbon",
  label: "07:00–22:00 (Lisboa)",
};
const BR_HOURS: WorkingHours = {
  startH: 10,
  endH: 22,
  tz: "America/Sao_Paulo",
  label: "10:00–22:00 Lisboa = 06:00–18:00 Brasil",
};

/** Vendedores baseados no Brasil (chave = e-mail ou pedaço do nome). */
const BR_SELLERS = [
  "fabio.nadal19@gmail.com",
  "fabionadal@llmidiaco.com",
  "gp5230158@gmail.com",
  "nadal",
  "gisele",
];

function norm(v: string | null | undefined) {
  return (v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isBrazilSeller(sellerEmail?: string | null, sellerName?: string | null): boolean {
  const e = norm(sellerEmail);
  const n = norm(sellerName);
  return BR_SELLERS.some((k) => (e && e.includes(k)) || (n && n.includes(k)));
}

export function getWorkingHours(
  sellerEmail?: string | null,
  sellerName?: string | null,
): WorkingHours {
  return isBrazilSeller(sellerEmail, sellerName) ? BR_HOURS : PT_HOURS;
}
