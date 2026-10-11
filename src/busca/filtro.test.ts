import { describe, expect, it } from "vitest";
import type { ItemBusca } from "../db/itens";
import { filtrarBusca } from "./filtro";

function b(titulo: string, extra: Partial<ItemBusca> = {}): ItemBusca {
  return {
    id: titulo,
    titulo,
    nota: null,
    status: "a_fazer",
    pessoa: null,
    projeto: null,
    link: null,
    id_externo: null,
    atualizado_em: "2026-10-01T10:00:00.000Z",
    ...extra,
  };
}

describe("filtrarBusca", () => {
  const itens = [
    b("Relatório de acessos", { pessoa: "Carlos", status: "feito", atualizado_em: "2026-10-05T10:00:00.000Z" }),
    b("Liberar VPN", { nota: "Pedido do relatório trimestral" }),
    b("Ajustar relatório de vendas", { atualizado_em: "2026-10-03T10:00:00.000Z" }),
    b("Bug no portal", { projeto: "Portal_RH", id_externo: "4821" }),
  ];

  it("ignora acentos e acha em todos os campos", () => {
    expect(filtrarBusca(itens, "relatorio").map((i) => i.id)).toEqual([
      "Ajustar relatório de vendas",
      "Relatório de acessos",
      "Liberar VPN",
    ]);
  });

  it("exige todas as palavras", () => {
    expect(filtrarBusca(itens, "relatório carlos").map((i) => i.id)).toEqual(["Relatório de acessos"]);
  });

  it("acha pelo id externo e pelo projeto com espaço", () => {
    expect(filtrarBusca(itens, "4821")).toHaveLength(1);
    expect(filtrarBusca(itens, "portal rh")).toHaveLength(1);
  });

  it("termo vazio não lista nada", () => {
    expect(filtrarBusca(itens, "  ")).toEqual([]);
  });
});
