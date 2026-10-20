import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { adiarNota, apagarNota, editarNota, listarNotas, reabrirNota, resolverNota, type Nota } from "../db/notas";
import {
  descreverIntervalo,
  descreverProximo,
  escolhaDoIntervalo,
  minutosDaEscolha,
  type EscolhaIntervalo as Escolha,
} from "../notas/lembrete";
import Icone, { type NomeIcone } from "./Icone";
import EscolhaIntervalo from "./notas/EscolhaIntervalo";

interface Props {
  /** Muda quando algo muda em outra tela, para recarregar. */
  versao: number;
  /** Rótulo do atalho global da nota (ex.: "Ctrl+Alt+Espaço"). */
  atalhoNota: string;
  /** Cria a tarefa a partir da nota e abre no editor. */
  aoVirarTarefa: (nota: Nota) => Promise<void>;
  aoAbrirTarefa: (itemId: string) => void;
  aoAvisar: (texto: string) => void;
  /** Notas mudaram (contagem na barra lateral). */
  aoAlterar: () => void;
}

const ADIAR_MIN = 60;

function Acao({ icone, children, aoClicar, titulo, perigo }: { icone: NomeIcone; children?: React.ReactNode; aoClicar: () => void; titulo: string; perigo?: boolean }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      title={titulo}
      aria-label={children ? undefined : titulo}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-semibold ${
        perigo ? "text-apagado hover:bg-atraso-claro hover:text-atraso" : "text-suave hover:bg-etiqueta hover:text-tinta"
      }`}
    >
      <Icone nome={icone} />
      {children}
    </button>
  );
}

/** Edita título, descrição e intervalo de uma nota ativa. */
function EdicaoNota({ nota, aoSalvar, aoCancelar }: { nota: Nota; aoSalvar: (campos: Pick<Nota, "titulo" | "descricao" | "intervalo_min">) => void; aoCancelar: () => void }) {
  const [titulo, setTitulo] = useState(nota.titulo);
  const [descricao, setDescricao] = useState(nota.descricao ?? "");
  const [intervalo, setIntervalo] = useState<Escolha>(() => escolhaDoIntervalo(nota.intervalo_min));
  const [erro, setErro] = useState<string | null>(null);

  function salvar() {
    const minutos = minutosDaEscolha(intervalo);
    if (!titulo.trim()) return setErro("O título não pode ficar vazio.");
    if (!minutos) return setErro("Escolha de quanto em quanto tempo avisar (até uma semana).");
    aoSalvar({ titulo, descricao: descricao || null, intervalo_min: minutos });
  }

  return (
    <div
      className="flex w-full flex-col gap-2"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          aoCancelar();
        } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey || !(e.target instanceof HTMLTextAreaElement))) {
          e.preventDefault();
          salvar();
        }
      }}
    >
      <input
        autoFocus
        aria-label="Título"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        className="w-full rounded-lg border border-linha bg-cartao px-3 py-1.5 text-base font-medium outline-none focus:border-destaque"
      />
      <textarea
        aria-label="Descrição"
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        rows={3}
        placeholder="Detalhes (opcional)"
        className="w-full resize-y rounded-lg border border-linha bg-cartao px-3 py-2 text-sm outline-none placeholder:text-apagado focus:border-destaque"
      />
      <EscolhaIntervalo escolha={intervalo} aoMudar={setIntervalo} />
      {erro && <p className="text-sm text-atraso">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={aoCancelar} className="rounded-lg px-3 py-1.5 text-sm text-suave hover:bg-etiqueta">
          Cancelar
        </button>
        <button type="button" onClick={salvar} className="rounded-lg bg-destaque px-4 py-1.5 text-sm font-semibold text-folha hover:opacity-90">
          Salvar
        </button>
      </div>
    </div>
  );
}

/**
 * Notas: o que não pode ser esquecido mas ainda não é uma tarefa ("marcar reunião com o
 * Carlos"). Cada uma avisa de tempos em tempos até ser resolvida ou virar tarefa.
 */
export default function Notas({ versao, atalhoNota, aoVirarTarefa, aoAbrirTarefa, aoAvisar, aoAlterar }: Props) {
  const [notas, setNotas] = useState<{ ativas: Nota[]; fechadas: Nota[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [verFechadas, setVerFechadas] = useState(false);
  const [agora, setAgora] = useState(() => new Date());

  function carregar() {
    setAgora(new Date());
    listarNotas()
      .then(setNotas)
      .catch((e) => setErro(String(e)));
  }

  useEffect(carregar, [versao]);
  useEffect(() => {
    const parar = listen("nota:criada", carregar);
    return () => {
      parar.then((f) => f());
    };
  }, []);

  async function agir(acao: () => Promise<unknown>, mensagem?: string) {
    try {
      await acao();
      if (mensagem) aoAvisar(mensagem);
      carregar();
      aoAlterar();
    } catch (e) {
      setErro(String(e));
    }
  }

  if (erro) return <p className="rounded-xl bg-atraso-claro px-4 py-3 text-sm text-atraso">{erro}</p>;
  if (!notas) return null;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div>
        <button
          type="button"
          onClick={() => invoke("abrir_nota")}
          className="flex items-center gap-2 rounded-lg bg-destaque px-3.5 py-1.5 text-sm font-semibold text-folha hover:opacity-90"
        >
          Novo lembrete <kbd className="font-sans text-xs font-normal opacity-80">{atalhoNota}</kbd>
        </button>
      </div>

      {notas.ativas.length === 0 ? (
        <p className="mt-6 text-center text-[15px] text-apagado">
          Nada para lembrar. Aperte {atalhoNota} em qualquer janela quando alguém pedir algo que você não pode esquecer.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {notas.ativas.map((nota) => (
            <li key={nota.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-xl bg-cartao px-[18px] py-3">
              {editando === nota.id ? (
                <EdicaoNota
                  nota={nota}
                  aoCancelar={() => setEditando(null)}
                  aoSalvar={(campos) => {
                    setEditando(null);
                    agir(() => editarNota(nota, campos), "Lembrete salvo");
                  }}
                />
              ) : (
                <>
                  <button type="button" onClick={() => setEditando(nota.id)} className="min-w-0 flex-1 text-left" title="Editar o lembrete">
                    <span className="block text-base font-medium">{nota.titulo}</span>
                    {nota.descricao && <span className="line-clamp-2 block whitespace-pre-line text-sm text-suave">{nota.descricao}</span>}
                    <span className="mt-0.5 block text-xs text-apagado">
                      A cada {descreverIntervalo(nota.intervalo_min)} · próximo aviso {descreverProximo(nota.proximo_aviso, agora)}
                      {nota.avisos > 0 && ` · avisou ${nota.avisos}×`}
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center gap-0.5">
                    <Acao icone="check" titulo="Resolvido: para de avisar" aoClicar={() => agir(() => resolverNota(nota.id), "Lembrete resolvido")}>
                      Resolvida
                    </Acao>
                    <Acao icone="seta" titulo="Cria uma tarefa com o título e a descrição e abre para completar" aoClicar={() => agir(() => aoVirarTarefa(nota))}>
                      Virar tarefa
                    </Acao>
                    <Acao
                      icone="ampulheta"
                      titulo={`Avisa só daqui a ${descreverIntervalo(ADIAR_MIN)}`}
                      aoClicar={() => agir(() => adiarNota(nota, ADIAR_MIN), `Adiado: avisa daqui a ${descreverIntervalo(ADIAR_MIN)}`)}
                    >
                      Adiar
                    </Acao>
                    <Acao icone="lixeira" titulo="Apagar o lembrete" perigo aoClicar={() => agir(() => apagarNota(nota.id), "Lembrete apagado")} />
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {notas.fechadas.length > 0 && (
        <section>
          <button type="button" aria-expanded={verFechadas} onClick={() => setVerFechadas(!verFechadas)} className="text-sm text-suave hover:text-tinta">
            {verFechadas ? "Esconder" : "Ver"} os resolvidos ({notas.fechadas.length})
          </button>
          {verFechadas && (
            <ul className="mt-2 flex flex-col gap-1">
              {notas.fechadas.map((nota) => (
                <li key={nota.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-[18px] py-2 hover:bg-cartao/60">
                  <span
                    className={`shrink-0 rounded-full px-2 text-xs font-semibold ${
                      nota.status === "virou_tarefa" ? "bg-destaque-claro text-destaque-tinta" : "bg-ok-claro text-ok"
                    }`}
                  >
                    {nota.status === "virou_tarefa" ? "Virou tarefa" : "Resolvido"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] text-tinta-2">{nota.titulo}</span>
                  {nota.status === "virou_tarefa" && nota.item_id && (
                    <Acao icone="seta" titulo="Abrir a tarefa" aoClicar={() => aoAbrirTarefa(nota.item_id!)}>
                      Abrir tarefa
                    </Acao>
                  )}
                  {nota.status === "resolvida" && (
                    <Acao icone="voltar" titulo="Volta a avisar" aoClicar={() => agir(() => reabrirNota(nota), "Lembrete reaberto")}>
                      Reabrir
                    </Acao>
                  )}
                  <Acao icone="lixeira" titulo="Apagar o lembrete" perigo aoClicar={() => agir(() => apagarNota(nota.id), "Lembrete apagado")} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
