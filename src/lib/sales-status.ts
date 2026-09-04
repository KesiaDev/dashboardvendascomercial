/**
 * Status de venda da Hotmart — fonte de verdade única.
 *
 * Existiam sete implementações de "esta venda conta como aprovada?", e elas
 * divergiam:
 *
 *   commission.ts / _app.resultados.tsx / product-groups.ts
 *     → aprovado, completo, approved, completed        (4, case-insensitive)
 *   vendas-reais.functions.ts
 *     → "Aprovado","Completo","APPROVED","COMPLETE"    (case-SENSITIVE, tem
 *                                                       COMPLETE, não tem COMPLETED)
 *   manual-sales.functions.ts / manual-sales-audit.server.ts
 *     → "Aprovado","Completo","APPROVED"               (perde COMPLETE e COMPLETED)
 *
 * Consequência prática: uma venda com status "COMPLETE" contava em /vendas-reais e
 * sumia da auditoria que calcula o pagamento da comissão.
 *
 * O webhook (api/hotmart/webhook.ts) normaliza para "Aprovado" na escrita, mas as
 * importações de CSV trazem os valores crus da Hotmart em maiúsculas, então os dois
 * formatos convivem na tabela.
 */

/** Todas as formas de "aprovado", em minúsculas. */
const APPROVED = new Set(["aprovado", "completo", "approved", "completed", "complete"]);

/** Uma venda conta como aprovada? Case-insensitive, tolerante a espaços. */
export function isApproved(status: string | null | undefined): boolean {
  return APPROVED.has((status ?? "").trim().toLowerCase());
}

/**
 * Valores literais para usar em `.in("status", ...)` do PostgREST, que compara
 * byte a byte. Cobre as capitalizações que de fato aparecem na tabela.
 *
 * Prefira filtrar no banco com isto e NÃO refiltrar em JS — as duas listas
 * divergindo é exatamente o bug que este módulo resolve.
 */
export const APPROVED_STATUS_DB_VALUES = [
  "Aprovado",
  "Completo",
  "APPROVED",
  "COMPLETED",
  "COMPLETE",
  "aprovado",
  "completo",
  "approved",
  "completed",
  "complete",
] as const;
