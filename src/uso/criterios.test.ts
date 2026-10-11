import { describe, expect, it } from "vitest";
import { diasUteisDoPeriodo, listaDeIrritacoes, resumirPeriodo } from "./criterios";

describe("período de uso real", () => {
  it("tem 20 dias úteis, pulando fins de semana", () => {
    const dias = diasUteisDoPeriodo("2026-10-10"); // sábado
    expect(dias).toHaveLength(20);
    expect(dias[0]).toBe("2026-10-12"); // segunda
    expect(dias[19]).toBe("2026-11-06"); // sexta, quatro semanas depois
    expect(dias).not.toContain("2026-10-17");
  });

  it("conta dias usados e rituais só nos dias úteis até hoje", () => {
    const dias = [
      { dia: "2026-10-12", ritual: true },
      { dia: "2026-10-13", ritual: false },
      { dia: "2026-10-17", ritual: true }, // sábado não conta
      { dia: "2026-10-20", ritual: true }, // futuro não conta
    ];
    const r = resumirPeriodo("2026-10-12", dias, new Date(2026, 9, 15, 9));
    expect(r).toMatchObject({ decorridos: 4, usados: 2, rituais: 1, metaPossivel: true, terminou: false, fim: "2026-11-06" });
  });

  it("avisa quando 18 de 20 não dá mais", () => {
    const r = resumirPeriodo("2026-10-12", [], new Date(2026, 9, 14, 9)); // 3 dias sem uso
    expect(r.metaPossivel).toBe(false);
  });

  it("lista do que irrita para colar", () => {
    const texto = listaDeIrritacoes([
      { texto: "Captura some quando troco de janela", tela: "Captura", criada_em: "2026-10-12T14:00:00.000Z" },
    ]);
    expect(texto).toBe("- Captura some quando troco de janela (12/10, Captura)");
  });
});
