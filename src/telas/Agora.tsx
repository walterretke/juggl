import { useEffect, useState } from "react";
import { dataLocalIso, descreverPrazo, formatarCronometro, formatarDuracao } from "../captura/datas";
import type { Foco } from "../db/foco";
import type { Item } from "../db/itens";
import { NOME_QUANDO } from "../ritual/quadro";
import { COR_ORIGEM, NOME_ORIGEM } from "./origens";
import TextoFormatado from "./TextoFormatado";
import SeletorSom from "./SeletorSom";

interface Props {
  foco: Foco | null;
  proximas: Item[];
  /** O dia já foi planejado (itens escolhidos ou plano confirmado). */
  planejado: boolean;
  /** As próximas são as escolhidas para hoje (senão são só sugestões de A fazer). */
  doDia: boolean;
  aoFocar: (item: Item) => void;
  aoPausar: () => void;
  aoConcluir: () => void;
  aoCobrar: () => void;
  aoPlanejar: () => void;
  /** Abre a tarefa em foco no editor (D). */
  aoEditar: () => void;
  /** Som do foco: escolha, o que está tocando e liga/desliga. */
  som: React.ComponentProps<typeof SeletorSom>;
  aoAbrirMini: () => void;
}

/** Tela "Agora": uma única coisa em destaque, o timer e as 3 de hoje (ou sugestões, sem plano). */
export default function Agora({
  foco,
  proximas,
  planejado,
  doDia,
  aoFocar,
  aoPausar,
  aoConcluir,
  aoCobrar,
  aoPlanejar,
  aoEditar,
  aoAbrirMini,
  som,
}: Props) {
  const [agora, setAgora] = useState(() => Date.now());

  // D abre a tarefa em foco para editar.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (!foco || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]")) return;
      if (e.key.toLowerCase() !== "d") return;
      e.preventDefault();
      aoEditar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [foco, aoEditar]);

  useEffect(() => {
    if (!foco) return;
    setAgora(Date.now());
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(relogio);
  }, [foco]);

  const sessao = foco ? agora - new Date(foco.inicio).getTime() : 0;
  const meta = foco ? [foco.item.pessoa, foco.item.projeto, NOME_ORIGEM[foco.item.origem]].filter(Boolean) : [];
  if (foco?.item.origem === "manual") meta.pop();
  const hoje = dataLocalIso(new Date(agora));
  const cobranca = foco && foco.item.cobrancas > 0 ? `${foco.item.pessoa ?? "Já"} cobrou ${foco.item.cobrancas}×` : null;
  const promessa = foco?.item.prometido_para ? `prometido ${descreverPrazo(foco.item.prometido_para, new Date(agora))}` : null;

  return (
    <div className="pb-6">
      {foco ? (
        <section aria-label="Fazendo agora" className="rounded-2xl bg-cartao px-8 py-7 shadow-[0_0_0_1px_var(--color-linha)]">
          <p className="text-xs font-semibold uppercase tracking-wider text-destaque">Fazendo agora</p>
          <h2 className="mt-2 font-titulo text-[28px] font-medium leading-tight tracking-tight">{foco.item.titulo}</h2>
          {meta.length > 0 && <p className="mt-1 text-[15px] text-suave">{meta.join(" · ")}</p>}
          {foco.item.nota && (
            <div
              title="Dois cliques para editar (D)"
              onDoubleClick={aoEditar}
              className="mt-3 max-h-48 overflow-y-auto text-[15px] leading-relaxed text-tinta-2 select-text"
            >
              <TextoFormatado texto={foco.item.nota} />
            </div>
          )}
          {foco.item.subtarefas > 0 && (
            <p className="mt-2 text-sm text-suave">
              Checklist: {foco.item.subtarefas_feitas} de {foco.item.subtarefas} feitos
            </p>
          )}
          {(cobranca || promessa) && (
            <p className="mt-1 text-sm font-semibold text-atraso">{[cobranca, promessa].filter(Boolean).join(" · ")}</p>
          )}

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
              title="Para o timer. A tarefa continua aberta."
              className="rounded-lg bg-destaque px-4 py-2 text-sm font-semibold text-folha hover:opacity-90"
            >
              Parar timer <kbd className="ml-1 font-sans font-normal opacity-70">P</kbd>
            </button>
            <button
              type="button"
              onClick={aoConcluir}
              title="Para o timer e fecha a tarefa (Z desfaz)"
              className="rounded-lg border border-linha px-4 py-2 text-sm font-semibold hover:bg-etiqueta"
            >
              Concluir tarefa <kbd className="ml-1 font-sans font-normal text-apagado">X</kbd>
            </button>
            <button
              type="button"
              onClick={aoEditar}
              className="rounded-lg px-4 py-2 text-sm text-suave hover:bg-etiqueta hover:text-tinta"
            >
              Editar tarefa <kbd className="ml-1 font-sans font-normal text-apagado">D</kbd>
            </button>
            <button
              type="button"
              onClick={aoCobrar}
              title="Registra que quem pediu cobrou de novo"
              className="rounded-lg px-4 py-2 text-sm text-suave hover:bg-etiqueta hover:text-tinta"
            >
              Cobrou de novo <kbd className="ml-1 font-sans font-normal text-apagado">B</kbd>
            </button>
            <button
              type="button"
              onClick={aoAbrirMini}
              title="Uma faixa discreta no canto da tela, sempre por cima, com a tarefa, o timer, pausar e finalizar"
              className="rounded-lg px-4 py-2 text-sm text-suave hover:bg-etiqueta hover:text-tinta"
            >
              Overlay no canto
            </button>
          </div>
          <div className="mt-3">
            <SeletorSom {...som} />
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-linha px-8 py-7">
          <p className="font-titulo text-2xl font-medium">Nada em foco.</p>
          <p className="mt-1 text-[15px] text-suave">
            Escolha uma das próximas com 1, 2 ou 3, ou aperte F em qualquer item de A fazer.
          </p>
          {!planejado && (
            <button
              type="button"
              onClick={aoPlanejar}
              className="mt-4 rounded-lg border border-linha px-4 py-2 text-sm font-semibold hover:bg-etiqueta"
            >
              Planejar o dia
            </button>
          )}
        </section>
      )}

      <div className="mt-9 mb-3 flex items-baseline gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-apagado">{doDia ? "Suas 3 de hoje" : "Sugestões"}</h2>
        {!doDia && proximas.length > 0 && (
          <button type="button" onClick={aoPlanejar} className="text-[13px] font-semibold text-destaque hover:underline">
            Planejar o dia
          </button>
        )}
      </div>
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
              {item.dia_planejado === hoje && (
                <span className="shrink-0 rounded-full bg-destaque-claro px-2 text-xs font-semibold text-destaque-tinta">
                  {item.quando ? NOME_QUANDO[item.quando] : "Do dia"}
                </span>
              )}
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
