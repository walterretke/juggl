import { describe, expect, it } from "vitest";
import { htmlParaTexto, idExterno, normalizarOrganizacao, novos, paraCaptura, type ItemDevops } from "./devops";

const ITEM: ItemDevops = {
  id: 42,
  titulo: "Liberar VPN",
  tipo: "Task",
  estado: "Active",
  projeto: "Infra TI",
  criado_por: "Carlos Souza",
  descricao: "<div>Precisa até sexta.</div><div><br></div><ul><li>usuário: joao</li></ul>",
  prazo: "2026-10-15T03:00:00Z",
  link: "https://dev.azure.com/empresa/Infra%20TI/_workitems/edit/42",
};

describe("Azure DevOps", () => {
  it("aceita o nome da organização ou o endereço colado", () => {
    expect(normalizarOrganizacao(" empresa ")).toBe("empresa");
    expect(normalizarOrganizacao("https://dev.azure.com/empresa/Infra%20TI/_workitems")).toBe("empresa");
    expect(normalizarOrganizacao("dev.azure.com/Minha%20Org")).toBe("Minha Org");
    expect(normalizarOrganizacao("https://empresa.visualstudio.com/Projeto")).toBe("empresa");
  });

  it("descrição em HTML vira texto com quebras", () => {
    expect(htmlParaTexto("<p>Oi&nbsp;Carlos &amp; Ana</p><p>linha&#33;</p>")).toBe("Oi Carlos & Ana\nlinha!");
    expect(htmlParaTexto(ITEM.descricao!)).toBe("Precisa até sexta.\n\n• usuário: joao");
  });

  it("work item vira captura da caixa de entrada", () => {
    const { captura, descricao } = paraCaptura(ITEM, "empresa");
    expect(captura).toMatchObject({
      titulo: "Liberar VPN",
      pessoa: "Carlos Souza",
      projeto: "Infra TI",
      origem: "devops",
      idExterno: "empresa/42",
      link: ITEM.link,
    });
    expect(captura.prazo).toMatch(/^2026-10-1[45]$/); // depende do fuso de quem roda o teste
    expect(descricao).toBe("Task · #42 · Active\n\nPrecisa até sexta.\n\n• usuário: joao");
  });

  it("só traz o que ainda não existe, mesmo que tenha sido arquivado", () => {
    const outro = { ...ITEM, id: 43 };
    expect(novos([ITEM, outro], "Empresa", new Set([idExterno("empresa", 42)])).map((i) => i.id)).toEqual([43]);
  });
});
