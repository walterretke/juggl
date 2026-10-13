import { describe, expect, it } from "vitest";
import { gerarRuido } from "./ruido";

/** Gerador previsível (LCG) para o teste. */
function sementes(semente = 1) {
  let x = semente;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

describe("gerarRuido", () => {
  it.each(["branco", "rosa", "marrom"] as const)("%s fica dentro de -1 a 1 e não é silêncio", (tipo) => {
    const amostras = gerarRuido(tipo, 44100, sementes());
    const pico = amostras.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(pico).toBeLessThanOrEqual(1);
    expect(pico).toBeGreaterThan(0.05);
  });

  it("o marrom muda devagar (mais grave que o branco)", () => {
    const variacao = (a: Float32Array) => a.slice(1).reduce((s, v, i) => s + Math.abs(v - a[i]), 0) / a.length;
    expect(variacao(gerarRuido("marrom", 10000, sementes()))).toBeLessThan(variacao(gerarRuido("branco", 10000, sementes())) / 5);
  });
});
