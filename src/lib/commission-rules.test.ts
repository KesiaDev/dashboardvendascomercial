import { describe, expect, it } from "vitest";
import {
  bonusMensalEur,
  bonusSemanalEur,
  isBonusProduct,
  managerRatePct,
  rateInEffect,
  roletaSpinFor,
  weeksOfPeriod,
} from "./commission-rules";

// Data LOCAL, não UTC: as semanas são construídas em horário local, e o fim do
// dia (23:59:59.999) vira o dia seguinte em toISOString num fuso a leste de UTC.
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmt = (w: { start: Date; end: Date }) => `${ymd(w.start)}→${ymd(w.end)}`;
const dow = (d: Date) => ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][d.getDay()];

describe("weeksOfPeriod — a semana quebra sempre na terça", () => {
  it("agosto/2026: semana curta inicial + 4 semanas qua→ter", () => {
    const w = weeksOfPeriod("2026-08-01", "2026-09-01");
    expect(w).toHaveLength(5);
    expect(w.map(fmt)).toEqual([
      "2026-08-01→2026-08-04",
      "2026-08-05→2026-08-11",
      "2026-08-12→2026-08-18",
      "2026-08-19→2026-08-25",
      "2026-08-26→2026-09-01",
    ]);
  });

  it("toda semana termina numa terça, exceto quando o período acaba antes", () => {
    for (const w of weeksOfPeriod("2026-09-02", "2026-09-29")) {
      expect(dow(w.end), fmt(w)).toBe("ter");
    }
  });

  it("setembro e novembro têm 4 semanas; outubro e dezembro, 5", () => {
    expect(weeksOfPeriod("2026-09-02", "2026-09-29")).toHaveLength(4);
    expect(weeksOfPeriod("2026-09-30", "2026-11-03")).toHaveLength(5);
    expect(weeksOfPeriod("2026-11-04", "2026-12-01")).toHaveLength(4);
    expect(weeksOfPeriod("2026-12-02", "2027-01-05")).toHaveLength(5);
  });

  // A implementação anterior fatiava em blocos fixos de 7 dias a partir do
  // início do período: para agosto isso daria 01–07, 08–14, 15–21… ou seja,
  // semanas que não existem no calendário comercial.
  it("não fatia em blocos de 7 dias a partir do início", () => {
    const w = weeksOfPeriod("2026-08-01", "2026-09-01");
    expect(fmt(w[0])).not.toBe("2026-08-01→2026-08-07");
  });

  it("um período que começa numa quarta não tem semana curta", () => {
    const w = weeksOfPeriod("2026-09-02", "2026-09-29");
    expect(fmt(w[0])).toBe("2026-09-02→2026-09-08");
  });

  it("as semanas cobrem o período inteiro, sem buraco nem sobreposição", () => {
    const w = weeksOfPeriod("2026-09-30", "2026-11-03");
    expect(ymd(w[0].start)).toBe("2026-09-30");
    expect(ymd(w[w.length - 1].end)).toBe("2026-11-03");
    for (let i = 1; i < w.length; i++) {
      const gap = w[i].start.getTime() - w[i - 1].end.getTime();
      expect(gap, `entre S${i} e S${i + 1}`).toBeLessThan(1000);
      expect(gap).toBeGreaterThan(0);
    }
  });
});

describe("bônus de meta — faixa única, não cumulativo", () => {
  it("semanal: €0 abaixo de 900, €30 a partir de 900, €60 a partir de 1600", () => {
    expect(bonusSemanalEur(0)).toBe(0);
    expect(bonusSemanalEur(899.99)).toBe(0);
    expect(bonusSemanalEur(900)).toBe(30);
    expect(bonusSemanalEur(1599.99)).toBe(30);
    expect(bonusSemanalEur(1600)).toBe(60);
    expect(bonusSemanalEur(50000)).toBe(60);
  });

  it("mensal: €0 / €30 a partir de 3200 / €60 a partir de 6400", () => {
    expect(bonusMensalEur(3199.99)).toBe(0);
    expect(bonusMensalEur(3200)).toBe(30);
    expect(bonusMensalEur(6400)).toBe(60);
  });

  // O modelo antigo somava meta + super: bater a super pagava 60 no N3 mas
  // também mudava as faixas (1200/2100). Aqui a faixa é única.
  it("bater a faixa alta paga 60, não 30+60", () => {
    expect(bonusSemanalEur(2000)).toBe(60);
    expect(bonusMensalEur(10000)).toBe(60);
  });
});

