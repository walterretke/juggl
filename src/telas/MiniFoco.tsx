import { useEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { formatarCronometro } from "../captura/datas";
import { itemEmFoco, type Foco } from "../db/foco";
import Icone from "./Icone";

/** Traz a janela principal para a frente (ela pode estar escondida na bandeja). */
async function abrirPrincipal() {
  const principal = await WebviewWindow.getByLabel("main");
  await principal?.show();
  await principal?.unminimize();
  await principal?.setFocus();
}

/**
 * Mini-janela de foco: o item em foco e o timer numa faixa sempre por cima. Arraste pela
 * faixa para mudar de lugar. Pausar pausa sem pedir a nota, como na bandeja. Cancelar
 * confirma na própria faixa e encerra a sessão sem contar o tempo.
 */
export default function MiniFoco() {
  const [foco, setFoco] = useState<Foco | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  /** Esperando confirmar o cancelamento do foco. */
  const [cancelando, setCancelando] = useState(false);

  useEffect(() => {
    const ler = () => itemEmFoco().then(setFoco).catch(() => {});
    ler();
    // A janela principal avisa quando o foco muda; a leitura periódica cobre o resto.
    const parar = listen("foco:mudou", ler);
    const leitura = setInterval(ler, 30_000);
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => {
      parar.then((f) => f());
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

  const botao = "shrink-0 rounded-md p-1.5 text-suave hover:bg-etiqueta hover:text-tinta";
  if (foco && cancelando) {
    return (
      <div data-tauri-drag-region className="flex h-screen select-none items-center gap-2 bg-folha px-3 text-tinta">
        <span data-tauri-drag-region className="min-w-0 flex-1 truncate text-[13px] text-suave">
          Cancelar o foco? O tempo não conta.
        </span>
        <button
          type="button"
          autoFocus
          onClick={() => {
            setCancelando(false);
            emit("foco:cancelar");
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
    );
  }
  return (
    <div data-tauri-drag-region className="flex h-screen select-none items-center gap-2 bg-folha px-3 text-tinta">
      <span className={`size-2 shrink-0 rounded-full ${foco ? "bg-destaque" : "border border-apagado"}`} />
      <button
        type="button"
        onClick={abrirPrincipal}
        title={foco ? `${foco.item.titulo}: abrir o Juggl` : "Abrir o Juggl"}
        className="min-w-0 flex-1 truncate text-left text-[14px] font-medium"
      >
        {foco ? foco.item.titulo : "Nada em foco"}
      </button>
      {foco && (
        <>
          <span className="shrink-0 font-titulo text-lg font-medium tabular-nums tracking-tight">
            {formatarCronometro(agora - new Date(foco.inicio).getTime())}
          </span>
          <button type="button" title="Pausar" aria-label="Pausar" onClick={() => emit("bandeja:pausar")} className={botao}>
            <Icone nome="pausa" />
          </button>
          <button type="button" title="Cancelar o foco sem contar o tempo" aria-label="Cancelar o foco" onClick={() => setCancelando(true)} className={botao}>
            <Icone nome="cancelar" />
          </button>
        </>
      )}
      <button type="button" title="Fechar a mini-janela" aria-label="Fechar" onClick={() => getCurrentWindow().close()} className={botao}>
        ×
      </button>
    </div>
  );
}
