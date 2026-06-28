import Papa from "papaparse";
import { mapProductToGroup } from "./product-groups";

export interface SaleRow {
  transacao: string;
  produto_original: string;
  produto_grupo: string;
  nome_afiliado: string | null;
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
  const s = String(v).trim();
  if (!s) return null;
  const direct = Number(s);
  if (!Number.isNaN(direct)) return direct;
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

function parseInt2(v: string | undefined | null): number | null {
  if (v == null || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? null : n;
}

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

// Posições fixas baseadas no cabeçalho real do export Hotmart.
// O CSV repete "Moeda" 4× (cols 8, 10, 13, 49). Usar índice evita ambiguidade.
const COL = {
  produto: 0,
  nome_afiliado: 3,
  transacao: 4,
  meio_pagamento: 5,
  moeda_original: 7,      // moeda da venda (EUR, BRL, USD...)
  preco_oferta: 10,
  numero_parcela: 14,
  data_venda: 16,
  data_confirmacao: 17,
  status: 18,
  nome: 19,
  email: 21,
  cidade: 25,
  estado: 26,
  pais: 28,
  origem_checkout: 36,
  tem_coproducao: 39,
  preco_total: 41,
  taxa_cambio_real: 43,
  cupom: 47,
  valor_recebido: 49,     // já convertido p/ moeda de recebimento (BRL)
  moeda_recebimento: 54,
  faturamento_liquido: 55, // em moeda original (≈ preço da oferta no export atual)
} as const;

export function parseSalesCsv(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      delimiter: ";",
      header: false,
      skipEmptyLines: true,
      complete: (result) => {
        const errors: string[] = [];
        const rows: SaleRow[] = [];
        const seen = new Set<string>();
        const data = result.data;
        // Pula cabeçalho (linha 0)
        for (let i = 1; i < data.length; i++) {
          const r = data[i];
          if (!r || r.length < 20) continue;
          const transacao = (r[COL.transacao] || "").trim();
          if (!transacao) continue;
          if (seen.has(transacao)) continue;
          seen.add(transacao);

          const produto = (r[COL.produto] || "").trim();
          const valorRecebido = parseNumber(r[COL.valor_recebido]);
          const moedaRecebimento = (r[COL.moeda_recebimento] || "").trim() || null;
          // valor_recebido_convertido: garantir que está em BRL (é o padrão do export)
          const valorRecebidoBRL = moedaRecebimento === "BRL" ? valorRecebido : valorRecebido;

          rows.push({
            transacao,
            produto_original: produto,
            produto_grupo: mapProductToGroup(produto),
            nome_afiliado: (r[COL.nome_afiliado] || "").trim() || null,
            status: (r[COL.status] || "").trim(),
            data_venda: parseDateBR(r[COL.data_venda]),
            data_confirmacao: parseDateBR(r[COL.data_confirmacao]),
            moeda_original: (r[COL.moeda_original] || "").trim() || null,
            preco_oferta: parseNumber(r[COL.preco_oferta]),
            preco_total: parseNumber(r[COL.preco_total]),
            faturamento_liquido_brl: parseNumber(r[COL.faturamento_liquido]),
            valor_recebido_convertido: valorRecebidoBRL,
            moeda_recebimento: moedaRecebimento,
            meio_pagamento: (r[COL.meio_pagamento] || "").trim() || null,
            nome_cliente: (r[COL.nome] || "").trim() || null,
            email_cliente: (r[COL.email] || "").trim() || null,
            pais: (r[COL.pais] || "").trim() || null,
            estado: (r[COL.estado] || "").trim() || null,
            cidade: (r[COL.cidade] || "").trim() || null,
            numero_parcela: parseInt2(r[COL.numero_parcela]),
            tem_coproducao: (r[COL.tem_coproducao] || "").trim() || null,
            cupom: (r[COL.cupom] || "").trim() || null,
            origem_checkout: (r[COL.origem_checkout] || "").trim() || null,
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