describe("roletaSpinFor", () => {
  const venda = (o: Partial<Parameters<typeof roletaSpinFor>[0]> = {}) =>
    roletaSpinFor({
      produto_grupo: "accelerator",
      valor_cheio_eur: 500,
      primeira_venda: true,
      ...o,
    });

  it("produto principal, ≥ €200 e primeira venda gera giro X", () => {
    expect(venda({ valor_cheio_eur: 200 })).toBe("X");
    expect(venda({ valor_cheio_eur: 999.99 })).toBe("X");
  });

  it("a partir de €1.000 o giro é da roleta Y", () => {
    expect(venda({ valor_cheio_eur: 1000 })).toBe("Y");
    expect(venda({ valor_cheio_eur: 4000 })).toBe("Y");
  });

  it("abaixo de €200 não gira", () => {
    expect(venda({ valor_cheio_eur: 199.99 })).toBeNull();
    expect(venda({ valor_cheio_eur: 0 })).toBeNull();
    expect(venda({ valor_cheio_eur: null })).toBeNull();
  });

  it("renovação não gira", () => {
    for (const g of ["renov_mentoria", "renov_acc", "renov_tm"]) {
      expect(venda({ produto_grupo: g }), g).toBeNull();
    }
  });

  it("Traffic Master e Outros não giram", () => {
    expect(venda({ produto_grupo: "traffic_master" })).toBeNull();
    expect(venda({ produto_grupo: "outros" })).toBeNull();
  });

  it("parcela recorrente não gira, por mais cara que seja", () => {
    expect(venda({ primeira_venda: false, valor_cheio_eur: 5000 })).toBeNull();
  });

  it("todos os cinco produtos principais giram", () => {
    for (const g of ["accelerator", "gtp_au", "formacao_rs", "master_scale", "estrategista"]) {
      expect(venda({ produto_grupo: g }), g).toBe("X");
    }
  });
});

describe("isBonusProduct", () => {
  it("os produtos da roleta contam para o bônus", () => {
    expect(isBonusProduct("accelerator")).toBe(true);
    expect(isBonusProduct("gtp_au")).toBe(true);
  });

  it("a ACC Taxa Inicial conta para o bônus, mesmo caindo em Outros", () => {
    expect(isBonusProduct("outros", "ACC Taxa Inicial")).toBe(true);
    expect(isBonusProduct("outros", "Accelerator - taxa inicial")).toBe(true);
  });

  it("renovação não conta", () => {
    expect(isBonusProduct("renov_mentoria")).toBe(false);
    expect(isBonusProduct("outros", "Renovação Mentoria")).toBe(false);
  });
});

describe("managerRatePct — a comissão de gestora que não era calculada", () => {
  it("1% sobre os produtos normais", () => {
    for (const g of ["accelerator", "gtp_au", "formacao_rs", "master_scale", "traffic_master"]) {
      expect(managerRatePct(g), g).toBe(1);
    }
  });

  it("0% em renovação", () => {
    for (const g of ["renov_mentoria", "renov_acc", "renov_tm"]) {
      expect(managerRatePct(g), g).toBe(0);
    }
  });
});

describe("rateInEffect — percentual vigente na data", () => {
  const rows = [
    { rate_pct: 17.5, effective_from: "2026-01-01" },
    { rate_pct: 16.5, effective_from: "2026-09-02" },
  ];

  // A regressão que motivou a correção: effective_from existia na tabela mas o
  // cálculo ignorava, ficando com a última linha que aparecesse. Mudar um
  // percentual reescrevia meses já fechados e pagos, em silêncio.
  it("agosto continua com o percentual da época", () => {
    expect(rateInEffect(rows, "2026-08-01")?.rate_pct).toBe(17.5);
  });

  it("setembro pega o percentual novo", () => {
    expect(rateInEffect(rows, "2026-09-02")?.rate_pct).toBe(16.5);
    expect(rateInEffect(rows, "2026-10-15")?.rate_pct).toBe(16.5);
  });

  it("a ordem das linhas não importa", () => {
    expect(rateInEffect([...rows].reverse(), "2026-08-01")?.rate_pct).toBe(17.5);
  });

  it("antes de qualquer vigência, não há percentual", () => {
    expect(rateInEffect(rows, "2025-12-31")).toBeNull();
  });

  it("linha sem data vale desde sempre", () => {
    const semData = [{ rate_pct: 5, effective_from: null }];
    expect(rateInEffect(semData, "2020-01-01")?.rate_pct).toBe(5);
  });

  it("aceita timestamp completo, não só YYYY-MM-DD", () => {
    expect(rateInEffect(rows, "2026-09-02T00:00:00Z")?.rate_pct).toBe(16.5);
  });
});
