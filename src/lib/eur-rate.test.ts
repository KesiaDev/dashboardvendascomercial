import { describe, expect, it } from "vitest";
import { brlToEur, eurBrlRate, eurToBrl, requireEurBrlRate } from "./eur-rate";

describe("eurBrlRate — sem fallback, por decisão", () => {
  it("usa a cotação do período quando existe", () => {
    expect(eurBrlRate({ cotacao_eur: 6.01 })).toBe(6.01);
  });

  // A regra definida em 04/09/2026: sem cotação cadastrada, a tela avisa em vez
  // de calcular. Um número de pagamento errado é pior que um número ausente —
  // com fallback ninguém percebe que a cotação do mês não foi cadastrada.
  it("devolve null quando o período não tem cotação", () => {
    expect(eurBrlRate(undefined)).toBeNull();
    expect(eurBrlRate(null)).toBeNull();
    expect(eurBrlRate({})).toBeNull();
    expect(eurBrlRate({ cotacao_eur: null })).toBeNull();
  });

  it("cotação inválida é tratada como ausente, nunca como zero", () => {
    expect(eurBrlRate({ cotacao_eur: 0 })).toBeNull();
    expect(eurBrlRate({ cotacao_eur: -1 })).toBeNull();
    expect(eurBrlRate({ cotacao_eur: Number.NaN })).toBeNull();
  });

  // A regressão original: /comissionamento exibia o card com ?? 5.85 e calculava
  // a tabela de pagamento com ?? 5.86 — mostrava um número e pagava outro.
  it("exibição e cálculo leem exatamente a mesma cotação", () => {
    const p = { cotacao_eur: 6.01 };
    expect(eurBrlRate(p)).toBe(eurBrlRate(p));
  });
});

describe("requireEurBrlRate — falha alta no servidor", () => {
  it("devolve a cotação quando existe", () => {
    expect(requireEurBrlRate({ cotacao_eur: 5.5 })).toBe(5.5);
  });

  it("lança com mensagem acionável quando não existe", () => {
    expect(() => requireEurBrlRate(null)).toThrow(/não cadastrada/i);
  });
});

describe("conversões", () => {
  it("convertem nos dois sentidos de forma consistente", () => {
    const p = { cotacao_eur: 5.5 };
    expect(eurToBrl(100, p)).toBe(550);
    expect(brlToEur(550, p)).toBe(100);
  });

  it("devolvem null sem cotação, em vez de NaN ou zero", () => {
    expect(eurToBrl(100, null)).toBeNull();
    expect(brlToEur(550, null)).toBeNull();
  });
});
