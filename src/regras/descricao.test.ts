import { describe, expect, it } from "vitest";
import { descreverPersonalizada } from "./descricao";
import type { Regra } from "./motor";

const nomes = {
  pessoas: new Map([["p1", "Carlos"]]),
  projetos: new Map([["j1", "migracao"]]),
  prioridades: new Map<string, string>(),
};

function regra(condicao: Regra["condicao"], acao: Regra["acao"] = { tipo: "notificar" }): Regra {
  return { id: "r", nome: "r", tipo: "personalizada", condicao, acao, ativa: true, urgente: false, ordem: 0 };
}

describe("descreverPersonalizada", () => {
  it("monta a frase como os exemplos do PDF", () => {
    expect(descreverPersonalizada(regra({ pessoa_id: "p1", parado_dias: 1 }), nomes)).toBe(
      "Se quem pediu for Carlos e estiver parado há 1 dia ou mais, notificar.",
    );
    expect(descreverPersonalizada(regra({ projeto_id: "j1", prazo: "hoje" }, { tipo: "do_dia" }), nomes)).toBe(
      "Se o projeto for migracao e o prazo for hoje, colocar entre as do dia.",
    );
  });

  it("sem condição avisa que não dispara", () => {
    expect(descreverPersonalizada(regra({}), nomes)).toBe("Sem condição: não dispara.");
  });
});
