import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalPosition, LogicalSize, type Window } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { formatarCronometro } from "../captura/datas";
import { itemEmFoco, type Foco } from "../db/foco";
import type { Item } from "../db/itens";
import { ALTURA_OVERLAY, ALTURA_OVERLAY_ENCERRANDO, LARGURA_OVERLAY } from "../mini";
import Icone from "./Icone";

/** Traz a janela principal para a frente (ela pode estar escondida na bandeja). */
async function abrirPrincipal() {
  const principal = await WebviewWindow.getByLabel("main");
  await principal?.show();
  await principal?.unminimize();
  await principal?.setFocus();
}

/** Muda a altura mantendo a base no lugar: o overlay fica no canto de baixo e cresce para cima. */
async function redimensionarPelaBase(janela: Window, altura: number) {
  const escala = await janela.scaleFactor();
  const posicao = (await janela.outerPosition()).toLogical(escala);
  const atual = (await janela.innerSize()).toLogical(escala).height;
  if (Math.round(atual) === altura) return;
  await janela.setSize(new LogicalSize(LARGURA_OVERLAY, altura));
  await janela.setPosition(new LogicalPosition(posicao.x, Math.max(0, posicao.y + atual - altura)));
}

/**
 * Overlay de foco: uma faixa discreta no canto da tela, quase transparente até o mouse
 * passar por cima. Mostra a tarefa ativa e o timer, com pausar, finalizar (com uma mensagem
 * de encerramento opcional), cancelar sem contar o tempo (confirma na própria faixa) e ligar
 * o som. Arraste pela faixa para mudar de lugar.
 */
