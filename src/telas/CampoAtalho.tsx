import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { gravarConfig } from "../db/config";
import { atalhoDoEvento } from "./atalho";
import { rotuloAtalho } from "./origens";

interface Props {
  atalho: string;
  aoMudarAtalho: (atalho: string) => void;
  /** Avisa enquanto o campo espera as teclas (o Esc ali cancela a gravação, não fecha a janela). */
  aoGravar?: (gravando: boolean) => void;
}

/** Campo que grava a combinação nova do atalho global da captura. */
export default function CampoAtalho({ atalho, aoMudarAtalho, aoGravar }: Props) {
  const [gravando, setGravandoLocal] = useState(false);
  const [novoAtalho, setNovoAtalho] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<{ ok: boolean; texto: string } | null>(null);

  function setGravando(valor: boolean) {
    setGravandoLocal(valor);
    aoGravar?.(valor);
  }

  async function salvar() {
    if (!novoAtalho) return;
    try {
      await invoke("definir_atalho", { atalho: novoAtalho });
      await gravarConfig("atalho", novoAtalho);
      aoMudarAtalho(novoAtalho);
      setMensagem({ ok: true, texto: `Atalho trocado para ${rotuloAtalho(novoAtalho)}.` });
      setNovoAtalho(null);
    } catch (e) {
      setMensagem({ ok: false, texto: String(e) });
    }
  }

  return (
    <>
      <div className="mt-2 flex gap-2">
        <input
          readOnly
          aria-label="Atalho da captura"
          value={gravando ? (novoAtalho ? rotuloAtalho(novoAtalho) : "Aperte as teclas…") : rotuloAtalho(novoAtalho ?? atalho)}
          onFocus={() => {
            setGravando(true);
            setMensagem(null);
          }}
          onBlur={() => setGravando(false)}
          onKeyDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === "Escape") {
              setNovoAtalho(null);
              e.currentTarget.blur();
              return;
            }
            const combinacao = atalhoDoEvento(e);
            if (combinacao) {
              setNovoAtalho(combinacao);
              e.currentTarget.blur();
            }
          }}
          className="flex-1 rounded-lg border border-linha bg-cartao px-3 py-2 text-[15px] outline-none focus:border-destaque"
        />
        <button
          type="button"
          disabled={!novoAtalho}
          onClick={salvar}
          className="rounded-lg bg-destaque px-4 text-sm font-semibold text-folha hover:opacity-90 disabled:opacity-40"
        >
          Salvar
        </button>
      </div>
      {mensagem && <p className={`mt-2 text-xs ${mensagem.ok ? "text-destaque" : "text-atraso"}`}>{mensagem.texto}</p>}
    </>
  );
}
