import { useEffect, useRef, useState } from "react";
import { formatarDuracao } from "../captura/datas";
import { buscarOuCriarPessoa, buscarOuCriarProjeto, listarSugestoes, type Item, type Mudancas } from "../db/itens";
import type { Prioridade } from "../db/prioridades";
import Formulario, { type ValoresFormulario } from "./captura/Formulario";
import Anexos from "./Anexos";
import Checklist from "./Checklist";
import Icone, { type NomeIcone } from "./Icone";

interface Props {
  item: Item;
  prioridades: Prioridade[];
  aoSalvar: (mudancas: Mudancas) => Promise<void>;
  aoFocar: () => void;
  aoConcluir: () => void;
  aoArquivar: () => void;
  aoApagar: () => void;
  aoFechar: () => void;
  /** Checklist ou anexos mudaram (gravam na hora): recarrega as telas. */
  aoMudarPartes: () => void;
}

const NOME_STATUS: Record<Item["status"], string> = {
  inbox: "Caixa de entrada",
  a_fazer: "A fazer",
  em_foco: "Em foco",
  pausado: "Pausada",
  aguardando: "Aguardando",
  feito: "Concluída",
  arquivado: "Arquivada",
};

function valoresDoItem(item: Item): ValoresFormulario {
  return {
    titulo: item.titulo,
    pessoa: item.pessoa ?? "",
    projeto: item.projeto ?? "",
    prioridadeId: item.prioridade_id,
    prazo: item.prazo,
  };
}

/** Horário na agenda como fica no formulário: dia, início e fim (vazio = sem horário). */
interface Horario {
  dia: string;
  inicio: string;
  fim: string;
}

function horarioDoItem(item: Item): Horario {
  return {
    dia: item.agenda_inicio?.slice(0, 10) ?? "",
    inicio: item.agenda_inicio?.slice(11, 16) ?? "",
    fim: item.agenda_fim?.slice(11, 16) ?? "",
  };
}

/** O que mudou no formulário, já como campos do item (pessoa e projeto viram ids). */
async function mudancasDoEditor(item: Item, valores: ValoresFormulario, descricao: string, horario: Horario): Promise<Mudancas> {
  const mudancas: Mudancas = {};
  const inicio = horario.dia && horario.inicio ? `${horario.dia}T${horario.inicio}` : null;
  const fim = inicio && horario.fim && horario.fim > horario.inicio ? `${horario.dia}T${horario.fim}` : null;
  if (inicio !== item.agenda_inicio) mudancas.agenda_inicio = inicio;
  if (fim !== item.agenda_fim) mudancas.agenda_fim = fim;
  const titulo = valores.titulo.trim();
  if (titulo && titulo !== item.titulo) mudancas.titulo = titulo;
  const nota = descricao.trim() ? descricao.replace(/\s+$/, "") : null;
  if (nota !== item.nota) mudancas.nota = nota;
  if (valores.prioridadeId !== item.prioridade_id) mudancas.prioridade_id = valores.prioridadeId;
  if (valores.prazo !== item.prazo) mudancas.prazo = valores.prazo;
  const pessoa = valores.pessoa.trim();
  if (pessoa !== (item.pessoa ?? "")) mudancas.pessoa_id = pessoa ? await buscarOuCriarPessoa(pessoa) : null;
  const projeto = valores.projeto.trim();
  if (projeto !== (item.projeto ?? "")) mudancas.projeto_id = projeto ? await buscarOuCriarProjeto(projeto) : null;
  return mudancas;
}