export default function MiniFoco() {
  const [foco, setFoco] = useState<Foco | null>(null);
  /** Última tarefa em foco: depois de pausar, o overlay oferece retomar. */
  const [ultimo, setUltimo] = useState<Item | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [encerrando, setEncerrando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [som, setSom] = useState<{ tocando: string | null; escolhido: string | null }>({ tocando: null, escolhido: null });
  /** Esperando confirmar o cancelamento do foco. */
  const [cancelando, setCancelando] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    document.documentElement.classList.add("overlay");
  }, []);

  useEffect(() => {
    const ler = () =>
      itemEmFoco()
        .then((f) => {
          setFoco(f);
          if (f) setUltimo(f.item);
        })
        .catch(() => {});
    ler();
    // A janela principal avisa quando o foco muda; a leitura periódica cobre o resto.
    const pararFoco = listen("foco:mudou", ler);
    const pararSom = listen<{ tocando: string | null; escolhido: string | null }>("som:estado", ({ payload }) => setSom(payload));
    emit("som:pedir-estado").catch(() => {});
    const leitura = setInterval(ler, 30_000);
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => {
      pararFoco.then((f) => f());
      pararSom.then((f) => f());
      clearInterval(leitura);
      clearInterval(relogio);
    };
  }, []);

  useEffect(() => setCancelando(false), [foco?.item.id, foco?.inicio]);
  useEffect(() => {
    if (!cancelando) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && setCancelando(false);
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [cancelando]);

  // Abre espaço para a mensagem de encerramento e volta ao tamanho de faixa depois.
  useEffect(() => {
    const janela = getCurrentWindow();
    redimensionarPelaBase(janela, encerrando ? ALTURA_OVERLAY_ENCERRANDO : ALTURA_OVERLAY).catch(() => {});
    if (encerrando) {
      janela.setFocus().catch(() => {});
      requestAnimationFrame(() => campo.current?.focus());
    }
  }, [encerrando]);

  function finalizar() {
    emit("overlay:concluir", { mensagem: mensagem.trim() || null }).catch(() => {});
    setEncerrando(false);
    setMensagem("");
  }

  const botao = "shrink-0 rounded-md p-1.5 text-suave hover:bg-etiqueta hover:text-tinta";
  const tarefa = foco?.item ?? ultimo;

  return (
    <div className="h-screen p-0.5">
      <div
        className={`flex h-full flex-col rounded-2xl bg-folha text-tinta shadow-[0_0_0_1px_var(--color-linha)] transition-opacity duration-300 select-none ${
          encerrando || cancelando ? "opacity-100" : "opacity-55 hover:opacity-100"
        }`}
      >
        {foco && cancelando ? (
          <div data-tauri-drag-region className="flex h-[48px] shrink-0 items-center gap-2 px-3">
            <span data-tauri-drag-region className="min-w-0 flex-1 truncate text-[13px] text-suave">
              Cancelar o foco? O tempo não conta.
            </span>
            <button
              type="button"
              autoFocus
              onClick={() => {
                setCancelando(false);
                emit("foco:cancelar").catch(() => {});
              }}
              className="shrink-0 rounded-md bg-atraso px-2 py-1 text-[13px] font-semibold text-folha hover:opacity-90"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => setCancelando(false)}
              className="shrink-0 rounded-md px-2 py-1 text-[13px] text-suave hover:bg-etiqueta hover:text-tinta"
            >
              Voltar
            </button>
          </div>
        ) : (
          <div data-tauri-drag-region className="flex h-[48px] shrink-0 items-center gap-1.5 px-3">
            <span className={`size-2 shrink-0 rounded-full ${foco ? "animate-pulse bg-destaque" : "border border-apagado"}`} />
            <button
              type="button"
              onClick={abrirPrincipal}
              title={tarefa ? `${tarefa.titulo}: abrir o Juggl` : "Abrir o Juggl"}
              className="min-w-0 flex-1 truncate text-left text-[14px] font-medium"
            >
              {foco ? foco.item.titulo : tarefa ? `Pausada: ${tarefa.titulo}` : "Nada em foco"}
            </button>
            {foco && (
              <span className="shrink-0 font-titulo text-lg font-medium tabular-nums tracking-tight">
                {formatarCronometro(agora - new Date(foco.inicio).getTime())}
              </span>
            )}
            {(som.escolhido || som.tocando) && (
              <button
                type="button"
                title={som.tocando ? "Parar o som" : "Tocar o som"}
                aria-label={som.tocando ? "Parar o som" : "Tocar o som"}
                onClick={() => emit("som:alternar").catch(() => {})}
                className={`${botao} ${som.tocando ? "text-destaque" : ""}`}
              >
                {som.tocando ? "♪" : "♫"}
              </button>
            )}
            {foco ? (
              <>
                <button type="button" title="Pausar" aria-label="Pausar" onClick={() => emit("bandeja:pausar")} className={botao}>
                  <Icone nome="pausa" />
                </button>
                <button
                  type="button"
                  title="Finalizar a tarefa"
                  aria-label="Finalizar a tarefa"
                  onClick={() => setEncerrando(!encerrando)}
                  className={`${botao} ${encerrando ? "bg-etiqueta text-tinta" : ""}`}
                >
                  <Icone nome="check" />
                </button>
              </>
            ) : (
              tarefa && (
                <button
                  type="button"
                  title="Retomar o foco"
                  aria-label="Retomar o foco"
                  onClick={() => emit("overlay:retomar", { itemId: tarefa.id })}
                  className={botao}
                >
                  <Icone nome="foco" />
                </button>
              )
            )}
            <button type="button" title="Fechar o overlay" aria-label="Fechar" onClick={() => getCurrentWindow().close()} className={botao}>
              ×
            </button>
          </div>
        )}
        {encerrando && foco && !cancelando && (
          <form
            className="flex flex-1 flex-col gap-2 px-3 pb-3"
            onSubmit={(e) => {
              e.preventDefault();
              finalizar();
            }}
          >
            <textarea
              ref={campo}
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  finalizar();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setEncerrando(false);
                }
              }}
              rows={2}
              placeholder="Mensagem de encerramento (opcional): como ficou, o que entregou…"
              className="min-h-0 flex-1 resize-none rounded-lg border border-linha bg-cartao px-2.5 py-1.5 text-[13px] outline-none focus:border-destaque"
            />
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[11px] text-apagado">Enter conclui, Esc volta</span>
              <button type="button" onClick={() => setEncerrando(false)} className="rounded-md px-2 py-1 text-[13px] text-suave hover:bg-etiqueta">
                Voltar
              </button>
              <button type="submit" className="rounded-md bg-destaque px-3 py-1 text-[13px] font-semibold text-folha hover:opacity-90">
                Concluir tarefa
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
