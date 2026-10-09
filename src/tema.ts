import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { gravarConfig, lerConfig } from "./db/config";

export type Tema = "sistema" | "claro" | "escuro";

export const NOME_TEMA: Record<Tema, string> = { sistema: "Igual ao sistema", claro: "Claro", escuro: "Escuro" };

const EVENTO = "tema:alterado";

function ehTema(valor: unknown): valor is Tema {
  return valor === "sistema" || valor === "claro" || valor === "escuro";
}

/** Troca as cores da página (data-tema no <html>) e a barra de título da janela. */
function aplicar(tema: Tema) {
  const raiz = document.documentElement;
  if (tema === "sistema") delete raiz.dataset.tema;
  else raiz.dataset.tema = tema;
  getCurrentWindow()
    .setTheme(tema === "sistema" ? null : tema === "claro" ? "light" : "dark")
    .catch(() => {}); // sem suporte no sistema: as cores da página já bastam
}

export async function lerTema(): Promise<Tema> {
  const salvo = await lerConfig("tema").catch(() => null);
  return ehTema(salvo) ? salvo : "sistema";
}

/** Aplica o tema salvo nesta janela e acompanha as trocas feitas em qualquer janela. */
export function iniciarTema() {
  lerTema().then(aplicar);
  listen<Tema>(EVENTO, (e) => ehTema(e.payload) && aplicar(e.payload));
}

export async function escolherTema(tema: Tema) {
  await gravarConfig("tema", tema);
  await emit(EVENTO, tema);
}