function Botao({ icone, children, aoClicar, perigo }: { icone: NomeIcone; children: React.ReactNode; aoClicar: () => void; perigo?: boolean }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold ${
        perigo ? "text-atraso hover:bg-atraso-claro" : "text-suave hover:bg-etiqueta hover:text-tinta"
      }`}
    >
      <Icone nome={icone} />
      {children}
    </button>
  );
}

/**
 * A tarefa aberta para editar: título, descrição (Enter quebra a linha), quem pediu, projeto,
 * prioridade e prazo, com focar, concluir, arquivar e apagar. Ctrl+Enter salva, Esc fecha.
 */
export default function EditorTarefa({
  item,
  prioridades,
  aoSalvar,
  aoFocar,
  aoConcluir,
  aoArquivar,
  aoApagar,
  aoFechar,
  aoMudarPartes,
}: Props) {
  const [valores, setValores] = useState<ValoresFormulario>(() => valoresDoItem(item));
  const [descricao, setDescricao] = useState(item.nota ?? "");
  const [horario, setHorario] = useState<Horario>(() => horarioDoItem(item));
  const [sugestoes, setSugestoes] = useState<{ pessoas: string[]; projetos: string[] }>({ pessoas: [], projetos: [] });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const adicionarAnexos = useRef<((arquivos: File[]) => void) | null>(null);

  useEffect(() => {
    listarSugestoes().then(setSugestoes).catch(() => {});
  }, []);

  const mudou =
    JSON.stringify(valores) !== JSON.stringify(valoresDoItem(item)) ||
    descricao.replace(/\s+$/, "") !== (item.nota ?? "") ||
    JSON.stringify(horario) !== JSON.stringify(horarioDoItem(item));

  async function salvar() {
    if (salvando) return;
    if (!valores.titulo.trim()) {
      setErro("O título não pode ficar vazio.");
      return;
    }
    setSalvando(true);
    try {
      if (horario.inicio && !horario.dia) {
        setErro("Escolha o dia do horário na agenda.");
        setSalvando(false);
        return;
      }
      const mudancas = await mudancasDoEditor(item, valores, descricao, horario);
      if (Object.keys(mudancas).length > 0) await aoSalvar(mudancas);
      aoFechar();
    } catch (e) {
      setErro(String(e));
      setSalvando(false);
    }
  }

  function aoTeclar(e: React.KeyboardEvent) {
    // Os atalhos da tela por trás não podem pegar as teclas digitadas aqui.
    e.stopPropagation();
    if (e.defaultPrevented) return;
    if (e.key === "Escape") {
      e.preventDefault();
      aoFechar();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey || e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      salvar();
    }
  }

  // Se o foco saiu do editor (um botão clicado sumiu, por exemplo), Esc e Ctrl+Enter ainda valem.
  useEffect(() => {
    function aoTeclarFora(e: KeyboardEvent) {
      if (e.target !== document.body || e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        aoFechar();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        salvar();
      }
    }
    window.addEventListener("keydown", aoTeclarFora);
    return () => window.removeEventListener("keydown", aoTeclarFora);
  });

  const tempo = item.tempo_ms > 0 ? `${formatarDuracao(item.tempo_ms)} em foco` : null;

  return (
    <div
      className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:pt-16"
      // Clicar fora fecha só se nada mudou, para não perder o que foi escrito.
      onMouseDown={(e) => e.target === e.currentTarget && !mudou && aoFechar()}
    >
      <div
        role="dialog"
        aria-label={`Tarefa: ${item.titulo}`}
        onKeyDown={aoTeclar}
        // Colar um print ou arrastar um arquivo em qualquer lugar do editor vira anexo.
        onPasteCapture={(e) => {
          const arquivos = [...e.clipboardData.files];
          if (arquivos.length === 0) return;
          e.preventDefault();
          e.stopPropagation();
          adicionarAnexos.current?.(arquivos);
        }}
        onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
        onDrop={(e) => {
          if (e.dataTransfer.files.length === 0) return;
          e.preventDefault();
          adicionarAnexos.current?.([...e.dataTransfer.files]);
        }}
        className="w-[min(640px,100%)] rounded-2xl bg-folha px-6 pt-5 pb-4 text-tinta shadow-2xl ring-1 ring-linha select-text"
      >
        <p className="mb-3 flex flex-wrap gap-x-3 text-xs text-apagado">
          <span className="font-semibold uppercase tracking-wider">{NOME_STATUS[item.status]}</span>
          {tempo && <span>{tempo}</span>}
          {item.cobrancas > 0 && <span className="font-semibold text-atraso">cobrou {item.cobrancas}×</span>}
        </p>
        <Formulario
          valores={valores}
          aoMudar={(m) => {
            setValores((v) => ({ ...v, ...m }));
            setErro(null);
          }}
          sugestoes={sugestoes}
          prioridades={prioridades}
          refTitulo={null}
          tituloSugerido={item.titulo}
          descricao={descricao}
          aoMudarDescricao={(d) => {
            setDescricao(d);
            setErro(null);
          }}
          rotuloTitulo="Tarefa"
          dicaDescricao="Detalhes, a mensagem recebida, links…"
          modoDescricao="editor"
          aoSalvar={salvar}
          depoisDaDescricao={
            <>
              {item.encerramento && (
                <p className="-mt-1 rounded-lg bg-ok-claro px-3 py-2 text-sm text-ok">
                  <b>Ao concluir:</b> {item.encerramento}
                </p>
              )}
              <Checklist itemId={item.id} aoMudar={aoMudarPartes} />
              <Anexos itemId={item.id} aoMudar={aoMudarPartes} refAdicionar={adicionarAnexos} />
            </>
          }
        />
        <div className="mt-3.5">
          <span className="block text-xs font-semibold text-suave">Horário na agenda</span>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <input
              type="date"
              aria-label="Dia na agenda"
              value={horario.dia}
              onChange={(e) => setHorario({ ...horario, dia: e.target.value, inicio: horario.inicio || (e.target.value ? "09:00" : ""), fim: horario.fim || (e.target.value ? "10:00" : "") })}
              className="rounded-lg border border-linha bg-cartao px-3 py-1 outline-none focus:border-destaque"
            />
            {horario.dia && (
              <>
                <input
                  type="time"
                  aria-label="Início"
                  value={horario.inicio}
                  onChange={(e) => setHorario({ ...horario, inicio: e.target.value })}
                  className="rounded-lg border border-linha bg-cartao px-3 py-1 outline-none focus:border-destaque"
                />
                <span className="text-suave">até</span>
                <input
                  type="time"
                  aria-label="Fim"
                  value={horario.fim}
                  onChange={(e) => setHorario({ ...horario, fim: e.target.value })}
                  className="rounded-lg border border-linha bg-cartao px-3 py-1 outline-none focus:border-destaque"
                />
                <button type="button" onClick={() => setHorario({ dia: "", inicio: "", fim: "" })} className="rounded-md px-2 py-1 text-[13px] text-suave hover:bg-etiqueta">
                  Tirar horário
                </button>
              </>
            )}
            {!horario.dia && <span className="text-[13px] text-apagado">Sem horário: aparece no dia do prazo, na agenda.</span>}
          </div>
        </div>
        {erro && <p className="mt-3 text-sm text-atraso">{erro}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-linha pt-3">
          {item.status !== "em_foco" && item.status !== "feito" && item.status !== "arquivado" && (
            <Botao icone="foco" aoClicar={aoFocar}>
              Focar
            </Botao>
          )}
          {item.status !== "feito" && (
            <Botao icone="check" aoClicar={aoConcluir}>
              Concluir
            </Botao>
          )}
          {item.status !== "arquivado" && item.status !== "em_foco" && (
            <Botao icone="arquivar" aoClicar={aoArquivar}>
              Arquivar
            </Botao>
          )}
          {item.status !== "em_foco" && (
            <Botao icone="lixeira" aoClicar={aoApagar} perigo>
              Apagar
            </Botao>
          )}
          <span className="flex-1" />
          <button type="button" onClick={aoFechar} className="rounded-lg px-3 py-1.5 text-sm text-suave hover:bg-etiqueta">
            Cancelar
          </button>
          <button
            type="button"
            disabled={salvando}
            onClick={salvar}
            className="rounded-lg bg-destaque px-4 py-1.5 text-sm font-semibold text-folha hover:opacity-90 disabled:opacity-60"
          >
            Salvar <kbd className="ml-1 font-sans font-normal opacity-70">Ctrl+Enter</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
