import { describe, expect, it } from "vitest";
import { item } from "../teste/item";
import { resumoParaPessoa, statusParaResponder } from "./resumo";

describe("resumoParaPessoa", () => {
  it("lista cada pedido com status e data prometida", () => {
    const texto = resumoParaPessoa(
      "Carlos",
      [
        item("Relatório de acessos", { status: "em_foco", prometido_para: "2026-10-09" }),
        item("Revisar runbook", { prometido_para: "2026-10-05" }),
        item("Liberar VPN", { status: "inbox" }),
        item("Ajustar deploy", { status: "feito", atualizado_em: "2026-10-08T15:00:00.000Z" }),
      ],
      new Date(2026, 9, 9, 9),
    );
    expect(texto).toBe(
      [
        "Carlos, segue como estão seus pedidos:",
        "- Relatório de acessos: fazendo agora, previsto para hoje",
        "- Revisar runbook: na fila, previsto para 05/10",
        "- Liberar VPN: anotado, ainda não comecei",
        "- Ajustar deploy: concluído em 08/10",
      ].join("\n"),
    );
  });
});

describe("statusParaResponder", () => {
  const hoje = new Date(2026, 9, 9, 9);
  it("cumprimenta quem pediu e diz o status com a previsão", () => {
    expect(statusParaResponder(item("Relatório", { pessoa: "Carla_Dias", status: "pausado", prometido_para: "2026-10-09" }), hoje)).toBe(
      "Oi, Carla Dias! Relatório: comecei, está pausado, previsto para hoje.",
    );
  });
  it("diz de quem está esperando retorno", () => {
    expect(statusParaResponder(item("VPN", { status: "aguardando", aguardando_quem: "redes" }), hoje)).toBe(
      "VPN: aguardando retorno de redes.",
    );
  });
});
