import { useEffect, useState } from "react";
import {
  apagarSubtarefa,
  criarSubtarefa,
  listarSubtarefas,
  marcarSubtarefa,
  renomearSubtarefa,
  reordenarSubtarefas,
  type Subtarefa,
} from "../db/subtarefas";
import Icone from "./Icone";

interface Props {
  itemId: string;
  /** Algo mudou (para atualizar o "2/5" nos cartões). */
  aoMudar: () => void;
}

/**
 * Checklist de subtarefas: Enter no campo novo adiciona, clique no texto edita, arraste
 * para reordenar. Cada mudança grava na hora.
 */
export default function Checklist({ itemId, aoMudar }: Props) {
  const [passos, setPassos] = useState<Subtarefa[]>([]);
  const [novo, setNovo] = useState("");
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const [arrastado, setArrastado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = () =>
    listarSubtarefas(itemId)
      .then(setPassos)
      .catch((e) => setErro(String(e)));

  useEffect(() => {
    recarregar();
  }, [itemId]);

  async function mudar(acao: Promise<void>) {
    try {
      await acao;
      await recarregar();
      aoMudar();
    } catch (e) {
      setErro(String(e));
    }
  }

  function adicionar() {
    const texto = novo.trim();
    if (!texto) return;
    setNovo("");
    mudar(criarSubtarefa(itemId, texto));
  }

  function confirmarEdicao() {
    if (!editando) return;
    const { id, texto } = editando;
    setEditando(null);
    if (!texto.trim()) mudar(apagarSubtarefa(id));
    else if (texto.trim() !== passos.find((p) => p.id === id)?.texto) mudar(renomearSubtarefa(id, texto));
  }

  function soltarSobre(alvo: string) {
    if (!arrastado || arrastado === alvo) return;
    const ids = passos.map((p) => p.id).filter((id) => id !== arrastado);
    ids.splice(ids.indexOf(alvo), 0, arrastado);
    setPassos(ids.map((id) => passos.find((p) => p.id === id)!));
    setArrastado(null);
    mudar(reordenarSubtarefas(ids));
  }

  const feitas = passos.filter((p) => p.feita).length;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="block text-xs font-semibold text-suave">Checklist</span>
        {passos.length > 0 && (
          <span className="text-xs tabular-nums text-apagado">
            {feitas} de {passos.length}
          </span>
        )}
      </div>
      {passos.length > 0 && (
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-etiqueta">
          <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${(feitas / passos.length) * 100}%` }} />
        </div>
      )}
      <ul className="mt-1.5 flex flex-col">
        {passos.map((p) => (
          <li
            key={p.id}
            draggable={editando?.id !== p.id}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/juggl-passo", p.id);
              setArrastado(p.id);
            }}
            onDragOver={(e) => {
              if (arrastado) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              soltarSobre(p.id);
            }}
            onDragEnd={() => setArrastado(null)}
            className={`group flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-etiqueta/60 ${arrastado === p.id ? "opacity-40" : ""}`}
          >
            <input
              type="checkbox"
              checked={!!p.feita}
              onChange={(e) => mudar(marcarSubtarefa(p.id, e.target.checked))}
              className="size-4 shrink-0 accent-[var(--color-destaque)]"
              aria-label={p.texto}
            />
            {editando?.id === p.id ? (
              <input
                autoFocus
                value={editando.texto}
                onChange={(e) => setEditando({ id: p.id, texto: e.target.value })}
                onBlur={confirmarEdicao}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirmarEdicao();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditando(null);
                  }
                }}
                className="min-w-0 flex-1 rounded border border-destaque bg-cartao px-1.5 text-sm outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditando({ id: p.id, texto: p.texto })}
                title="Clique para editar, arraste para reordenar"
                className={`min-w-0 flex-1 cursor-text text-left text-sm ${p.feita ? "text-apagado line-through" : ""}`}
              >
                {p.texto}
              </button>
            )}
            <button
              type="button"
              title="Remover"
              aria-label={`Remover ${p.texto}`}
              onClick={() => mudar(apagarSubtarefa(p.id))}
              className="shrink-0 rounded p-0.5 text-apagado opacity-0 group-hover:opacity-100 hover:text-atraso"
            >
              <Icone nome="lixeira" className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex items-center gap-2 px-1">
        <span className="flex size-4 shrink-0 items-center justify-center text-apagado">+</span>
        <input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
              // Enter aqui adiciona o passo, não salva a tarefa.
              e.preventDefault();
              adicionar();
            }
          }}
          onBlur={adicionar}
          placeholder="Adicionar um passo (Enter)"
          className="min-w-0 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-apagado"
        />
      </div>
      {erro && <p className="mt-1 text-sm text-atraso">{erro}</p>}
    </div>
  );
}
