import { describe, expect, it } from "vitest";
import { item } from "../teste/item";
import { diaUtilAnterior, resumoDaDaily } from "./daily";

describe("diaUtilAnterior", () => {
  it("na segunda volta para a sexta", () => {
    expect(diaUtilAnterior(new Date(2026, 9, 12, 9))).toEqual(new Date(2026, 9, 9));
  });
  it("na quarta é ontem", () => {
    expect(diaUtilAnterior(new Date(2026, 9, 14, 9))).toEqual(new Date(2026, 9, 13));
  });
});

describe("resumoDaDaily", () => {
  const quarta = new Date(2026, 9, 14, 9);
  it("monta ontem, hoje e bloqueios", () => {
    const texto = resumoDaDaily(
      {
        ontem: [item("Ajustar deploy")],
        abertos: [
          item("Relatório", { status: "em_foco" }),
          item("Query", { dia_planejado: "2026-10-14" }),
          item("Outro", { prazo: "2026-10-14" }),
        ],
        aguardando: [item("VPN", { status: "aguardando", aguardando_quem: "redes" })],
      },
      quarta,
    );
    expect(texto).toBe(
      ["Ontem:", "- Ajustar deploy", "Hoje:", "- Relatório (em andamento)", "- Query", "Bloqueios:", "- VPN: aguardando redes"].join("\n"),
    );
  });

  it("sem plano, usa o que vence hoje; na segunda fala da sexta", () => {
    const segunda = new Date(2026, 9, 12, 9);
    const texto = resumoDaDaily({ ontem: [], abertos: [item("Prazo", { prazo: "2026-10-12" })], aguardando: [] }, segunda);
    expect(texto).toBe(["Sexta:", "- nada concluído", "Hoje:", "- Prazo", "Bloqueios:", "- nenhum"].join("\n"));
  });
});
