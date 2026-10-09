import { useState } from "react";
import type { AlertaComFoco } from "../db/detector";
import type { Parte } from "../regras/urgencia";

interface Props {
  alerta: AlertaComFoco;
  aoTrocar: () => void;
  aoContinuar: () => void;
  aoAdiar: () => void;
}

function Pontos({ titulo, total, partes }: { titulo: string; total: number; partes: Parte[] }) {
  return (
    <p>
      <span className="font-semibold tabular-nums">{total}</span> {titulo}
      {partes.length > 0 && <span className="text-suave"> = {partes.map((p) => `${p.motivo} (${p.pontos})`).join(" + ")}</span>}
    </p>
  );
}

/** Alerta de prioridade errada: outro item está bem mais urgente que o foco. */
export default function AlertaPrioridade({ alerta, aoTrocar, aoContinuar, aoAdiar }: Props) {
  const [detalhe, setDetalhe] = useState(false);
  const botao = "rounded-md px-3 py-1 font-semibold";
  return (
    <div role="alert" className="mb-5 rounded-xl bg-atraso-claro px-4 py-3 text-sm text-tinta">
      <p className="text-[15px]">
        Talvez você devesse focar em <strong>{alerta.outro.titulo}</strong>: {alerta.explicacao}.
      </p>
      {detalhe && (
        <div className="mt-2 text-[13px]">
          <Pontos titulo={alerta.outro.titulo} total={alerta.pontosOutro} partes={alerta.partesOutro} />
          <Pontos titulo={`${alerta.focoTitulo} (em foco)`} total={alerta.pontosFoco} partes={alerta.partesFoco} />
        </div>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={aoTrocar} className={`${botao} bg-atraso text-folha hover:opacity-90`}>
          Trocar agora <kbd className="ml-1 font-sans font-normal opacity-70">T</kbd>
        </button>
        <button type="button" onClick={aoContinuar} className={`${botao} hover:bg-folha/60`}>
          Continuar <kbd className="ml-1 font-sans font-normal text-apagado">C</kbd>
        </button>
        <button type="button" onClick={aoAdiar} className={`${botao} hover:bg-folha/60`}>
          Adiar 30 min <kbd className="ml-1 font-sans font-normal text-apagado">A</kbd>
        </button>
        <button
          type="button"
          onClick={() => setDetalhe((d) => !d)}
          className="ml-auto rounded-md px-2 py-1 text-suave hover:bg-folha/60 hover:text-tinta"
        >
          {detalhe ? "Esconder pontos" : "Por quê?"}
        </button>
      </div>
    </div>
  );
}
