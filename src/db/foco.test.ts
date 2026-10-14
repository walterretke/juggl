import { describe, expect, it } from "vitest";
import { statusAoCancelar } from "./foco";

describe("statusAoCancelar", () => {
  it("volta para o status de antes de focar", () => {
    expect(statusAoCancelar("a_fazer")).toBe("a_fazer");
    expect(statusAoCancelar("inbox")).toBe("inbox");
    expect(statusAoCancelar("pausado")).toBe("pausado");
  });

  it("quem esperava alguém volta para A fazer", () => {
    expect(statusAoCancelar("aguardando")).toBe("a_fazer");
  });

  it("sem dado confiável, fica pausado", () => {
    expect(statusAoCancelar(null)).toBe("pausado");
    expect(statusAoCancelar("em_foco")).toBe("pausado");
    expect(statusAoCancelar("qualquer")).toBe("pausado");
  });
});
