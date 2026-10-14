import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { gravarAvisoPrazo, horasDaRegraPrazo, lerAvisosPrazo } from "../db/avisoPrazo";
import { listarPrioridades, type Prioridade } from "../db/prioridades";
import type { AvisoPrazo, AvisosPorPrioridade } from "../regras/avisoPrazo";
import { ETIQUETA_PRIORIDADE } from "./cores";

const campo =
  "w-14 rounded-lg border border-linha bg-cartao px-2 py-1 text-right text-[15px] outline-none focus:border-destaque";

/** Horas digitadas: não negativas, com meia hora de precisão. */
function horas(texto: string): number {
  return Math.max(0, Math.round((Number(texto.replace(",", ".")) || 0) * 2) / 2);
}

/** Quanto antes do prazo avisar, e de quanto em quanto tempo repetir, por prioridade. */
export default function SecaoAvisoPrazo() {
  const [prioridades, setPrioridades] = useState<Prioridade[]>([]);
  const [avisos, setAvisos] = useState<AvisosPorPrioridade>({});
  const [semPrioridade, setSemPrioridade] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    try {
      const [lista, horasRegra] = await Promise.all([listarPrioridades(), horasDaRegraPrazo()]);
      setPrioridades(lista);
      setSemPrioridade(horasRegra);
      setAvisos(await lerAvisosPrazo(horasRegra));
    } catch (e) {
      setErro(String(e));
    }
  }

  useEffect(() => {
    carregar();
    // O editor de prioridades logo acima avisa quando cria, renomeia ou reordena.
    const parar = listen("prioridades:alteradas", () => carregar());
    return () => {
      parar.then((f) => f());
    };
  }, []);

  function mudar(id: string, mudanca: Partial<AvisoPrazo>) {
    const aviso = { ...avisos[id], ...mudanca };
    setAvisos({ ...avisos, [id]: aviso });
    gravarAvisoPrazo(id, aviso).catch((e) => setErro(String(e)));
  }

  return (
    <div>
      <p className="mt-1 text-sm text-suave">
        Quanto antes do prazo (que conta até as 18h) o Juggl avisa, e de quanto em quanto tempo repete até vencer. Use 0
        em "antes" para não avisar, e 0 em "repetir" para avisar uma vez só.
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {prioridades.map((p) => {
          const aviso = avisos[p.id];
          if (!aviso) return null;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`w-24 truncate rounded-full px-2 text-center text-xs font-semibold ${ETIQUETA_PRIORIDADE[p.cor]}`}>
                {p.nome}
              </span>
              <input
                type="number"
                min={0}
                max={168}
                step={0.5}
                aria-label={`Horas antes do prazo para avisar (${p.nome})`}
                defaultValue={aviso.horas}
                key={`h-${p.id}-${aviso.horas}`}
                onBlur={(e) => {
                  const valor = horas(e.target.value);
                  e.target.value = String(valor);
                  if (valor !== aviso.horas) mudar(p.id, { horas: valor });
                }}
                className={campo}
              />
              horas antes, repetir a cada
              <input
                type="number"
                min={0}
                max={48}
                step={0.5}
                aria-label={`Repetir o aviso a cada tantas horas (${p.nome})`}
                defaultValue={aviso.repetirHoras}
                key={`r-${p.id}-${aviso.repetirHoras}`}
                onBlur={(e) => {
                  const valor = horas(e.target.value);
                  e.target.value = String(valor);
                  if (valor !== aviso.repetirHoras) mudar(p.id, { repetirHoras: valor });
                }}
                className={campo}
              />
              horas
            </li>
          );
        })}
      </ul>
      {semPrioridade !== null && (
        <p className="mt-2 text-sm text-suave">
          Sem prioridade: {semPrioridade} {semPrioridade === 1 ? "hora" : "horas"} antes, uma vez (ajuste na regra Prazo
          chegando, em Regras).
        </p>
      )}
      {erro && <p className="mt-2 text-sm text-atraso">{erro}</p>}
    </div>
  );
}
