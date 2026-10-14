import { describe, expect, it } from "vitest";
import { analisarMarkdown, analisarTrechos, textoSemMarcacao } from "./markdown";

describe("analisarTrechos", () => {
  it("lê negrito, itálico, tachado e código", () => {
    expect(analisarTrechos("um **forte** e *leve* ~~não~~ `x`")).toEqual([
      { tipo: "texto", texto: "um " },
      { tipo: "negrito", filhos: [{ tipo: "texto", texto: "forte" }] },
      { tipo: "texto", texto: " e " },
      { tipo: "italico", filhos: [{ tipo: "texto", texto: "leve" }] },
      { tipo: "texto", texto: " " },
      { tipo: "tachado", filhos: [{ tipo: "texto", texto: "não" }] },
      { tipo: "texto", texto: " " },
      { tipo: "codigo", texto: "x" },
    ]);
  });

  it("não confunde asterisco solto nem _ no meio de palavra", () => {
    expect(analisarTrechos("2 * 3 * 4")).toEqual([{ tipo: "texto", texto: "2 * 3 * 4" }]);
    expect(analisarTrechos("carla_dias_x")).toEqual([{ tipo: "texto", texto: "carla_dias_x" }]);
  });

  it("lê links http e tira as barras de escape", () => {
    expect(analisarTrechos("[doc](https://a.b/c) \\*ok\\*")).toEqual([
      { tipo: "link", url: "https://a.b/c", filhos: [{ tipo: "texto", texto: "doc" }] },
      { tipo: "texto", texto: " *ok*" },
    ]);
  });
});

describe("analisarMarkdown", () => {
  it("separa parágrafos e mantém as quebras de linha", () => {
    const blocos = analisarMarkdown("linha 1\nlinha 2\n\noutro");
    expect(blocos).toHaveLength(2);
    expect(blocos[0]).toMatchObject({ tipo: "paragrafo", linhas: [[{ texto: "linha 1" }], [{ texto: "linha 2" }]] });
  });

  it("lê listas com marcador, numeradas e com recuo", () => {
    const [lista, numerada] = analisarMarkdown("- a\n  - b\n\n3. c\n4. d");
    expect(lista).toMatchObject({ tipo: "lista", numerada: false, itens: [{ nivel: 0 }, { nivel: 1 }] });
    expect(numerada).toMatchObject({ tipo: "lista", numerada: true, inicio: 3 });
  });

  it("textoSemMarcacao junta tudo numa linha", () => {
    expect(textoSemMarcacao("**Oi**\n- um\n- dois")).toBe("Oi um; dois");
  });
});
