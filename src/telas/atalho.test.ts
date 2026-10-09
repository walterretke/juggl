import { describe, expect, it } from "vitest";
import { atalhoDoEvento } from "./atalho";

const tecla = (code: string, key: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>>) => ({
  code,
  key,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe("atalhoDoEvento", () => {
  it("monta a combinação no formato do plugin", () => {
    expect(atalhoDoEvento(tecla("Space", " ", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+Space");
    expect(atalhoDoEvento(tecla("KeyJ", "J", { ctrlKey: true, altKey: true }))).toBe("Ctrl+Alt+J");
    expect(atalhoDoEvento(tecla("Digit1", "!", { metaKey: true, shiftKey: true }))).toBe("Shift+Super+1");
    expect(atalhoDoEvento(tecla("F9", "F9", { altKey: true }))).toBe("Alt+F9");
  });

  it("espera a tecla principal enquanto só há modificadores", () => {
    expect(atalhoDoEvento(tecla("ShiftLeft", "Shift", { shiftKey: true }))).toBeNull();
  });

  it("recusa tecla sem modificador", () => {
    expect(atalhoDoEvento(tecla("KeyA", "a", {}))).toBeNull();
  });
});
