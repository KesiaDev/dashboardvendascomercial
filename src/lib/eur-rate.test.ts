import { describe, expect, it } from "vitest";
import { FALLBACK_EUR_BRL, brlToEur, eurBrlRate, eurToBrl } from "./eur-rate";

describe("eurBrlRate", () => {
  it("usa a cotação do período quando existe", () => {
    expect(eurBrlRate({ cotacao_eur: 6.12 })).toBe(6.12);
  });

  it("cai no fallback único quando não há período ativo", () => {
    expect(eurBrlRate(undefined)).toBe(FALLBACK_EUR_BRL);
    expect(eurBrlRate(null)).toBe(FALLBACK_EUR_BRL);
    expect(eurBrlRate({})).toBe(FALLBACK_EUR_BRL);
    expect(eurBrlRate({ cotacao_eur: null })).toBe(FALLBACK_EUR_BRL);
  });

  it("ignora cotação inválida em vez de dividir por zero", () => {
    expect(eurBrlRate({ cotacao_eur: 0 })).toBe(FALLBACK_EUR_BRL);
    expect(eurBrlRate({ cotacao_eur: -1 })).toBe(FALLBACK_EUR_BRL);
    expect(eurBrlRate({ cotacao_eur: Number.NaN })).toBe(FALLBACK_EUR_BRL);
  });

  // A regressão que motivou o módulo: /comissionamento exibia o card de cotação
  // com ?? 5.85 e calculava a tabela de pagamento com ?? 5.86 — mostrava um
  // número e pagava outro. E /vendas-reais convertia a 6.00.
  it("exibição e cálculo usam exatamente a mesma cotação", () => {
    const semPeriodo = undefined;
    const exibido = eurBrlRate(semPeriodo);
    const usadoNoCalculo = eurBrlRate(semPeriodo);
    expect(exibido).toBe(usadoNoCalculo);
  });

  it("converte nos dois sentidos de forma consistente", () => {
    const p = { cotacao_eur: 5.5 };
    expect(eurToBrl(100, p)).toBe(550);
    expect(brlToEur(550, p)).toBe(100);
  });
});
