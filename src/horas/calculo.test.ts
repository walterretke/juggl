import { describe, expect, it } from "vitest";
import {
  arredondar,
  horasDecimais,
  horasMinutos,
  inicioDaSemana,
  interpretarDuracao,
  resumirSemana,
  sessoesDaCelula,
  tabelaLinhas,
  tabelaSemana,
  type Sessao,
} from "./calculo";

// Semana de segunda 5 a domingo 11 de outubro de 2026 (hora local).
const SEGUNDA = new Date(2026, 9, 5);
const H = 3_600_000;

function sessao(projeto: string | null, inicio: Date, horas: number, itemId = "i1"): Sessao {
  return {
    id: `${itemId}-${inicio.getTime()}`,
    tipo: "foco",
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

describe("lançamentos à mão", () => {
  it("sem item, viram uma linha pela descrição dentro do projeto", () => {
    const reuniao = { ...sessao("infra", new Date(2026, 9, 5, 14), 1), itemId: null, titulo: "Reunião", tipo: "manual" as const };
    const r = resumirSemana([reuniao, { ...reuniao, id: "outra", inicio: new Date(2026, 9, 6, 14), fim: new Date(2026, 9, 6, 15) }], SEGUNDA);
    expect(r.linhas[0].itens).toHaveLength(1);
    expect(r.linhas[0].itens[0]).toMatchObject({ itemId: "manual:reunião", titulo: "Reunião", total: 2 * H });
  });

  it("acha as sessões de uma célula", () => {
    const s = [
      sessao("infra", new Date(2026, 9, 5, 9), 1, "a"),
      sessao("infra", new Date(2026, 9, 5, 15), 1, "b"),
      sessao("infra", new Date(2026, 9, 6, 9), 1, "a"),
      sessao("portal", new Date(2026, 9, 5, 9), 1, "c"),
    ];
    expect(sessoesDaCelula(s, SEGUNDA, 0, "infra", null).map((x) => x.itemId)).toEqual(["a", "b"]);
    expect(sessoesDaCelula(s, SEGUNDA, 0, "infra", "a")).toHaveLength(1);
  });
});

describe("interpretarDuracao", () => {
  const MIN = 60_000;
  it.each([
    ["1h30", 90],
    ["1h", 60],
    ["2h05min", 125],
    ["45min", 45],
    ["45m", 45],
    ["1:30", 90],
    ["1,5", 90],
    ["0.25", 15],
    ["90", 90],
    ["2", 120],
  ])("%s", (texto, minutos) => expect(interpretarDuracao(texto)).toBe(minutos * MIN));

  it("recusa o que não entende", () => {
    expect(interpretarDuracao("")).toBeNull();
    expect(interpretarDuracao("abc")).toBeNull();
    expect(interpretarDuracao("0")).toBeNull();
    expect(interpretarDuracao("30h")).toBeNull();
  });
});

describe("formato do apontamento", () => {
  it("arredonda para o passo mais próximo, nunca para zero", () => {
    expect(arredondar(22 * 60_000, 15)).toBe(15 * 60_000);
    expect(arredondar(23 * 60_000, 15)).toBe(30 * 60_000);
    expect(arredondar(3 * 60_000, 15)).toBe(15 * 60_000);
    expect(arredondar(7 * 60_000, 0)).toBe(7 * 60_000);
  });

  it("uma linha por dia e projeto", () => {
    const r = resumirSemana(
      [sessao("infra", new Date(2026, 9, 5, 9), 1.1), sessao("portal", new Date(2026, 9, 7, 9), 0.5, "i2")],
      SEGUNDA,
    );
    expect(tabelaLinhas(r, ";", 30).split("\r\n")).toEqual([
      "Data;Código;Projeto;Horas",
      "05/10/2026;C-infra;infra;1,00",
      "07/10/2026;C-portal;portal;0,50",
    ]);
  });

  it("o total da semana soma as células arredondadas", () => {
    const r = resumirSemana([sessao("infra", new Date(2026, 9, 5, 9), 0.2), sessao("infra", new Date(2026, 9, 6, 9), 0.2)], SEGUNDA);
    const linhas = tabelaSemana(r, ";", 15).split("\r\n");
    const total = linhas[linhas.length - 1];
    expect(total).toBe("Total;;0,25;0,25;0,00;0,00;0,00;0,00;0,00;0,50");
  });
});
