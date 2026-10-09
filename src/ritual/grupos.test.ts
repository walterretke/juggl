import { describe, expect, it } from "vitest";
import { item } from "../teste/item";
import { gruposDoRitual } from "./grupos";

const HOJE = new Date(2026, 9, 9, 8); // sexta 09/10/2026

describe("gruposDoRitual", () => {
  it("põe cada item num grupo só, na ordem de importância", () => {
    const grupos = gruposDoRitual(
      [
        item("resto"),
        item("caixa", { status: "inbox" }),
        item("pausado", { status: "pausado" }),
        item("cobrado", { cobrancas: 2, status: "pausado" }),
        item("amanha", { prazo: "2026-10-10", cobrancas: 1 }),
        item("atrasado", { prometido_para: "2026-10-07" }),
        item("semana-que-vem", { prazo: "2026-10-16" }),
      ],
      HOJE,
    );
    expect(grupos.map((g) => [g.chave, g.itens.map((i) => i.id)])).toEqual([
      ["urgentes", ["atrasado", "amanha"]],
      ["cobrados", ["cobrado"]],
      ["pausados", ["pausado"]],
      ["a_fazer", ["resto", "semana-que-vem"]],
      ["inbox", ["caixa"]],
    ]);
  });

  it("ordena quem cobrou mais primeiro e some com grupos vazios", () => {
    const grupos = gruposDoRitual([item("uma", { cobrancas: 1 }), item("tres", { cobrancas: 3 })], HOJE);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].itens.map((i) => i.id)).toEqual(["tres", "uma"]);
  });
});
