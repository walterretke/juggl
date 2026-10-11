import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

/** Rótulo da mini-janela de foco (também listado em src-tauri/capabilities/default.json). */
export const JANELA_MINI = "mini";

/**
 * Abre a mini-janela de foco: uma faixa sempre por cima, com o item em foco, o timer
 * e Pausar, para quando a janela principal está atrás do Teams. Se já existe, traz.
 */
export async function abrirMiniJanela(): Promise<void> {
  const existente = await WebviewWindow.getByLabel(JANELA_MINI);
  if (existente) {
    await existente.show();
    await existente.setFocus();
    return;
  }
  const janela = new WebviewWindow(JANELA_MINI, {
    url: "index.html",
    title: "Juggl: foco",
    width: 360,
    height: 56,
    minWidth: 260,
    minHeight: 56,
    resizable: true,
    decorations: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    shadow: true,
  });
  await new Promise<void>((pronto, falhou) => {
    janela.once("tauri://created", () => pronto());
    janela.once("tauri://error", (e) => falhou(new Error(String(e.payload))));
  });
}
