import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { currentMonitor, primaryMonitor } from "@tauri-apps/api/window";

/** Rótulo do overlay de foco (também listado em src-tauri/capabilities/default.json). */
export const JANELA_MINI = "mini";

export const LARGURA_OVERLAY = 380;
export const ALTURA_OVERLAY = 52;
/** Com a mensagem de encerramento aberta. */
export const ALTURA_OVERLAY_ENCERRANDO = 168;
const MARGEM = 20;

/** Canto inferior direito da área útil da tela (sem a barra de tarefas), em pixels lógicos. */
async function cantoDaTela(): Promise<{ x: number; y: number } | null> {
  const monitor = (await currentMonitor().catch(() => null)) ?? (await primaryMonitor().catch(() => null));
  if (!monitor) return null;
  const area = monitor.workArea ?? { position: monitor.position, size: monitor.size };
  const posicao = area.position.toLogical(monitor.scaleFactor);
  const tamanho = area.size.toLogical(monitor.scaleFactor);
  return {
    x: Math.round(posicao.x + tamanho.width - LARGURA_OVERLAY - MARGEM),
    y: Math.round(posicao.y + tamanho.height - ALTURA_OVERLAY - MARGEM),
  };
}

/**
 * Abre o overlay de foco: uma faixa discreta, sempre por cima, no canto da tela, com a
 * tarefa em foco, o timer, pausar, finalizar e cancelar. Se já existe, só mostra.
 */
export async function abrirMiniJanela(): Promise<void> {
  const existente = await WebviewWindow.getByLabel(JANELA_MINI);
  if (existente) {
    await existente.show();
    return;
  }
  const canto = await cantoDaTela();
  const janela = new WebviewWindow(JANELA_MINI, {
    url: "index.html",
    title: "Juggl: foco",
    width: LARGURA_OVERLAY,
    height: ALTURA_OVERLAY,
    minWidth: 260,
    minHeight: ALTURA_OVERLAY,
    ...(canto ?? { center: true }),
    resizable: false,
    decorations: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focus: false,
    shadow: false,
  });
  await new Promise<void>((pronto, falhou) => {
    janela.once("tauri://created", () => pronto());
    janela.once("tauri://error", (e) => falhou(new Error(String(e.payload))));
  });
}

export async function fecharMiniJanela(): Promise<void> {
  const janela = await WebviewWindow.getByLabel(JANELA_MINI);
  await janela?.close();
}
