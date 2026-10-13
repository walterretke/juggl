import { describe, expect, it } from "vitest";
import { destinoAoRestaurar } from "./restaurar";

describe("destinoAoRestaurar", () => {
  it("volta para a lista em que estava", () => {
    expect(destinoAoRestaurar({ status_anterior: "inbox" })).toBe("inbox");
    expect(destinoAoRestaurar({ status_anterior: "aguardando" })).toBe("aguardando");
    expect(destinoAoRestaurar({ status_anterior: "a_fazer" })).toBe("a_fazer");
  });

  it("em foco, pausada ou sem registro volta para A fazer", () => {
    expect(destinoAoRestaurar({ status_anterior: "em_foco" })).toBe("a_fazer");
    expect(destinoAoRestaurar({ status_anterior: "pausado" })).toBe("a_fazer");
    expect(destinoAoRestaurar({ status_anterior: null })).toBe("a_fazer");
  });
});
