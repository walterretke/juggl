import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import {
  alterarPrioridade,
  CORES_PRIORIDADE,
  criarPrioridade,
  listarPrioridades,
  removerPrioridade,
  reordenarPrioridades,
  type CorPrioridade,
} from "../db/prioridades";
import { alterarTipoEspera, criarTipoEspera, listarTiposEspera, removerTipoEspera, reordenarTiposEspera } from "../db/esperas";
import { BOLINHA_PRIORIDADE, ETIQUETA_PRIORIDADE, NOME_COR } from "./cores";

interface Etiqueta {
  id: string;
  nome: string;
  cor: CorPrioridade;
}

/** Onde a lista é gravada e os textos que mudam entre prioridades e tipos de espera. */
interface Fonte {
  listar: () => Promise<Etiqueta[]>;
  criar: (nome: string) => Promise<unknown>;
  alterar: (id: string, campos: Partial<Pick<Etiqueta, "nome" | "cor">>) => Promise<void>;
  reordenar: (ids: string[]) => Promise<void>;
  remover: (id: string) => Promise<void>;
  /** Evento emitido ao mudar, para as outras telas recarregarem. */
  evento: string;
  /** Textos: o rótulo do campo de nome, o do campo de criar e o erro de nome repetido. */
  rotulo: string;
  placeholder: string;
  jaExiste: string;
  /** Mostra o número ao lado (as teclas 1 a 9 da triagem valem só para prioridades). */
  numerar: boolean;
  ajuda: string;
}

const PRIORIDADES: Fonte = {
  listar: listarPrioridades,
  criar: criarPrioridade,
  alterar: alterarPrioridade,
  reordenar: reordenarPrioridades,
  remover: removerPrioridade,
  evento: "prioridades:alteradas",
  rotulo: "Nome da prioridade",
  placeholder: "Nova prioridade",
  jaExiste: "Já existe uma prioridade com esse nome.",
  numerar: true,
  ajuda:
    "A ordem vale para a lista A fazer e para as teclas 1 a 9 da triagem. Remover uma prioridade deixa os itens dela sem prioridade.",
};

const TIPOS_ESPERA: Fonte = {
  listar: listarTiposEspera,
  criar: criarTipoEspera,
  alterar: alterarTipoEspera,
  reordenar: reordenarTiposEspera,
  remover: removerTipoEspera,
  evento: "esperas:alteradas",
  rotulo: "Nome do tipo de espera",
  placeholder: "Novo tipo de espera",
  jaExiste: "Já existe um tipo de espera com esse nome.",
  numerar: false,
  ajuda:
    "Os motivos que o Juggl oferece ao pôr uma tarefa Em espera, nesta ordem. Remover um tipo deixa as tarefas dele em espera sem motivo.",
};

/** Lista editável de prioridades: renomear, trocar a cor, reordenar, remover e criar. */
export default function EditorPrioridades() {
  return <EditorEtiquetas fonte={PRIORIDADES} />;
}

/** Mesma lista para os motivos de Em espera ("Aguardando aprovação", "Bloqueado"...). */
export function EditorTiposEspera() {
  return <EditorEtiquetas fonte={TIPOS_ESPERA} />;
}

function EditorEtiquetas({ fonte }: { fonte: Fonte }) {
  const [prioridades, setPrioridades] = useState<Etiqueta[]>([]);
  const [nova, setNova] = useState("");
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function recarregar() {
    setPrioridades(await fonte.listar());
    await emit(fonte.evento);
  }

  useEffect(() => {
    fonte.listar().then(setPrioridades).catch((e) => setErro(String(e)));
  }, [fonte]);

  async function executar(acao: () => Promise<unknown>) {
    try {
      setErro(null);
      await acao();
      await recarregar();
    } catch (e) {
      // O nome é único: o SQLite recusa duas prioridades com o mesmo nome.
      setErro(String(e).includes("UNIQUE") ? fonte.jaExiste : String(e));
      setPrioridades(await fonte.listar());
    }
  }

  function mover(indice: number, delta: number) {
    const ids = prioridades.map((p) => p.id);
    const [id] = ids.splice(indice, 1);
    ids.splice(indice + delta, 0, id);
    executar(() => fonte.reordenar(ids));
  }

  function proximaCor(p: Etiqueta) {
    const cor = CORES_PRIORIDADE[(CORES_PRIORIDADE.indexOf(p.cor) + 1) % CORES_PRIORIDADE.length];
    executar(() => fonte.alterar(p.id, { cor }));
  }

  const botao = "rounded-md px-1.5 py-0.5 text-suave hover:bg-etiqueta hover:text-tinta disabled:opacity-30";

  return (
    <div>
      <ol className="mt-2 flex flex-col gap-1">
        {prioridades.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2">
            {fonte.numerar && (
              <span className="w-5 text-right text-xs tabular-nums text-apagado" title={`Tecla ${i + 1} na triagem`}>
                {i + 1}
              </span>
            )}
            <button
              type="button"
              onClick={() => proximaCor(p)}
              title={`Cor: ${NOME_COR[p.cor]}. Clique para trocar.`}
              className={`size-4 shrink-0 rounded-full ${BOLINHA_PRIORIDADE[p.cor]}`}
            />
            <input
              defaultValue={p.nome}
              key={p.nome}
              aria-label={`${fonte.rotulo} ${i + 1}`}
              onBlur={(e) => {
                const nome = e.target.value.trim();
                if (nome && nome !== p.nome) executar(() => fonte.alterar(p.id, { nome }));
                else e.target.value = p.nome;
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm outline-none hover:border-linha focus:border-destaque"
            />
            <span className={`rounded-full px-2 text-xs font-semibold ${ETIQUETA_PRIORIDADE[p.cor]}`}>{p.nome}</span>
            <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)} className={botao}>
              ↑
            </button>
            <button
              type="button"
              aria-label="Descer"
              disabled={i === prioridades.length - 1}
              onClick={() => mover(i, 1)}
              className={botao}
            >
              ↓
            </button>
            {removendo === p.id ? (
              <button
                type="button"
                onClick={() => {
                  setRemovendo(null);
                  executar(() => fonte.remover(p.id));
                }}
                className="rounded-md px-2 py-0.5 text-xs font-semibold text-atraso hover:bg-atraso-claro"
              >
                Remover?
              </button>
            ) : (
              <button type="button" aria-label="Remover" onClick={() => setRemovendo(p.id)} className={botao}>
                ×
              </button>
            )}
          </li>
        ))}
      </ol>
      <form
        className={`mt-2 flex gap-2 ${fonte.numerar ? "pl-7" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          const nome = nova.trim();
          if (!nome) return;
          setNova("");
          executar(() => fonte.criar(nome));
        }}
      >
        <input
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          placeholder={fonte.placeholder}
          className="min-w-0 flex-1 rounded-lg border border-linha bg-cartao px-3 py-1.5 text-sm outline-none focus:border-destaque"
        />
        <button type="submit" disabled={!nova.trim()} className="rounded-lg border border-linha px-3 text-sm hover:bg-etiqueta disabled:opacity-40">
          Adicionar
        </button>
      </form>
      {erro && <p className="mt-2 text-sm text-atraso">{erro}</p>}
      <p className="mt-2 text-sm text-suave">{fonte.ajuda}</p>
    </div>
  );
}
