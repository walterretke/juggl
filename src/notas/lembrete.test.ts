import { describe, expect, it } from "vitest";
import {
  descreverIntervalo,
  descreverProximo,
  escolhaDoIntervalo,
  interpretarIntervalo,
  minutosDaEscolha,
  proximoAviso,
  textoDoAviso,
} from "./lembrete";

describe("descreverIntervalo", () => {
  it("mostra minutos e horas", () => {
    expect(descreverIntervalo(15)).toBe("15 min");
    expect(descreverIntervalo(60)).toBe("1 h");
    expect(descreverIntervalo(90)).toBe("1 h 30 min");
    expect(descreverIntervalo(120)).toBe("2 h");
  });
});

describe("interpretarIntervalo", () => {
  it("aceita minutos e horas, com vírgula", () => {
    expect(interpretarIntervalo("45", "min")).toBe(45);
    expect(interpretarIntervalo("3", "h")).toBe(180);
    expect(interpretarIntervalo("1,5", "h")).toBe(90);
  });
  it("recusa vazio, zero, negativo e mais de uma semana", () => {
    expect(interpretarIntervalo("", "min")).toBeNull();
    expect(interpretarIntervalo("0", "min")).toBeNull();
    expect(interpretarIntervalo("-5", "h")).toBeNull();
    expect(interpretarIntervalo("abc", "min")).toBeNull();
    expect(interpretarIntervalo("200", "h")).toBeNull();
  });
});

describe("proximoAviso", () => {
  it("soma o intervalo ao momento atual", () => {
    expect(proximoAviso(new Date("2026-10-14T15:00:00.000Z"), 30)).toBe("2026-10-14T15:30:00.000Z");
  });
});

describe("descreverProximo", () => {
  const agora = new Date(2026, 9, 14, 14, 0);
  it("hoje, amanhã ou a data", () => {
    expect(descreverProximo(new Date(2026, 9, 14, 14, 30).toISOString(), agora)).toBe("às 14:30");
    expect(descreverProximo(new Date(2026, 9, 15, 9, 5).toISOString(), agora)).toBe("amanhã às 09:05");
    expect(descreverProximo(new Date(2026, 9, 17, 9, 0).toISOString(), agora)).toBe("em 17/10 às 09:00");
  });
});

describe("textoDoAviso", () => {
  it("nada vencido, nada a avisar", () => {
    expect(textoDoAviso([])).toBeNull();
  });
  it("uma nota usa o título e a primeira linha da descrição", () => {
    const aviso = textoDoAviso([{ titulo: "Marcar reunião com o Carlos", descricao: "\nsobre o AD\nmais", intervalo_min: 60 }]);
    expect(aviso?.titulo).toBe("Não esqueça: Marcar reunião com o Carlos");
    expect(aviso?.corpo).toBe("sobre o AD\nLembro de novo em 1 h se ainda não estiver resolvido.");
  });
  it("várias viram um resumo", () => {
    const notas = Array.from({ length: 6 }, (_, i) => ({ titulo: `Nota ${i + 1}`, descricao: null, intervalo_min: 15 }));
    const aviso = textoDoAviso(notas);
    expect(aviso?.titulo).toBe("6 lembretes para não esquecer");
    expect(aviso?.corpo.split("\n")).toEqual(["• Nota 1", "• Nota 2", "• Nota 3", "• Nota 4", "e mais 2."]);
  });
});

describe("escolhaDoIntervalo e minutosDaEscolha", () => {
  it("rápidos, horas exatas e minutos", () => {
    expect(escolhaDoIntervalo(30)).toEqual({ tipo: "rapido", minutos: 30 });
    expect(escolhaDoIntervalo(240)).toEqual({ tipo: "outro", valor: "4", unidade: "h" });
    expect(escolhaDoIntervalo(45)).toEqual({ tipo: "outro", valor: "45", unidade: "min" });
  });
  it("volta aos minutos", () => {
    for (const m of [15, 45, 240]) expect(minutosDaEscolha(escolhaDoIntervalo(m))).toBe(m);
    expect(minutosDaEscolha({ tipo: "outro", valor: "", unidade: "min" })).toBeNull();
  });
});
