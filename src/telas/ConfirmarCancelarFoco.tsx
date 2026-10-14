import { useEffect } from "react";
import { formatarCronometro } from "../captura/datas";
import type { Foco } from "../db/foco";

interface Props {
  foco: Foco;
  aoConfirmar: () => void;
  aoVoltar: () => void;
}

/** Confirma antes de cancelar o foco: o tempo da sessão some das horas e não dá para desfazer. */
export default function ConfirmarCancelarFoco({ foco, aoConfirmar, aoVoltar }: Props) {
  const sessao = formatarCronometro(Date.now() - new Date(foco.inicio).getTime());

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        aoVoltar();
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoVoltar]);

  return (
    <div
      className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:pt-24"
      onMouseDown={(e) => e.target === e.currentTarget && aoVoltar()}
    >
      <form
        className="w-[min(520px,100%)] rounded-2xl bg-folha p-6 text-tinta shadow-2xl ring-1 ring-linha"
        onSubmit={(e) => {
          e.preventDefault();
          aoConfirmar();
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-apagado">Cancelar o foco</p>
        <p className="mt-1 truncate font-titulo text-xl font-medium">{foco.item.titulo}</p>
        <p className="mt-4 text-sm text-suave">
          Os {sessao} desta sessão não vão para as horas, e o item volta para onde estava antes de focar.
        </p>
        <div className="mt-5 flex gap-2">
          <button autoFocus type="submit" className="rounded-lg bg-atraso px-4 py-2 text-sm font-semibold text-folha hover:opacity-90">
            Cancelar o foco
          </button>
          <button type="button" onClick={aoVoltar} className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold hover:bg-etiqueta">
            Continuar focando
          </button>
        </div>
        <p className="mt-3 text-xs text-apagado">Enter cancela o foco, Esc volta.</p>
      </form>
    </div>
  );
}
