import Papa from "papaparse";
import { mapProductToGroup } from "./product-groups";

export interface SaleRow {
  transacao: string;
  produto_original: string;
  produto_grupo: string;
  status: string;
  data_venda: string | null;
  data_confirmacao: string | null;
  moeda_original: string | null;
  preco_oferta: number | null;
  preco_total: number | null;
  faturamento_liquido_brl: number | null;
  valor_recebido_convertido: number | null;
  moeda_recebimento: string | null;
  meio_pagamento: string | null;
  nome_cliente: string | null;
  email_cliente: string | null;
  pais: string | null;
  estado: string | null;
  cidade: string | null;
  numero_parcela: number | null;
  tem_coproducao: string | null;
  cupom: string | null;
  origem_checkout: string | null;
}

function parseNumber(v: string | undefined | null): number | null {
  if (v == null || v === "") return null;
  const cleaned = String(v).replace(/\./g, "").replace(",", ".");
  // CSV já vem em ponto decimal (ex.: 499.00) — primeiro tenta direto
  const direct = Number(v);
  if (!Number.isNaN(direct)) return direct;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

function parseInt2(v: string | undefined | null): number | null {
  if (v == null || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? null : n;
}

// Formato DD/MM/YYYY HH:mm:ss → ISO
function parseDateBR(v: string | undefined | null): string | null {
  if (!v) return null;
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = m;
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}Z`;
}

export interface ParseResult {
  rows: SaleRow[];
  errors: string[];
}

export function parseSalesCsv(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      delimiter: ";",
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
      complete: (result) => {
        const errors: string[] = [];
        const rows: SaleRow[] = [];
        const seen = new Set<string>();
        // O CSV tem nomes de coluna duplicados ("Moeda" 3x). Papaparse mantém o último.
        // Vamos usar os campos disponíveis pelos nomes esperados.
        for (let i = 0; i < result.data.length; i++) {
          const r = result.data[i];
          const transacao = (r["Transação"] || "").trim();
          if (!transacao) continue;
          if (seen.has(transacao)) continue;
          seen.add(transacao);

          const produto = (r["Nome do Produto"] || "").trim();

          rows.push({
            transacao,
            produto_original: produto,
            produto_grupo: mapProductToGroup(produto),
            status: (r["Status"] || "").trim(),
            data_venda: parseDateBR(r["Data de Venda"]),
            data_confirmacao: parseDateBR(r["Data de Confirmação"]),
            moeda_original: (r["Moeda"] || "").trim() || null,
            preco_oferta: parseNumber(r["Preço da Oferta"]),
            preco_total: parseNumber(r["Preço Total"]),
            faturamento_liquido_brl: parseNumber(r["Faturamento líquido"]),
            valor_recebido_convertido: parseNumber(r["Valor que você recebeu convertido"]),
            moeda_recebimento: (r["Moeda de recebimento"] || "").trim() || null,
            meio_pagamento: (r["Meio de Pagamento"] || "").trim() || null,
            nome_cliente: (r["Nome"] || "").trim() || null,
            email_cliente: (r["Email"] || "").trim() || null,
            pais: (r["País"] || "").trim() || null,
            estado: (r["Estado"] || "").trim() || null,
            cidade: (r["Cidade"] || "").trim() || null,
            numero_parcela: parseInt2(r["Número da Parcela"]),
            tem_coproducao: (r["Tem co-produção"] || "").trim() || null,
            cupom: (r["Cupom"] || "").trim() || null,
            origem_checkout: (r["Origem de Checkout"] || "").trim() || null,
          });
        }
        if (result.errors.length) {
          for (const e of result.errors.slice(0, 5)) errors.push(`Linha ${e.row}: ${e.message}`);
        }
        resolve({ rows, errors });
      },
      error: (err) => reject(err),
    });
  });
}
