import { useEffect, useMemo, useState } from "react";
import { filtrarBusca } from "../busca/filtro";
import { listarFechados, type Item } from "../db/itens";
import { destinoAoRestaurar, NOME_LISTA } from "../tarefas/restaurar";
import Icone from "./Icone";

interface Props {
  /** Muda quando os itens mudam em outra tela, para recarregar. */
  versao: number;
  aoRestaurar: (item: Item) => void;
  aoAbrir: (item: Item) => void;
  aoApagar: (item: Item) => void;
}

type Filtro = "todas" | "feito" | "arquivado";

const FILTROS: { valor: Filtro; nome: string }[] = [
  { valor: "todas", nome: "Todas" },
  { valor: "feito", nome: "Concluídas" },
  { valor: "arquivado", nome: "Arquivadas" },
];

/** "hoje", "ontem" ou "13/10" (com o ano se não for este). */
function quando(iso: string, agora: Date): string {
  const d = new Date(iso);
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diferenca = Math.round((dia(agora) - dia(d)) / 86_400_000);
  if (diferenca === 0) return "hoje";
  if (diferenca === 1) return "ontem";
  const ddmm = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return d.getFullYear() === agora.getFullYear() ? ddmm : `${ddmm}/${d.getFullYear()}`;
}

/**
 * Concluídas e arquivadas: achar o que foi fechado (sem querer, inclusive) e restaurar
 * para a lista em que estava.
 */
export default function Fechadas({ versao, aoRestaurar, aoAbrir, aoApagar }: Props) {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [termo, setTermo] = useState("");

  useEffect(() => {
    listarFechados()
      .then(setItens)
      .catch((e) => setErro(String(e)));
  }, [versao]);

  const visiveis = useMemo(() => {
    const doFiltro = (itens ?? []).filter((i) => filtro === "todas" || i.status === filtro);
    if (!termo.trim()) return doFiltro;
    // A busca devolve o mesmo objeto, que aqui é o Item completo.
    return filtrarBusca(doFiltro, termo, doFiltro.length) as Item[];
  }, [itens, filtro, termo]);

  if (erro) return <p className="rounded-xl bg-atraso-claro px-4 py-3 text-sm text-atraso">{erro}</p>;
  if (!itens) return null;
  const agora = new Date();

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Mostrar" className="flex gap-1">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              type="button"
              role="radio"
              aria-checked={filtro === f.valor}
              onClick={() => setFiltro(f.valor)}
              className={`rounded-full px-3 py-1 text-[13px] ${
                filtro === f.valor ? "bg-destaque font-semibold text-folha" : "bg-etiqueta text-tinta-2 hover:text-tinta"
              }`}
            >
              {f.nome}
            </button>
          ))}
        </div>
        <label className="ml-auto flex min-w-[220px] items-center gap-2 rounded-lg border border-linha bg-cartao px-3 py-1.5 focus-within:border-destaque">
          <Icone nome="busca" className="shrink-0 text-apagado" />
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setTermo("")}
            placeholder="Buscar por título, pessoa, projeto…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-apagado"
          />
        </label>
      </div>

      {visiveis.length === 0 ? (
        <p className="mt-10 text-center text-[15px] text-apagado">
          {itens.length === 0 ? "Nada concluído ou arquivado ainda." : "Nada encontrado."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visiveis.map((item) => {
            const destino = NOME_LISTA[destinoAoRestaurar(item)];
            const meta = [item.pessoa, item.projeto].filter(Boolean).join(" · ");
            return (
              <li key={item.id} className="group flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-[18px] py-3 hover:bg-cartao/60">
                <span
                  className={`shrink-0 rounded-full px-2 text-xs font-semibold ${
                    item.status === "feito" ? "bg-ok-claro text-ok" : "bg-etiqueta text-tinta-2"
                  }`}
                >
                  {item.status === "feito" ? "Concluída" : "Arquivada"}
                </span>
                <button type="button" onClick={() => aoAbrir(item)} className="min-w-0 flex-1 text-left" title="Abrir a tarefa">
                  <span className="block truncate text-base font-medium">{item.titulo}</span>
                  {meta && <span className="block truncate text-[13px] text-suave">{meta}</span>}
                </button>
                <span className="shrink-0 text-xs tabular-nums text-apagado">{quando(item.atualizado_em, agora)}</span>
                <button
                  type="button"
                  onClick={() => aoRestaurar(item)}
                  title={`Volta para ${destino}, onde estava`}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-semibold text-destaque-tinta hover:bg-destaque-claro"
                >
                  <Icone nome="voltar" />
                  Restaurar em {destino}
                </button>
                <button
                  type="button"
                  onClick={() => aoApagar(item)}
                  title="Apagar de vez (dá para desfazer com Z)"
                  aria-label="Apagar"
                  className="shrink-0 rounded-md p-1.5 text-apagado hover:bg-atraso-claro hover:text-atraso"
                >
                  <Icone nome="lixeira" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
