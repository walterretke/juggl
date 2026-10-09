import { describe, expect, it } from "vitest";
import { interpretarPrazo, nomeParaMarcacao, normalizarNome, parseCaptura } from "./parser";

// Quinta-feira, 8 de outubro de 2026, 14h (hora local).
const HOJE = new Date(2026, 9, 8, 14, 0);

describe("parseCaptura", () => {
  it("separa todas as marcações do título", () => {
    expect(parseCaptura("@carlos relatório de acessos #migracao !alta >sexta", HOJE)).toEqual({
      titulo: "relatório de acessos",
      pessoa: "carlos",
      projeto: "migracao",
      prioridade: "alta",
      prazo: "2026-10-09",
      link: null,
      origem: "manual",
      idExterno: null,
    });
  });

  it("aceita acentos em @ e #", () => {
    const c = parseCaptura("revisar @João #integração", HOJE);
    expect(c.pessoa).toBe("João");
    expect(c.projeto).toBe("integração");
    expect(c.titulo).toBe("revisar");
  });

  it("não confunde e-mail com @pessoa", () => {
    const c = parseCaptura("responder joao@empresa.com hoje", HOJE);
    expect(c.pessoa).toBeNull();
    expect(c.titulo).toBe("responder joao@empresa.com hoje");
  });

  it("tira pontuação colada na marcação", () => {
    const c = parseCaptura("pedido do @carlos, urgente", HOJE);
    expect(c.pessoa).toBe("carlos");
    expect(c.titulo).toBe("pedido do urgente");
  });

  it("usa a primeira marcação de cada tipo e deixa as outras no título", () => {
    const c = parseCaptura("@ana falar com @bruno #a #b", HOJE);
    expect(c.pessoa).toBe("ana");
    expect(c.projeto).toBe("a");
    expect(c.titulo).toBe("falar com @bruno #b");
  });

  it("mantém no título marcações que não são reconhecidas", () => {
    const c = parseCaptura("ver !urgente > depois >ontem", HOJE);
    expect(c.prioridade).toBeNull();
    expect(c.prazo).toBeNull();
    expect(c.titulo).toBe("ver !urgente > depois >ontem");
  });

  it("aceita prioridade com e sem acento", () => {
    expect(parseCaptura("x !média", HOJE).prioridade).toBe("media");
    expect(parseCaptura("x !BAIXA", HOJE).prioridade).toBe("baixa");
  });

  it("anexa o link da área de transferência e reconhece a origem", () => {
    const c = parseCaptura("ver chamado", HOJE, "https://empresa.service-now.com/incident.do?sysparm_query=number=INC0012345");
    expect(c.origem).toBe("servicenow");
    expect(c.idExterno).toBe("INC0012345");
  });

  it("prefere a URL digitada ao link da área de transferência", () => {
    const c = parseCaptura(
      "olhar https://empresa.atlassian.net/browse/OPS-42 hoje",
      HOJE,
      "https://dev.azure.com/org/proj/_workitems/edit/7",
    );
    expect(c.origem).toBe("jira");
    expect(c.idExterno).toBe("OPS-42");
    expect(c.titulo).toBe("olhar hoje");
  });

  it("guarda URL desconhecida digitada no texto como origem manual", () => {
    const c = parseCaptura("ler https://exemplo.com/doc", HOJE);
    expect(c.link).toBe("https://exemplo.com/doc");
    expect(c.origem).toBe("manual");
  });

  it("devolve título vazio quando só há marcações", () => {
    expect(parseCaptura("@carlos !alta", HOJE).titulo).toBe("");
  });
});

describe("interpretarPrazo", () => {
  it.each([
    ["hoje", "2026-10-08"],
    ["amanha", "2026-10-09"],
    ["amanhã", "2026-10-09"],
    ["quinta", "2026-10-08"], // hoje é quinta
    ["sexta", "2026-10-09"],
    ["sex", "2026-10-09"],
    ["segunda", "2026-10-12"],
    ["quarta", "2026-10-14"], // já passou nesta semana
    ["sábado", "2026-10-10"],
    ["15/10", "2026-10-15"],
    ["8/10", "2026-10-08"],
    ["7/10", "2027-10-07"], // já passou, vai para o ano que vem
    ["15/10/27", "2027-10-15"],
    ["1/2/2026", "2026-02-01"], // ano explícito no passado é respeitado
  ])(">%s vira %s", (texto, esperado) => {
    expect(interpretarPrazo(texto, HOJE)).toBe(esperado);
  });

  it.each(["31/02", "32/10", "10/13", "ontem", ""])("rejeita >%s", (texto) => {
    expect(interpretarPrazo(texto, HOJE)).toBeNull();
  });

  it("vira o ano em dezembro", () => {
    expect(interpretarPrazo("5/1", new Date(2026, 11, 20))).toBe("2027-01-05");
  });
});

describe("prioridades personalizadas", () => {
  const minhas = [
    { id: "p1", nome: "Urgente" },
    { id: "p2", nome: "Pode esperar" },
  ];
  it("reconhece pelo nome, sem espaço nem acento", () => {
    expect(parseCaptura("x !urgente", HOJE, null, minhas).prioridade).toBe("p1");
    expect(parseCaptura("x !podeesperar", HOJE, null, minhas).prioridade).toBe("p2");
  });
  it("deixa no título uma prioridade que não existe", () => {
    const c = parseCaptura("x !alta", HOJE, null, minhas);
    expect(c.prioridade).toBeNull();
    expect(c.titulo).toBe("x !alta");
  });
});

describe("nomes com espaço", () => {
  it("normaliza nome com espaço e com _ para o mesmo valor", () => {
    expect(normalizarNome("Carla Dias")).toBe(normalizarNome("carla_dias"));
    expect(normalizarNome("Migração")).toBe("migracao");
  });
  it("escreve nome com espaço como marcação e o parser lê inteiro", () => {
    const c = parseCaptura(`x @${nomeParaMarcacao("Carla Dias")}`, HOJE);
    expect(c.pessoa).toBe("Carla_Dias");
    expect(c.titulo).toBe("x");
  });
});
