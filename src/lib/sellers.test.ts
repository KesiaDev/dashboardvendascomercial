import { describe, expect, it } from "vitest";
import {
  activeSellers,
  canonicalSellerName,
  isExcludedSeller,
  isMetricSeller,
  resolveSeller,
} from "./sellers";

describe("resolveSeller", () => {
  it("reconhece pelo nome da Clint", () => {
    expect(resolveSeller("Gisele Pimentel")?.id).toBe("gisele");
    expect(resolveSeller("Rita Bandeira")?.id).toBe("rita");
  });

  it("reconhece pelo nome de afiliado da Hotmart, que vem sujo", () => {
    expect(resolveSeller("FABIO NADAL GRIGOLO 08299996988")?.id).toBe("nadal");
    expect(resolveSeller("Gisele Gagliano Pimentel")?.id).toBe("gisele");
  });

  it("reconhece pelo e-mail, olhando só o que vem antes do @", () => {
    expect(resolveSeller("kesiawnandi@gmail.com")?.id).toBe("kesia");
    expect(resolveSeller("joaopessoa@llmidiaco.com")?.id).toBe("joao");
  });

  it("tolera acento e espaço duplo, que a Clint produz", () => {
    expect(resolveSeller("Fabio  Nadal")?.id).toBe("nadal");
    expect(resolveSeller("JOÃO PESSOA")?.id).toBe("joao");
  });

  it("devolve null para quem não é vendedor", () => {
    expect(resolveSeller("Suporte Técnico")).toBeNull();
    expect(resolveSeller("")).toBeNull();
    expect(resolveSeller(null)).toBeNull();
  });
});

describe("isExcludedSeller", () => {
  it("exclui a equipe interna", () => {
    expect(isExcludedSeller("Camila Faria")).toBe(true);
    expect(isExcludedSeller("Aline Gonçalves")).toBe(true);
  });

  // A regressão que motivou o módulo: bi.ts comparava string EXATA com cedilha,
  // então um "Aline Goncalves" vindo de export CSV escapava do filtro e o
  // faturamento dela entrava nas métricas.
  it("pega o nome sem cedilha que vinha do CSV e escapava do filtro antigo", () => {
    expect(isExcludedSeller("Aline Goncalves")).toBe(true);
    expect(isExcludedSeller("ALINE GONCALVES")).toBe(true);
    expect(isExcludedSeller("aline  goncalves")).toBe(true);
  });

  it("não exclui vendedor de verdade", () => {
    expect(isExcludedSeller("Kesia Nandi")).toBe(false);
  });
});

describe("isMetricSeller — o quadro muda com o tempo", () => {
  const time = ["kesia", "gisele", "joao", "rita", "pamela"] as const;

  it("o time atual conta em setembro/2026", () => {
    for (const nome of [
      "Kesia Nandi",
      "Gisele Pimentel",
      "João Pessoa",
      "Rita Bandeira",
      "Pamela",
    ]) {
      expect(isMetricSeller(nome, "2026-09-15"), nome).toBe(true);
    }
  });

  // Confirmado com a Kesia: Nadal foi vendedor até agosto/2026.
  it("Nadal conta em agosto e não conta em setembro", () => {
    expect(isMetricSeller("Fabio Nadal", "2026-08-31")).toBe(true);
    expect(isMetricSeller("Fabio Nadal", "2026-09-01")).toBe(false);
  });

  it("meses já fechados não são reescritos quando alguém sai", () => {
    expect(isMetricSeller("Fabio Nadal", "2026-03-10")).toBe(true);
    expect(isMetricSeller("Fabio Nadal", "2025-11-20")).toBe(true);
  });

  it("aceita Date além de string", () => {
    expect(isMetricSeller("Fabio Nadal", new Date("2026-08-15T12:00:00Z"))).toBe(true);
    expect(isMetricSeller("Fabio Nadal", new Date("2026-10-01T12:00:00Z"))).toBe(false);
  });

  it("equipe interna nunca conta, em data nenhuma", () => {
    expect(isMetricSeller("Camila Faria", "2026-09-15")).toBe(false);
    expect(isMetricSeller("Aline Gonçalves", "2025-01-10")).toBe(false);
  });

  it("o quadro de setembro tem exatamente as cinco pessoas confirmadas", () => {
    expect(
      activeSellers("2026-09-15")
        .map((s) => s.id)
        .sort(),
    ).toEqual([...time].sort());
  });

  it("o quadro muda ao longo de agosto: Luana sai no dia 7, Nadal no fim do mês", () => {
    expect(activeSellers("2026-08-05")).toHaveLength(7);
    expect(activeSellers("2026-08-15")).toHaveLength(6);
    expect(activeSellers("2026-09-01")).toHaveLength(5);
  });
});

describe("canonicalSellerName", () => {
  // A Kesia não estava na lista de _app.resultados.tsx, então as vendas dela
  // eram invisíveis naquela tela.
  it("a Kesia é vendedora — era o nome que faltava em /resultados", () => {
    expect(canonicalSellerName("kesia")).toBe("Kesia Nandi");
    expect(isMetricSeller("kesia", "2026-09-15")).toBe(true);
  });

  it("unifica as variantes do mesmo vendedor num nome só", () => {
    expect(canonicalSellerName("Fabio  Nadal")).toBe("Fabio Nadal");
    expect(canonicalSellerName("FABIO NADAL GRIGOLO 08299996988")).toBe("Fabio Nadal");
    expect(canonicalSellerName("fabionadal@llmidiaco.com")).toBe("Fabio Nadal");
  });

  it("devolve o texto limpo para quem não é vendedor", () => {
    expect(canonicalSellerName("  Outra   Pessoa ")).toBe("Outra Pessoa");
  });
});

describe("Luana — saiu no começo de agosto/2026", () => {
  // Antes desta consolidação ela estava excluída de TODAS as métricas, inclusive
  // dos meses em que ainda vendia: o faturamento do período anterior ficava
  // subestimado.
  it("conta nos meses em que ainda vendia", () => {
    expect(isMetricSeller("Luana Guimarães", "2026-07-20")).toBe(true);
    expect(isMetricSeller("luana", "2026-05-02")).toBe(true);
  });

  it("não conta depois da saída", () => {
    expect(isMetricSeller("Luana Guimarães", "2026-08-20")).toBe(false);
    expect(isMetricSeller("Luana Guimarães", "2026-09-15")).toBe(false);
  });

  it("continua fora do quadro atual", () => {
    expect(activeSellers("2026-09-15").map((s) => s.id)).not.toContain("luana");
  });
});
