type TeclaPressionada = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

const MODIFICADORES = ["Control", "Shift", "Alt", "Meta"];

/** Converte uma tecla pressionada no formato do plugin de atalho global (ex.: "Ctrl+Shift+Space"). */
export function atalhoDoEvento(e: TeclaPressionada): string | null {
  if (MODIFICADORES.includes(e.key)) return null;
  const partes: string[] = [];
  if (e.ctrlKey) partes.push("Ctrl");
  if (e.altKey) partes.push("Alt");
  if (e.shiftKey) partes.push("Shift");
  if (e.metaKey) partes.push("Super");
  if (partes.length === 0) return null; // atalho global sem modificador atrapalharia a digitação
  const tecla = e.code.replace(/^Key/, "").replace(/^Digit/, "");
  return [...partes, tecla].join("+");
}
