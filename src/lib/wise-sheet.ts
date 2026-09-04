// Parser das linhas da planilha Wise (Google Sheets).
// Formato de cada aba mensal:
// DATA | RECEBIMENTO | VALOR EURO | COTAÇÃO EURO | VALOR REAL | DESCRIÇÃO
// A descrição segue o padrão "PRODUTO - situação - email@cliente".

export type WiseSheetRow = {
  data_pagamento: string;
  cliente: string;
  valor_eur: number;
  cotacao_eur: number;
  valor_brl: number;
  descricao: string | null;
  email_cliente: string | null;
  situacao: string | null;
  inadimplente: boolean;
  produto_grupo: string | null;
  sheet_tab: string;
};

/** "€2.400,00" | "R$ 14.273,28" | "5,9472" → number */
export function parseMoney(raw: string | undefined | null): number {
  if (!raw) return 0;
  const s = String(raw)
    .replace(/[^\d,.-]/g, "")
    .trim();
  if (!s) return 0;
  // formato pt-BR: ponto = milhar, vírgula = decimal
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** "02/07/2026" → "2026-07-02" */
export function parseDateBR(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = String(raw)
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const yyyy = y.length === 2 ? `20${y}` : y;
  return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;

/** Mapeia o prefixo usado na planilha para o grupo de produto do dashboard. */
export function mapWiseProduct(descricao: string): string | null {
  const d = descricao.toLowerCase();
  if (d.includes("reset relacional")) return "outros";
  if (d.startsWith("acc") || d.includes("accelerator")) return "accelerator";
  if (d.startsWith("tm") || d.includes("traffic master")) return "traffic_master";
  if (d.startsWith("mgt") || d.includes("mentoria")) return "gtp_au";
  if (d.startsWith("fgrs") || d.includes("redes sociais")) return "formacao_rs";
  if (d.startsWith("mas") || d.includes("master and scale")) return "master_scale";
  if (d.includes("estrategista")) return "estrategista";
  return null;
}

/** Extrai a situação (2º segmento da descrição) e se é inadimplência. */
export function parseSituacao(descricao: string): {
  situacao: string | null;
  inadimplente: boolean;
} {
  const parts = descricao
    .split("-")
    .map((p) => p.trim())
    .filter(Boolean);
  const situacao = parts.length > 1 && !EMAIL_RE.test(parts[1]) ? parts[1] : null;
  const inadimplente = /inadimpl/i.test(descricao);
  return { situacao, inadimplente };
}

/** Converte a matriz de valores de uma aba em linhas normalizadas. */
export function parseWiseTab(tabName: string, values: string[][]): WiseSheetRow[] {
  const out: WiseSheetRow[] = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i] ?? [];
    const data_pagamento = parseDateBR(r[0]);
    const cliente = (r[1] ?? "").trim();
    // Linhas de TOTAL/resumo não têm data nem cliente
    if (!data_pagamento || !cliente) continue;

    const descricao = (r[5] ?? "").trim() || null;
    const valor_eur = parseMoney(r[2]);
    const cotacao_eur = parseMoney(r[3]);
    let valor_brl = parseMoney(r[4]);
    if (!valor_brl && valor_eur && cotacao_eur) valor_brl = valor_eur * cotacao_eur;

    const emailMatch = descricao?.match(EMAIL_RE);
    const { situacao, inadimplente } = descricao
      ? parseSituacao(descricao)
      : { situacao: null, inadimplente: false };

    out.push({
      data_pagamento,
      cliente,
      valor_eur,
      cotacao_eur,
      valor_brl,
      descricao,
      email_cliente: emailMatch ? emailMatch[0].toLowerCase() : null,
      situacao,
      inadimplente,
      produto_grupo: descricao ? mapWiseProduct(descricao) : null,
      sheet_tab: tabName,
    });
  }
  return out;
}
