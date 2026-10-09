import { useEffect, useState } from "react";
import { descreverPrazo, formatarCronometro, formatarDuracao } from "../captura/datas";
import type { Foco } from "../db/foco";
import type { Item } from "../db/itens";
import { COR_ORIGEM, NOME_ORIGEM } from "./origens";

interface Props {
  foco: Foco | null;
  proximas: Item[];
  aoFocar: (item: Item) => void;
  aoPausar: () => void;
  aoConcluir: () => void;
}

/** Tela "Agora": uma única coisa em destaque, o timer e as próximas três. */
export default function Agora({ foco, proximas, aoFocar, aoPausar, aoConcluir }: Props) {
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    if (!foco) return;
    setAgora(Date.now());
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(relogio);
  }, [foco]);

  const sessao = foco ? agora - new Date(foco.inicio).getTime() : 0;
  const meta = foco ? [foco.item.pessoa, foco.item.projeto, NOME_ORIGEM[foco.item.origem]].filter(Boolean) : [];
  if (foco?.item.origem === "manual") meta.pop();

  return (
    <div className="pb-6">
      {foco ? (
        <section aria-label="Fazendo agora" className="rounded-2xl bg-cartao px-8 py-7 shadow-[0_0_0_1px_var(--color-linha)]">
          <p className="text-xs font-semibold uppercase tracking-wider text-destaque">Fazendo agora</p>
          <h2 className="mt-2 font-titulo text-[28px] font-medium leading-tight tracking-tight">{foco.item.titulo}</h2>
          {meta.length > 0 && <p className="mt-1 text-[15px] text-suave">{meta.join(" · ")}</p>}

          <p className="mt-6 font-titulo text-6xl font-medium tabular-nums tracking-tight" aria-live="off">
            {formatarCronometro(sessao)}
          </p>
          <p className="mt-1 text-sm text-apagado">
            {foco.item.tempo_ms > 0 ? `${formatarDuracao(foco.item.tempo_ms + sessao)} no total neste item` : "Primeira sessão neste item"}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={aoPausar}
              className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold hover:bg-etiqueta"
            >
              Pausar <kbd className="ml-1 font-sans font-normal text-apagado">P</kbd>
            </button>
            <button
              type="button"
              onClick={aoConcluir}
              className="rounded-lg bg-destaque px-4 py-2 text-sm font-semibold text-folha hover:opacity-90"
            >
              Concluir <kbd className="ml-1 font-sans font-normal opacity-70">X</kbd>
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-linha px-8 py-7">
          <p className="font-titulo text-2xl font-medium">Nada em foco.</p>
          <p className="mt-1 text-[15px] text-suave">
            Escolha uma das próximas com 1, 2 ou 3, ou aperte F em qualquer item de A fazer.
          </p>
        </section>
      )}

      <h2 className="mt-9 mb-3 text-xs font-semibold uppercase tracking-wider text-apagado">Próximas</h2>
      {proximas.length === 0 && <p className="text-[15px] text-apagado">A fazer está vazio.</p>}
      <ol className="flex flex-col gap-1.5">
        {proximas.map((item, i) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => aoFocar(item)}
              className="flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left hover:bg-cartao"
            >
              <kbd className="flex size-6 shrink-0 items-center justify-center rounded-md bg-etiqueta font-sans text-xs font-semibold text-tinta-2">
                {i + 1}
              </kbd>
              <span className={`size-2.5 shrink-0 rounded-full ${COR_ORIGEM[item.origem] ?? COR_ORIGEM.manual}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{item.titulo}</span>
                {item.nota_pausa && <span className="block truncate text-[13px] text-suave">Parou em: {item.nota_pausa}</span>}
              </span>
              {item.status === "pausado" && (
                <span className="shrink-0 rounded-full bg-etiqueta px-2 text-xs font-semibold text-tinta-2">Pausado</span>
              )}
              {item.prazo && <span className="shrink-0 text-sm text-suave">{descreverPrazo(item.prazo, new Date())}</span>}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
