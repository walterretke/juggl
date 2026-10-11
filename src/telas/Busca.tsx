import { useEffect, useMemo, useRef, useState } from "react";
import { tempoParado } from "../captura/datas";
import { filtrarBusca } from "../busca/filtro";
import { itensParaBusca, type ItemBusca } from "../db/itens";
import { NOME_STATUS } from "../pessoas/resumo";
import Icone from "./Icone";

/** Um comando da paleta: ir para uma tela, capturar, copiar a daily... */
export interface Comando {
  nome: string;
  /** Tecla que faz o mesmo fora da paleta, para ir aprendendo. */
  tecla?: string;
  acao: () => void;
}

interface Props {
  comandos: Comando[];
  aoAbrir: (item: ItemBusca) => void;
  aoCopiarStatus: (item: ItemBusca) => void;
  aoFechar: () => void;
}

type Resultado = { tipo: "comando"; comando: Comando } | { tipo: "item"; item: ItemBusca };

function mexido(iso: string): string {
  const tempo = tempoParado(iso, new Date());
  return tempo === "agora" ? "mexido agora" : `mexido há ${tempo}`;
}

function dobrar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Busca global (Ctrl+K): qualquer item, inclusive concluídos e arquivados, e os comandos
 * do app. Enter abre o item na lista dele (um item fechado volta para A fazer).
 */
export default function Busca({ comandos, aoAbrir, aoCopiarStatus, aoFechar }: Props) {
  const [termo, setTermo] = useState("");
  const [itens, setItens] = useState<ItemBusca[]>([]);
  const [ativo, setAtivo] = useState(0);
  const lista = useRef<HTMLUListElement>(null);

  useEffect(() => {
    itensParaBusca().then(setItens).catch(() => {});
  }, []);

  const resultados = useMemo<Resultado[]>(() => {
    const t = dobrar(termo.trim());
    const cmds = comandos.filter((c) => !t || dobrar(c.nome).includes(t)).map((comando) => ({ tipo: "comando" as const, comando }));
    const achados = filtrarBusca(itens, termo).map((item) => ({ tipo: "item" as const, item }));
    // Com termo, os itens vêm antes: é o que mais se procura. Sem termo, só os comandos.
    return t ? [...achados, ...cmds.slice(0, 4)] : cmds;
  }, [termo, itens, comandos]);

  useEffect(() => setAtivo(0), [termo]);
  useEffect(() => {
    lista.current?.children[ativo]?.scrollIntoView({ block: "nearest" });
  }, [ativo]);

  function escolher(r: Resultado | undefined) {
    if (!r) return;
    aoFechar();
    if (r.tipo === "comando") r.comando.acao();
    else aoAbrir(r.item);
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:pt-20"
      onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}
    >
      <div className="w-[min(620px,100%)] overflow-hidden rounded-2xl bg-folha text-tinta shadow-2xl ring-1 ring-linha">
        <div className="flex items-center gap-2 border-b border-linha px-4">
          <Icone nome="busca" className="shrink-0 text-apagado" />
          <input
            autoFocus
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                aoFechar();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setAtivo((a) => Math.min(a + 1, resultados.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setAtivo((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                escolher(resultados[ativo]);
              } else if (e.key.toLowerCase() === "c" && (e.ctrlKey || e.metaKey) && !window.getSelection()?.toString()) {
                const r = resultados[ativo];
                if (r?.tipo !== "item") return;
                e.preventDefault();
                aoFechar();
                aoCopiarStatus(r.item);
              }
            }}
            placeholder="Buscar qualquer pedido, ou um comando"
            aria-label="Buscar"
            className="w-full bg-transparent py-3.5 text-[16px] outline-none"
          />
          <kbd className="shrink-0 font-sans text-xs text-apagado">Esc</kbd>
        </div>
        <ul ref={lista} className="max-h-[60vh] overflow-y-auto p-2">
          {termo.trim() && resultados.every((r) => r.tipo === "comando") && (
            <li className="px-3 py-2 text-sm text-suave">Nenhum pedido com "{termo.trim()}".</li>
          )}
          {resultados.map((r, i) => (
            <li key={r.tipo === "item" ? r.item.id : `cmd-${r.comando.nome}`}>
              <button
                type="button"
                onMouseEnter={() => setAtivo(i)}
                onClick={() => escolher(r)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${i === ativo ? "bg-etiqueta" : ""}`}
              >
                {r.tipo === "comando" ? (
                  <>
                    <span className="flex-1 text-[15px]">{r.comando.nome}</span>
                    {r.comando.tecla && <kbd className="font-sans text-xs text-apagado">{r.comando.tecla}</kbd>}
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-[15px] font-medium ${
                          r.item.status === "feito" || r.item.status === "arquivado" ? "text-suave line-through decoration-apagado" : ""
                        }`}
                      >
                        {r.item.titulo}
                      </span>
                      <span className="block truncate text-[13px] text-suave">
                        {[r.item.pessoa, r.item.projeto, r.item.id_externo, mexido(r.item.atualizado_em)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-etiqueta px-2 text-xs font-semibold text-tinta-2">{NOME_STATUS[r.item.status]}</span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
        <p className="flex flex-wrap gap-x-4 border-t border-linha px-4 py-2 text-xs text-apagado">
          <span>
            <b className="text-tinta-2">Enter</b> abre (um concluído ou arquivado volta para A fazer)
          </span>
          <span>
            <b className="text-tinta-2">Ctrl+C</b> copia o status
          </span>
        </p>
      </div>
    </div>
  );
}
