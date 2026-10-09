import { describe, expect, it } from "vitest";
import { resolverTitulo, tituloPadrao } from "./titulo";

describe("resolverTitulo", () => {
  it("usa o título digitado", () => {
    expect(resolverTitulo(" Relatório de acessos ", "texto", 3)).toEqual({ titulo: "Relatório de acessos", usouPadrao: false });
  });

  it("título vazio com descrição vira Atividade N", () => {
    expect(resolverTitulo("", "mensagem do Teams", 3)).toEqual({ titulo: "Atividade 3", usouPadrao: true });
  });

  it("manter o título sugerido também avança o contador", () => {
    expect(resolverTitulo(tituloPadrao(7), "texto", 7)).toEqual({ titulo: "Atividade 7", usouPadrao: true });
  });

  it("sem título nem descrição não salva", () => {
    expect(resolverTitulo("  ", " ", 1)).toBeNull();
  });
});
