import { describe, expect, it } from "vitest";
import { fimDaSemana, fimDoMes, formatarCronometro, formatarDuracao } from "./datas";

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

describe("fimDaSemana e fimDoMes", () => {
  it("a semana termina no domingo", () => {
    expect(fimDaSemana(new Date(2026, 9, 13))).toBe("2026-10-18"); // terça
    expect(fimDaSemana(new Date(2026, 9, 18))).toBe("2026-10-18"); // domingo é o próprio dia
    expect(fimDaSemana(new Date(2026, 9, 19))).toBe("2026-10-25"); // segunda
  });

  it("o mês termina no último dia, inclusive em fevereiro e na virada do ano", () => {
    expect(fimDoMes(new Date(2026, 9, 13))).toBe("2026-10-31");
    expect(fimDoMes(new Date(2028, 1, 3))).toBe("2028-02-29");
    expect(fimDoMes(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});
