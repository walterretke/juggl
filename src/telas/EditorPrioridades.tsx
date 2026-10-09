import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import {
  alterarPrioridade,
  CORES_PRIORIDADE,
  criarPrioridade,
  listarPrioridades,
  removerPrioridade,
  reordenarPrioridades,
  type Prioridade,
} from "../db/prioridades";
import { BOLINHA_PRIORIDADE, ETIQUETA_PRIORIDADE, NOME_COR } from "./cores";

/** Lista editável de prioridades: renomear, trocar a cor, reordenar, remover e criar. */
export default function EditorPrioridades() {
  const [prioridades, setPrioridades] = useState<Prioridade[]>([]);
  const [nova, setNova] = useState("");
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function recarregar() {
    setPrioridades(await listarPrioridades());
    await emit("prioridades:alteradas");
  }

  useEffect(() => {
    listarPrioridades().then(setPrioridades).catch((e) => setErro(String(e)));
  }, []);

  async function executar(acao: () => Promise<unknown>) {
    try {
      setErro(null);
      await acao();
      await recarregar();
    } catch (e) {
      // O nome é único: o SQLite recusa duas prioridades com o mesmo nome.
      setErro(String(e).includes("UNIQUE") ? "Já existe uma prioridade com esse nome." : String(e));
      setPrioridades(await listarPrioridades());
    }
  }

  function mover(indice: number, delta: number) {
    const ids = prioridades.map((p) => p.id);
    const [id] = ids.splice(indice, 1);
    ids.splice(indice + delta, 0, id);
    executar(() => reordenarPrioridades(ids));
  }

  function proximaCor(p: Prioridade) {
    const cor = CORES_PRIORIDADE[(CORES_PRIORIDADE.indexOf(p.cor) + 1) % CORES_PRIORIDADE.length];
    executar(() => alterarPrioridade(p.id, { cor }));
  }

  const botao = "rounded-md px-1.5 py-0.5 text-suave hover:bg-etiqueta hover:text-tinta disabled:opacity-30";

  return (
    <div>
      <ol className="mt-2 flex flex-col gap-1">
        {prioridades.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2">
            <span className="w-5 text-right text-xs tabular-nums text-apagado" title={`Tecla ${i + 1} na triagem`}>
              {i + 1}
            </span>
            <button
              type="button"
              onClick={() => proximaCor(p)}
              title={`Cor: ${NOME_COR[p.cor]}. Clique para trocar.`}
              className={`size-4 shrink-0 rounded-full ${BOLINHA_PRIORIDADE[p.cor]}`}
            />
            <input
              defaultValue={p.nome}
              key={p.nome}
              aria-label={`Nome da prioridade ${i + 1}`}
              onBlur={(e) => {
                const nome = e.target.value.trim();
                if (nome && nome !== p.nome) executar(() => alterarPrioridade(p.id, { nome }));
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
                  executar(() => removerPrioridade(p.id));
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
        className="mt-2 flex gap-2 pl-7"
        onSubmit={(e) => {
          e.preventDefault();
          const nome = nova.trim();
          if (!nome) return;
          setNova("");
          executar(() => criarPrioridade(nome));
        }}
      >
        <input
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          placeholder="Nova prioridade"
          className="min-w-0 flex-1 rounded-lg border border-linha bg-cartao px-3 py-1.5 text-sm outline-none focus:border-destaque"
        />
        <button type="submit" disabled={!nova.trim()} className="rounded-lg border border-linha px-3 text-sm hover:bg-etiqueta disabled:opacity-40">
          Adicionar
        </button>
      </form>
      {erro && <p className="mt-2 text-sm text-atraso">{erro}</p>}
      <p className="mt-2 text-sm text-suave">
        A ordem vale para a lista A fazer e para as teclas 1 a 9 da triagem. Remover uma prioridade deixa os itens dela sem
        prioridade.
      </p>
    </div>
  );
}
