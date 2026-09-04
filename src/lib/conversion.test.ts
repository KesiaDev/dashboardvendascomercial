import { describe, expect, it } from "vitest";
import { conversionRate, type ConversionDeal } from "./conversion";

const SET_START = new Date("2026-09-01T00:00:00Z");
const SET_END = new Date("2026-09-30T23:59:59Z");

const deal = (d: Partial<ConversionDeal> & { status: string }): ConversionDeal => ({
  created_at: null,
  won_at: null,
  lost_at: null,
  ...d,
});

describe("conversionRate — coorte de fechamento (definição oficial)", () => {
  it("conta ganhos e perdidos pela data de fechamento", () => {
    const r = conversionRate(
      [
        deal({ status: "WON", won_at: "2026-09-10T10:00:00Z" }),
        deal({ status: "WON", won_at: "2026-09-20T10:00:00Z" }),
        deal({ status: "LOST", lost_at: "2026-09-15T10:00:00Z" }),
        deal({ status: "LOST", lost_at: "2026-09-25T10:00:00Z" }),
      ],
      SET_START,
      SET_END,
    );
    expect(r).toMatchObject({ won: 2, lost: 2, denominator: 4, rate: 0.5 });
  });

  // A regressão que motivou o módulo: bi.ts contava LOST por created_at e WON
  // por won_at, então /executivo e /comercial divergiam para o mesmo período.
  it("um negócio criado em agosto e perdido em setembro conta em SETEMBRO", () => {
    const r = conversionRate(
      [
        deal({ status: "WON", created_at: "2026-08-01T10:00:00Z", won_at: "2026-09-10T10:00:00Z" }),
        deal({
          status: "LOST",
          created_at: "2026-08-05T10:00:00Z",
          lost_at: "2026-09-12T10:00:00Z",
        }),
      ],
      SET_START,
      SET_END,
    );
    // Pela fórmula antiga, o perdido cairia em agosto e setembro daria 100%.
    expect(r.rate).toBe(0.5);
    expect(r.lost).toBe(1);
  });

  it("um negócio criado em setembro e perdido em outubro NÃO conta em setembro", () => {
    const r = conversionRate(
      [
        deal({ status: "WON", won_at: "2026-09-10T10:00:00Z" }),
        deal({
          status: "LOST",
          created_at: "2026-09-05T10:00:00Z",
          lost_at: "2026-10-02T10:00:00Z",
        }),
      ],
      SET_START,
      SET_END,
    );
    expect(r).toMatchObject({ won: 1, lost: 0, rate: 1 });
  });

  it("negócio em aberto não entra no denominador", () => {
    const r = conversionRate(
      [
        deal({ status: "WON", won_at: "2026-09-10T10:00:00Z" }),
        deal({ status: "OPEN", created_at: "2026-09-02T10:00:00Z" }),
        deal({ status: "OPEN", created_at: "2026-09-03T10:00:00Z" }),
      ],
      SET_START,
      SET_END,
    );
    expect(r).toMatchObject({ denominator: 1, rate: 1, open: 0 });
  });

  it("ganho sem data de fechamento não cai em nenhum período", () => {
    const r = conversionRate([deal({ status: "WON", won_at: null })], SET_START, SET_END);
    expect(r).toMatchObject({ won: 0, denominator: 0, rate: 0 });
  });

  it("devolve 0 em vez de NaN quando não há nada no período", () => {
    expect(conversionRate([], SET_START, SET_END).rate).toBe(0);
  });

  it("aceita status em minúsculas", () => {
    const r = conversionRate(
      [deal({ status: "won", won_at: "2026-09-10T10:00:00Z" })],
      SET_START,
      SET_END,
    );
    expect(r.won).toBe(1);
  });

  it("sem limites de data, considera tudo", () => {
    const r = conversionRate(
      [
        deal({ status: "WON", won_at: "2024-01-10T10:00:00Z" }),
        deal({ status: "LOST", lost_at: "2026-09-15T10:00:00Z" }),
      ],
      null,
      null,
    );
    expect(r).toMatchObject({ won: 1, lost: 1, rate: 0.5 });
  });
});

describe("conversionRate — coorte de criação (para qualidade de lead)", () => {
  it("datar tudo pela entrada do lead e incluir os em aberto", () => {
    const r = conversionRate(
      [
        deal({ status: "WON", created_at: "2026-09-02T10:00:00Z", won_at: "2026-11-01T10:00:00Z" }),
        deal({ status: "LOST", created_at: "2026-09-03T10:00:00Z" }),
        deal({ status: "OPEN", created_at: "2026-09-04T10:00:00Z" }),
        deal({ status: "OPEN", created_at: "2026-09-05T10:00:00Z" }),
      ],
      SET_START,
      SET_END,
      "created",
    );
    expect(r).toMatchObject({ won: 1, lost: 1, open: 2, denominator: 4, rate: 0.25 });
  });

  it("as duas coortes respondem perguntas diferentes e não são comparáveis", () => {
    const deals = [
      deal({ status: "WON", created_at: "2026-09-02T10:00:00Z", won_at: "2026-09-20T10:00:00Z" }),
      deal({ status: "OPEN", created_at: "2026-09-04T10:00:00Z" }),
    ];
    expect(conversionRate(deals, SET_START, SET_END, "closed").rate).toBe(1);
    expect(conversionRate(deals, SET_START, SET_END, "created").rate).toBe(0.5);
  });
});
