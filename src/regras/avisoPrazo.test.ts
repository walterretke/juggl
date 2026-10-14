import { describe, expect, it } from "vitest";
import { avisosDasPrioridades, lerAvisosGravados } from "./avisoPrazo";

describe("aviso de prazo por prioridade", () => {
  const prioridades = [{ id: "alta" }, { id: "media" }, { id: "baixa" }];

  it("sem nada gravado, a mais urgente avisa antes e com mais insistência", () => {
    expect(avisosDasPrioridades(prioridades, null, 4)).toEqual({
      alta: { horas: 24, repetirHoras: 2 },
      media: { horas: 8, repetirHoras: 4 },
      baixa: { horas: 4, repetirHoras: 0 },
    });
  });

  it("o gravado vale por cima do padrão, e valor estragado volta ao padrão", () => {
    const salvo = { media: { horas: 2, repetirHoras: 0 }, baixa: { horas: -1, repetirHoras: "x" } };
    const avisos = avisosDasPrioridades(prioridades, salvo, 6);
    expect(avisos.media).toEqual({ horas: 2, repetirHoras: 0 });
    expect(avisos.baixa).toEqual({ horas: 6, repetirHoras: 0 });
  });

  it("JSON estragado vale como nada gravado", () => {
    expect(lerAvisosGravados("{")).toBeNull();
    expect(lerAvisosGravados(null)).toBeNull();
    expect(lerAvisosGravados('{"a":{"horas":1,"repetirHoras":0}}')).toEqual({ a: { horas: 1, repetirHoras: 0 } });
  });
});
