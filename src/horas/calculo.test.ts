import { describe, expect, it } from "vitest";
import { horasDecimais, horasMinutos, inicioDaSemana, resumirSemana, tabelaSemana, type Sessao } from "./calculo";

// Semana de segunda 5 a domingo 11 de outubro de 2026 (hora local).
const SEGUNDA = new Date(2026, 9, 5);
const H = 3_600_000;

function sessao(projeto: string | null, inicio: Date, horas: number, itemId = "i1"): Sessao {
  return {
    itemId,
    titulo: `Item ${itemId}`,
    projetoId: projeto,
    projeto,
    codigo: projeto ? `C-${projeto}` : null,
    inicio,
    fim: new Date(inicio.getTime() + horas * H),
  };
}

describe("inicioDaSemana", () => {
  it("volta para a segunda, inclusive a partir do domingo", () => {
    expect(inicioDaSemana(new Date(2026, 9, 8, 15))).toEqual(SEGUNDA);
    expect(inicioDaSemana(new Date(2026, 9, 11, 23))).toEqual(SEGUNDA);
    expect(inicioDaSemana(new Date(2026, 9, 5, 0, 1))).toEqual(SEGUNDA);
  });
});

describe("resumirSemana", () => {
  it("soma por projeto e por dia", () => {
    const r = resumirSemana(
      [
        sessao("infra", new Date(2026, 9, 5, 9), 2),
        sessao("infra", new Date(2026, 9, 7, 14), 1, "i2"),
        sessao("portal", new Date(2026, 9, 5, 11), 0.5, "i3"),
      ],
      SEGUNDA,
    );
    expect(r.linhas.map((l) => l.projeto)).toEqual(["infra", "portal"]);
    expect(r.linhas[0].porDia[0]).toBe(2 * H);
    expect(r.linhas[0].porDia[2]).toBe(1 * H);
    expect(r.linhas[0].itens).toHaveLength(2);
    expect(r.porDia[0]).toBe(2.5 * H);
    expect(r.total).toBe(3.5 * H);
  });

  it("divide a sessão que passa da meia-noite", () => {
    const r = resumirSemana([sessao("infra", new Date(2026, 9, 6, 23), 2)], SEGUNDA);
    expect(r.porDia[1]).toBe(1 * H);
    expect(r.porDia[2]).toBe(1 * H);
  });

  it("ignora o que está fora da semana e corta nas bordas", () => {
    const r = resumirSemana(
      [sessao("infra", new Date(2026, 9, 4, 23), 2), sessao("infra", new Date(2026, 9, 12, 9), 1)],
      SEGUNDA,
    );
    expect(r.total).toBe(1 * H);
    expect(r.porDia[0]).toBe(1 * H);
  });

  it("deixa Sem projeto por último", () => {
    const r = resumirSemana(
      [sessao(null, new Date(2026, 9, 5, 9), 5), sessao("infra", new Date(2026, 9, 5, 15), 1)],
      SEGUNDA,
    );
    expect(r.linhas.map((l) => l.projeto)).toEqual(["infra", null]);
  });
});

describe("formatos", () => {
  it("mostra horas e minutos, e horas decimais com vírgula", () => {
    expect(horasMinutos(65 * 60_000)).toBe("1:05");
    expect(horasMinutos(0)).toBe("");
    expect(horasDecimais(1.5 * H)).toBe("1,50");
  });

  it("monta o CSV com cabeçalho, projetos e total", () => {
    const r = resumirSemana([sessao("infra; rede", new Date(2026, 9, 5, 9), 1.5)], SEGUNDA);
    const linhas = tabelaSemana(r, ";").split("\r\n");
    expect(linhas[0]).toBe("Projeto;Código;Seg 05/10;Ter 06/10;Qua 07/10;Qui 08/10;Sex 09/10;Sáb 10/10;Dom 11/10;Total");
    expect(linhas[1]).toBe('"infra; rede";"C-infra; rede";1,50;0,00;0,00;0,00;0,00;0,00;0,00;1,50');
    expect(linhas[2]).toBe("Total;;1,50;0,00;0,00;0,00;0,00;0,00;0,00;1,50");
  });
});
