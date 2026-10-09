import { describe, expect, it } from "vitest";
import { formatarCronometro, formatarDuracao } from "./datas";

describe("formatarCronometro", () => {
  it("mostra minutos e segundos abaixo de uma hora", () => {
    expect(formatarCronometro(0)).toBe("0:00");
    expect(formatarCronometro(309_000)).toBe("5:09");
  });
  it("inclui as horas a partir de uma hora", () => {
    expect(formatarCronometro(3_909_000)).toBe("1:05:09");
  });
  it("não mostra tempo negativo", () => {
    expect(formatarCronometro(-5000)).toBe("0:00");
  });
});

describe("formatarDuracao", () => {
  it("resume em minutos e horas", () => {
    expect(formatarDuracao(30_000)).toBe("menos de 1 min");
    expect(formatarDuracao(25 * 60_000)).toBe("25 min");
    expect(formatarDuracao(120 * 60_000)).toBe("2 h");
    expect(formatarDuracao(130 * 60_000)).toBe("2 h 10 min");
  });
});
