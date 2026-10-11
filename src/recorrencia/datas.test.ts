import { describe, expect, it } from "vitest";
import { descreverFrequencia, primeiraOcorrencia, proximaOcorrencia } from "./datas";

// Sexta, 9 de outubro de 2026.
const SEXTA = new Date(2026, 9, 9, 10);

describe("proximaOcorrencia", () => {
  it("diária pula o fim de semana", () => {
    expect(proximaOcorrencia("diaria", null, SEXTA)).toBe("2026-10-12");
    expect(proximaOcorrencia("diaria", null, new Date(2026, 9, 12))).toBe("2026-10-13");
  });
  it("semanal cai no dia da semana", () => {
    expect(proximaOcorrencia("semanal", 1, SEXTA)).toBe("2026-10-12");
    expect(proximaOcorrencia("semanal", 5, SEXTA)).toBe("2026-10-16");
    expect(proximaOcorrencia("semanal", 7, SEXTA)).toBe("2026-10-11");
  });
  it("mensal cai no dia do mês, ou no último dia do mês curto", () => {
    expect(proximaOcorrencia("mensal", 5, SEXTA)).toBe("2026-11-05");
    expect(proximaOcorrencia("mensal", 20, SEXTA)).toBe("2026-10-20");
    expect(proximaOcorrencia("mensal", 31, new Date(2027, 0, 31))).toBe("2027-02-28");
  });
});

describe("primeiraOcorrencia", () => {
  it("inclui hoje", () => {
    expect(primeiraOcorrencia("semanal", 5, SEXTA)).toBe("2026-10-09");
    expect(primeiraOcorrencia("mensal", 9, SEXTA)).toBe("2026-10-09");
  });
});

describe("descreverFrequencia", () => {
  it("fala como gente", () => {
    expect(descreverFrequencia("diaria", null)).toBe("todo dia útil");
    expect(descreverFrequencia("semanal", 1)).toBe("toda segunda");
    expect(descreverFrequencia("semanal", 6)).toBe("todo sábado");
    expect(descreverFrequencia("mensal", 5)).toBe("todo dia 5");
  });
});
