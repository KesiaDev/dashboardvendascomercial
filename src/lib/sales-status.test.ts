import { describe, expect, it } from "vitest";
import { APPROVED_STATUS_DB_VALUES, isApproved } from "./sales-status";

describe("isApproved", () => {
  it("aceita as formas em português que o webhook grava", () => {
    expect(isApproved("Aprovado")).toBe(true);
    expect(isApproved("Completo")).toBe(true);
  });

  it("aceita as formas em inglês que vêm do CSV da Hotmart", () => {
    for (const s of ["APPROVED", "COMPLETED", "COMPLETE"]) {
      expect(isApproved(s), s).toBe(true);
    }
  });

  it("é case-insensitive e ignora espaços", () => {
    expect(isApproved("  aPrOvAdO ")).toBe(true);
  });

  // A regressão que motivou o módulo: manual-sales e a auditoria de comissão
  // perdiam COMPLETE, então a venda aparecia em /vendas-reais e sumia do cálculo
  // de pagamento.
  it("COMPLETE conta como aprovada — a divergência que quebrava a comissão", () => {
    expect(isApproved("COMPLETE")).toBe(true);
  });

  it("não conta cancelamento, chargeback nem reembolso", () => {
    for (const s of ["Cancelado", "Chargeback", "Reembolso", "Reclamado", "Expirado", ""]) {
      expect(isApproved(s), s).toBe(false);
    }
  });

  it("tolera null e undefined", () => {
    expect(isApproved(null)).toBe(false);
    expect(isApproved(undefined)).toBe(false);
  });

  it("a lista para o banco cobre tudo que isApproved aceita", () => {
    for (const v of APPROVED_STATUS_DB_VALUES) expect(isApproved(v), v).toBe(true);
  });
});
