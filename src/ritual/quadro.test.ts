import { describe, expect, it } from "vitest";
import { item } from "../teste/item";
import { montarQuadro, proximoQuando, quandoPadrao } from "./quadro";

const SEGUNDA_9H = new Date(2026, 9, 12, 9, 0);

describe("montarQuadro", () => {
  it("separa caixa de entrada, Hoje, foco e Depois", () => {
    const quadro = montarQuadro(
      [
        item("novo", { status: "inbox" }),
        item("tarde", { dia_planejado: "2026-10-12", quando: "tarde" }),
        item("manha", { dia_planejado: "2026-10-12", quando: "manha" }),
        item("foco", { status: "em_foco", dia_planejado: "2026-10-12", quando: "depois_daily" }),
        item("ontem", { dia_planejado: "2026-10-11" }),
        item("pausado", { status: "pausado" }),
      ],
      SEGUNDA_9H,
    );
    expect(quadro.chegou.map((i) => i.id)).toEqual(["novo"]);
    expect(quadro.hoje.map((i) => i.id)).toEqual(["manha", "foco", "tarde"]);
    expect(quadro.fazendo?.id).toBe("foco");
    expect(quadro.depois.flatMap((g) => g.itens.map((i) => i.id)).sort()).toEqual(["ontem", "pausado"]);
  });

  it("em espera fica só na coluna Em espera, mesmo se era do dia", () => {
    const quadro = montarQuadro(
      [item("aprovacao", { status: "aguardando", dia_planejado: "2026-10-12", espera: "Aguardando aprovação" }), item("resto")],
      SEGUNDA_9H,
    );
    expect(quadro.espera.map((i) => i.id)).toEqual(["aprovacao"]);
    expect(quadro.hoje).toEqual([]);
    expect(quadro.depois.flatMap((g) => g.itens.map((i) => i.id))).toEqual(["resto"]);
  });

  it("item em foco que não é do dia fica só em Fazendo agora", () => {
    const quadro = montarQuadro([item("foco", { status: "em_foco" })], SEGUNDA_9H);
    expect(quadro.fazendo?.id).toBe("foco");
    expect(quadro.hoje).toEqual([]);
    expect(quadro.depois).toEqual([]);
  });

  it("itens de Hoje sem quando vão para o fim", () => {
    const quadro = montarQuadro(
      [item("sem", { dia_planejado: "2026-10-12" }), item("fim", { dia_planejado: "2026-10-12", quando: "fim_dia" })],
      SEGUNDA_9H,
    );
    expect(quadro.hoje.map((i) => i.id)).toEqual(["fim", "sem"]);
  });
});

describe("quando", () => {
  it("padrão pela hora do dia", () => {
    expect(quandoPadrao(SEGUNDA_9H)).toBe("manha");
    expect(quandoPadrao(new Date(2026, 9, 12, 14))).toBe("tarde");
    expect(quandoPadrao(new Date(2026, 9, 12, 18))).toBe("fim_dia");
  });

  it("clique passa para o próximo e volta ao começo", () => {
    expect(proximoQuando(null)).toBe("manha");
    expect(proximoQuando("manha")).toBe("depois_daily");
    expect(proximoQuando("fim_dia")).toBe("manha");
  });
});
