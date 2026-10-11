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
 * faixa para mudar de lugar. Pausar pausa sem pedir a nota, como na bandeja.
 */
export default function MiniFoco() {
  const [foco, setFoco] = useState<Foco | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

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

  const botao = "shrink-0 rounded-md p-1.5 text-suave hover:bg-etiqueta hover:text-tinta";
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
        </>
      )}
      <button type="button" title="Fechar a mini-janela" aria-label="Fechar" onClick={() => getCurrentWindow().close()} className={botao}>
        ×
      </button>
    </div>
  );
}
