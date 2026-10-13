import { describe, expect, it } from "vitest";
import { deveMostrarBoasVindas, ehMac } from "./boasVindas";

describe("deveMostrarBoasVindas", () => {
  it("mostra na primeira abertura, com o banco vazio", () => {
    expect(deveMostrarBoasVindas({ vistas: false, itens: 0, diasAntesDeHoje: 0 })).toBe(true);
  });

  it("não mostra de novo depois de vistas", () => {
    expect(deveMostrarBoasVindas({ vistas: true, itens: 0, diasAntesDeHoje: 0 })).toBe(false);
  });

  it("não mostra para quem já tinha itens", () => {
    expect(deveMostrarBoasVindas({ vistas: false, itens: 3, diasAntesDeHoje: 0 })).toBe(false);
  });

  it("não mostra para quem já abriu o app em outro dia", () => {
    expect(deveMostrarBoasVindas({ vistas: false, itens: 0, diasAntesDeHoje: 2 })).toBe(false);
  });
});

describe("ehMac", () => {
  it("reconhece o macOS pelo navegador", () => {
    expect(ehMac("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15")).toBe(true);
    expect(ehMac("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
    expect(ehMac("Mozilla/5.0 (X11; Linux x86_64)")).toBe(false);
  });
});
