import Papa from "papaparse";
import { cleanSellerName } from "./bi";

/**
 * Os exports de Indicadores da Clint às vezes chegam com acentos corrompidos
 * (ex.: "JoÃ£o" em vez de "João") — texto UTF-8 válido que foi reinterpretado
 * como Latin-1 em algum ponto do caminho. Só corrige quando detecta o padrão
 * característico ("Ã" seguido de outro byte alto); texto já correto passa
 * intacto.
 */
function fixMojibake(s: string): string {
  if (!/Ã./.test(s)) return s;
  try {
    const bytes = Uint8Array.from(s, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return s;
  }
}

function parseRows(text: string): string[][] {
  const result = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
  return result.data;
}

export interface ProdutividadeRow {
  userName: string;
  ligacoes: number;
  emails: number;
  tarefas: number;
  reunioesAgendadas: number;
  whatsapp: number;
}

/** CSV: "Nome do Usuário","Ligações","Emails","Tarefas","Reuniões agendadas","WhatsApp" */
export function parseProdutividadeCsv(text: string): ProdutividadeRow[] {
  const rows = parseRows(text);
  const out: ProdutividadeRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 6) continue;
    const userName = cleanSellerName(fixMojibake(r[0] ?? "").trim());
    if (!userName) continue;
    out.push({
      userName,
      ligacoes: parseInt(r[1], 10) || 0,
      emails: parseInt(r[2], 10) || 0,
      tarefas: parseInt(r[3], 10) || 0,
      reunioesAgendadas: parseInt(r[4], 10) || 0,
      whatsapp: parseInt(r[5], 10) || 0,
    });
  }
  return out;
}

export interface NegociosTrabalhadosRow {
  userName: string;
  negociosTrabalhados: number;
}

/** CSV: "Nome do Usuário","Negócios Trabalhados" */
export function parseNegociosTrabalhadosCsv(text: string): NegociosTrabalhadosRow[] {
  const rows = parseRows(text);
  const out: NegociosTrabalhadosRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 2) continue;
    const userName = cleanSellerName(fixMojibake(r[0] ?? "").trim());
    if (!userName) continue;
    out.push({ userName, negociosTrabalhados: parseInt(r[1], 10) || 0 });
  }
  return out;
}

export interface FollowupRow {
  titulo: string;
  quantidade: number;
}

/** CSV: "Título da atividade","Quantidade" */
export function parseFollowupCsv(text: string): FollowupRow[] {
  const rows = parseRows(text);
  const out: FollowupRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 2) continue;
    const titulo = fixMojibake(r[0] ?? "").trim();
    if (!titulo) continue;
    out.push({ titulo, quantidade: parseInt(r[1], 10) || 0 });
  }
  return out;
}
