import { describe, expect, it } from "vitest";
import { item } from "../teste/item";
import {
  aconteceEm,
  arrumarBlocos,
  descreverRepeticao,
  diasDoMes,
  inicioDaSemana,
  ocorrenciasDasTarefas,
  ocorrenciasDosCompromissos,
  tituloDoPeriodo,
  type Compromisso,
} from "./agenda";

function compromisso(extra: Partial<Compromisso> = {}): Compromisso {
  return {
    id: "c",
    titulo: "Academia",
    nota: null,
    data: "2026-10-12", // segunda
    hora_inicio: "18:00",
    hora_fim: "19:00",
    repete: "nao",
    dias_semana: null,
    ate: null,
    excecoes: null,
    ...extra,
  };
}

describe("aconteceEm", () => {
  it("único: só no dia", () => {
    expect(aconteceEm(compromisso(), "2026-10-12")).toBe(true);
    expect(aconteceEm(compromisso(), "2026-10-19")).toBe(false);
  });

  it("semanal nos dias escolhidos, a partir da data e até o fim", () => {
    const c = compromisso({ repete: "semanal", dias_semana: "1,3", ate: "2026-10-31" });
    expect(aconteceEm(c, "2026-10-14")).toBe(true); // quarta
    expect(aconteceEm(c, "2026-10-13")).toBe(false); // terça
    expect(aconteceEm(c, "2026-10-05")).toBe(false); // antes de começar
    expect(aconteceEm(c, "2026-11-02")).toBe(false); // depois do fim
  });

  it("semanal sem dias usa o dia da semana da data; exceções pulam", () => {
    const c = compromisso({ repete: "semanal", excecoes: "2026-10-19" });
    expect(aconteceEm(c, "2026-10-26")).toBe(true);
    expect(aconteceEm(c, "2026-10-19")).toBe(false);
  });

  it("dias úteis e mensal (dia 31 vira o último dia)", () => {
    expect(aconteceEm(compromisso({ repete: "dias_uteis" }), "2026-10-17")).toBe(false); // sábado
    const mensal = compromisso({ repete: "mensal", data: "2026-10-31" });
    expect(aconteceEm(mensal, "2026-11-30")).toBe(true);
    expect(aconteceEm(mensal, "2026-11-29")).toBe(false);
  });
});

describe("ocorrências", () => {
  it("compromisso repetido vira uma ocorrência por dia, marcada como recorrente", () => {
    const lista = ocorrenciasDosCompromissos([compromisso({ repete: "diaria" })], "2026-10-12", "2026-10-14");
    expect(lista.map((o) => o.dia)).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
    expect(lista[0]).toMatchObject({ inicio: 18 * 60, fim: 19 * 60, recorrente: true });
  });

  it("tarefa com horário fica no horário; sem horário, no dia planejado ou no prazo", () => {
    const lista = ocorrenciasDasTarefas(
      [
        item("a", { agenda_inicio: "2026-10-13T09:30", agenda_fim: "2026-10-13T10:00" }),
        item("b", { prazo: "2026-10-14" }),
        item("c", { prazo: "2026-10-20", dia_planejado: "2026-10-13" }),
        item("d", { prazo: "2026-11-01" }),
      ],
      "2026-10-12",
      "2026-10-18",
    );
    expect(lista.map((o) => [o.chave, o.dia, o.inicio, o.fim])).toEqual([
      ["a", "2026-10-13", 570, 600],
      ["b", "2026-10-14", null, null],
      ["c", "2026-10-13", null, null],
    ]);
  });
});

describe("arrumarBlocos", () => {
  it("blocos que se cruzam dividem a largura; os separados ficam inteiros", () => {
    const [a, b, c] = ocorrenciasDosCompromissos(
      [
        compromisso({ id: "a", hora_inicio: "09:00", hora_fim: "10:00" }),
        compromisso({ id: "b", hora_inicio: "09:30", hora_fim: "10:30" }),
        compromisso({ id: "c", hora_inicio: "11:00", hora_fim: "12:00" }),
      ],
      "2026-10-12",
      "2026-10-12",
    );
    const pos = arrumarBlocos([a, b, c]);
    expect(pos.map((p) => [p.ocorrencia.chave.split("@")[0], p.coluna, p.colunas])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 0, 1],
    ]);
  });
});

describe("datas da agenda", () => {
  it("semana começa na segunda e o mês mostra 6 semanas", () => {
    expect(inicioDaSemana("2026-10-18")).toBe("2026-10-12");
    const dias = diasDoMes("2026-10-13");
    expect(dias).toHaveLength(42);
    expect(dias[0]).toBe("2026-09-28");
  });

  it("títulos e repetição em português", () => {
    expect(tituloDoPeriodo("mes", "2026-10-13")).toBe("outubro de 2026");
    expect(tituloDoPeriodo("semana", "2026-10-13")).toBe("12 a 18 de outubro");
    expect(tituloDoPeriodo("dia", "2026-10-13")).toBe("terça, 13 de outubro");
    expect(descreverRepeticao({ repete: "semanal", dias_semana: "3,1", data: "2026-10-12" })).toBe("toda segunda e quarta");
  });
});
