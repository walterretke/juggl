import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { descreverPrazo, tempoParado } from "../captura/datas";
import { normalizarNome } from "../captura/parser";
import type { Item } from "../db/itens";
import {
  excluirPessoa,
  itensDaPessoa,
  juntarPessoas,
  listarPessoas,
  pessoaComNome,
  renomearPessoa,
  type ResumoPessoa,
} from "../db/pessoas";
import { NOME_STATUS, resumoParaPessoa } from "../pessoas/resumo";
import Icone from "./Icone";

interface Props {
  /** Muda quando os itens mudam, para recarregar. */
  versao: number;
  aoCobrar: (item: Item) => void;
  aoFocar: (item: Item) => void;
  /** Passa o pedido para outra pessoa (pode ser desfeito com Z). */
  aoMudarPessoa: (item: Item, pessoaId: string, nome: string) => void;
  /** Um pedido começou a ser arrastado (para soltar no Agora ou nas listas da barra lateral). */
  aoArrastar: (item: Item) => void;
  /** Pessoas mudaram (nome, junção, exclusão): as listas precisam recarregar. */
  aoAlterar: () => void;
  aoAvisar: (texto: string) => void;
}

type Confirmacao = { tipo: "excluir"; pessoa: ResumoPessoa } | {
      tipo: "juntar";
      origem: ResumoPessoa;
      destino: ResumoPessoa;
      /** Nome digitado ao renomear, que fica na pessoa que sobra. */
      novoNome?: string;
    };

const TIPO_PESSOA = "text/juggl-pessoa";
const TIPO_ITEM = "text/juggl-item";

const CLASSE_STATUS: Partial<Record<Item["status"], string>> = {
  em_foco: "bg-destaque-claro text-destaque-tinta",
  feito: "bg-etiqueta text-apagado",
};

function desde(iso: string, agora: Date): string {
  const tempo = tempoParado(iso, agora);
  return tempo === "agora" ? "agora mesmo" : `há ${tempo}`;
}

function pedidos(n: number): string {
  return n === 1 ? "1 pedido" : `${n} pedidos`;
}

function BotaoIcone({ titulo, onClick, children }: { titulo: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      className="rounded-md p-1.5 text-apagado hover:bg-etiqueta hover:text-tinta"
    >
      {children}
    </button>
  );
}

/**
 * Tela Pessoas: tudo que cada pessoa pediu, com status e cobranças, e um resumo pronto para
 * responder. Dá para renomear, juntar duplicadas (arrastando uma sobre a outra) e excluir.
 */
export default function Pessoas({ versao, aoCobrar, aoFocar, aoMudarPessoa, aoArrastar, aoAlterar, aoAvisar }: Props) {
  const [pessoas, setPessoas] = useState<ResumoPessoa[] | null>(null);
  const [busca, setBusca] = useState("");
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [revisao, setRevisao] = useState(0);
  const campoBusca = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listarPessoas()
      .then(setPessoas)
      .catch((e) => setErro(String(e)));
  }, [versao, revisao]);

  const filtradas = useMemo(() => {
    const termo = normalizarNome(busca);
    return (pessoas ?? []).filter(
      (p) => normalizarNome(p.nome).includes(termo) || normalizarNome(p.apelido).includes(termo),
    );
  }, [pessoas, busca]);

  // Sem escolha (ou a escolhida saiu do filtro): mostra a primeira da lista.
  const atual = filtradas.find((p) => p.id === escolhida) ?? filtradas[0] ?? null;

  useEffect(() => {
    setNomeEditado(null);
    if (!atual) {
      setItens([]);
      return;
    }
    itensDaPessoa(atual.id)
      .then(setItens)
      .catch((e) => setErro(String(e)));
  }, [atual?.id, versao, revisao]);

  const recarregar = useCallback(() => {
    setRevisao((r) => r + 1);
    aoAlterar();
  }, [aoAlterar]);

  const moverEscolha = useCallback(
    (passo: number) => {
      if (filtradas.length === 0) return;
      const i = atual ? filtradas.indexOf(atual) : -1;
      const proxima = filtradas[Math.min(Math.max(i + passo, 0), filtradas.length - 1)];
      setEscolhida(proxima.id);
      setConfirmacao(null);
      document.getElementById(`pessoa-${proxima.id}`)?.scrollIntoView({ block: "nearest" });
    },
    [filtradas, atual],
  );

  const copiarResumo = useCallback(async () => {
    if (!atual || itens.length === 0) return;
    await writeText(resumoParaPessoa(atual.nome, itens, new Date()));
    aoAvisar(`Resumo para ${atual.nome} copiado. Cole no Teams.`);
  }, [atual, itens, aoAvisar]);

  async function salvarNome() {
    if (!atual || nomeEditado === null) return;
    const nome = nomeEditado.trim().replace(/^@/, "");
    if (!nome || nome === atual.nome) {
      setNomeEditado(null);
      return;
    }
    try {
      const existente = await pessoaComNome(nome, atual.id);
      setNomeEditado(null);
      if (existente) {
        setConfirmacao({ tipo: "juntar", origem: atual, destino: existente, novoNome: nome });
        return;
      }
      await renomearPessoa(atual.id, nome);
      aoAvisar(`Agora é ${nome}.`);
      recarregar();
    } catch (e) {
      setErro(String(e));
    }
  }

  const confirmar = useCallback(async () => {
    if (!confirmacao) return;
    try {
      if (confirmacao.tipo === "excluir") {
        await excluirPessoa(confirmacao.pessoa.id);
        aoAvisar(`${confirmacao.pessoa.nome} excluída. Os pedidos ficaram sem "quem pediu".`);
        setEscolhida(null);
      } else {
        await juntarPessoas(confirmacao.origem.id, confirmacao.destino.id);
        if (confirmacao.novoNome) await renomearPessoa(confirmacao.destino.id, confirmacao.novoNome);
        aoAvisar(`${confirmacao.origem.nome} juntada com ${confirmacao.novoNome ?? confirmacao.destino.nome}.`);
        setEscolhida(confirmacao.destino.id);
      }
      setConfirmacao(null);
      recarregar();
    } catch (e) {
      setErro(String(e));
    }
  }, [confirmacao, aoAvisar, recarregar]);

  // Teclado: / busca, ↑ ↓ trocam a pessoa, R renomeia, Delete exclui, Ctrl+C copia o resumo.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea")) return;
      if (confirmacao) {
        if (e.key === "Enter") confirmar();
        else if (e.key === "Escape") setConfirmacao(null);
        else return;
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        if (window.getSelection()?.toString()) return;
        copiarResumo();
      } else if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      } else if (e.key === "/") {
        campoBusca.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "j") {
        moverEscolha(1);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        moverEscolha(-1);
      } else if ((e.key === "r" || e.key === "F2") && atual) {
        setNomeEditado(atual.nome);
      } else if (e.key === "Delete" && atual) {
        setConfirmacao({ tipo: "excluir", pessoa: atual });
      } else {
        return;
      }
      e.preventDefault();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [confirmacao, confirmar, copiarResumo, moverEscolha, atual]);

  /** Linha de pessoa como alvo: um pedido solto passa para ela; outra pessoa solta junta as duas. */
  function alvoPessoa(p: ResumoPessoa) {
    return {
      onDragOver: (e: React.DragEvent) => {
        const tipos = e.dataTransfer.types;
        if (!tipos.includes(TIPO_ITEM) && !tipos.includes(TIPO_PESSOA)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setAlvo(p.id);
      },
      onDragLeave: () => setAlvo((a) => (a === p.id ? null : a)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setAlvo(null);
        const origemId = e.dataTransfer.getData(TIPO_PESSOA);
        if (origemId) {
          const origem = pessoas?.find((x) => x.id === origemId);
          if (origem && origem.id !== p.id) {
            setEscolhida(p.id);
            setConfirmacao({ tipo: "juntar", origem, destino: p });
          }
          return;
        }
        const item = itens.find((i) => i.id === e.dataTransfer.getData(TIPO_ITEM));
        if (item && item.pessoa_id !== p.id) aoMudarPessoa(item, p.id, p.nome);
      },
    };
  }

  if (erro) return <p className="rounded-xl bg-atraso-claro px-4 py-3 text-sm text-atraso">{erro}</p>;
  if (!pessoas) return null;
  if (pessoas.length === 0) {
    return (
      <p className="mt-16 text-center text-[15px] text-apagado">
        Ninguém ainda. Quem pediu entra aqui quando você preenche "quem pediu" numa captura.
      </p>
    );
  }

  const agora = new Date();
  const abertos = itens.filter((i) => i.status !== "feito");

  return (
    <div className="flex gap-6 pb-6">
      <div className="w-48 shrink-0">
        <label className="flex items-center gap-2 rounded-lg border border-linha bg-cartao px-3 py-1.5 focus-within:border-destaque">
          <Icone nome="busca" className="shrink-0 text-apagado" />
          <input
            ref={campoBusca}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                moverEscolha(e.key === "ArrowDown" ? 1 : -1);
              } else if (e.key === "Escape" || e.key === "Enter") {
                if (e.key === "Escape") setBusca("");
                e.currentTarget.blur();
              }
            }}
            placeholder="Buscar pessoa  /"
            aria-label="Buscar pessoa"
            className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-apagado"
          />
        </label>
        <ul className="mt-3 flex flex-col gap-0.5">
          {filtradas.map((p) => (
            <li key={p.id} id={`pessoa-${p.id}`}>
              <button
                type="button"
                draggable
                title="Arraste sobre outra pessoa para juntar as duas"
                onDragStart={(e) => {
                  e.dataTransfer.setData(TIPO_PESSOA, p.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => {
                  setEscolhida(p.id);
                  setConfirmacao(null);
                }}
                {...alvoPessoa(p)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[15px] ${
                  alvo === p.id
                    ? "bg-destaque-claro text-destaque-tinta ring-2 ring-destaque"
                    : atual?.id === p.id
                      ? "bg-cartao font-semibold shadow-sm"
                      : "text-tinta-2 hover:bg-cartao/60"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                {p.cobrancas > 0 && (
                  <span title="Cobranças nos pedidos abertos" className="text-xs font-semibold text-atraso">
                    {p.cobrancas}×
                  </span>
                )}
                <span className="w-5 text-right text-[13px] font-normal tabular-nums text-apagado">{p.abertos || ""}</span>
              </button>
            </li>
          ))}
          {filtradas.length === 0 && <li className="px-3 py-2 text-sm text-apagado">Ninguém com esse nome.</li>}
        </ul>
        {filtradas.length > 1 && (
          <p className="mt-3 px-3 text-xs text-apagado">Arraste um pedido para outra pessoa, ou uma pessoa sobre outra para juntar.</p>
        )}
      </div>

      {atual && (
        <section className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              {nomeEditado !== null ? (
                <input
                  autoFocus
                  value={nomeEditado}
                  aria-label="Nome da pessoa"
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setNomeEditado(e.target.value)}
                  onBlur={salvarNome}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setNomeEditado(null);
                  }}
                  className="w-full rounded-lg border border-destaque bg-folha px-2 font-titulo text-2xl font-medium outline-none"
                />
              ) : (
                <div className="flex items-center gap-1">
                  <h2
                    className="truncate font-titulo text-2xl font-medium"
                    title="Dois cliques para renomear"
                    onDoubleClick={() => setNomeEditado(atual.nome)}
                  >
                    {atual.nome}
                  </h2>
                  <BotaoIcone titulo="Renomear (R)" onClick={() => setNomeEditado(atual.nome)}>
                    <Icone nome="lapis" />
                  </BotaoIcone>
                  <BotaoIcone titulo="Excluir (Delete)" onClick={() => setConfirmacao({ tipo: "excluir", pessoa: atual })}>
                    <Icone nome="lixeira" />
                  </BotaoIcone>
                </div>
              )}
              <p className="text-sm text-suave">
                {abertos.length === 0 ? "Nada em aberto." : `${pedidos(abertos.length)} em aberto`}
                {atual.cobrancas > 0 && ` · cobrou ${atual.cobrancas}× nesses pedidos`}
              </p>
            </div>
            <button
              type="button"
              disabled={itens.length === 0}
              onClick={copiarResumo}
              title="Copia uma mensagem com o status de cada pedido (Ctrl+C)"
              className="rounded-lg border border-linha px-3 py-1.5 text-sm hover:bg-etiqueta disabled:opacity-40"
            >
              Copiar resumo
            </button>
          </div>

          {confirmacao && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-atraso-claro px-4 py-3 text-sm text-atraso">
              <span className="flex-1">
                {confirmacao.tipo === "excluir" ? (
                  <>
                    Excluir <b>{confirmacao.pessoa.nome}</b>?{" "}
                    {confirmacao.pessoa.abertos === 1 && 'O pedido aberto continua, sem "quem pediu".'}
                    {confirmacao.pessoa.abertos > 1 && `Os ${confirmacao.pessoa.abertos} pedidos abertos continuam, sem "quem pediu".`}
                  </>
                ) : (
                  <>
                    Já existe <b>{confirmacao.destino.nome}</b>. Juntar <b>{confirmacao.origem.nome}</b> com ela? Os pedidos
                    ficam todos em {confirmacao.novoNome ?? confirmacao.destino.nome}.
                  </>
                )}
              </span>
              <button
                type="button"
                autoFocus
                onClick={confirmar}
                className="rounded-md bg-atraso px-3 py-1 font-semibold text-folha hover:opacity-90"
              >
                {confirmacao.tipo === "excluir" ? "Excluir" : "Juntar"} <kbd className="font-sans font-normal opacity-70">Enter</kbd>
              </button>
              <button type="button" onClick={() => setConfirmacao(null)} className="rounded-md px-2 py-1 hover:bg-folha/50">
                Cancelar
              </button>
            </div>
          )}

          <ul className="mt-4 flex flex-col gap-1.5">
            {itens.map((item) => {
              const promessa = item.prometido_para ? descreverPrazo(item.prometido_para, agora) : null;
              const prazo = item.prazo ? descreverPrazo(item.prazo, agora) : null;
              const feito = item.status === "feito";
              return (
                <li
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(TIPO_ITEM, item.id);
                    e.dataTransfer.effectAllowed = "move";
                    aoArrastar(item);
                  }}
                  className={`group flex items-center gap-3 rounded-xl px-4 py-3 ${feito ? "opacity-60" : "bg-cartao shadow-[0_0_0_1px_var(--color-linha)]"}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`truncate text-[15px] font-medium ${feito ? "line-through" : ""}`}>{item.titulo}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 text-xs font-semibold ${CLASSE_STATUS[item.status] ?? "bg-etiqueta text-tinta-2"}`}
                      >
                        {NOME_STATUS[item.status]}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-suave">
                      {[
                        promessa && `prometido ${promessa}`,
                        prazo && `prazo ${prazo}`,
                        item.cobrancas > 0 && `cobrou ${item.cobrancas}×`,
                        `${feito ? "concluído" : "mexido"} ${desde(item.atualizado_em, agora)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {!feito && (
                    <div className="flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                      {item.status !== "em_foco" && (
                        <BotaoIcone titulo="Focar agora" onClick={() => aoFocar(item)}>
                          <Icone nome="foco" />
                        </BotaoIcone>
                      )}
                      <BotaoIcone titulo="Cobrou de novo" onClick={() => aoCobrar(item)}>
                        <Icone nome="cobrar" />
                      </BotaoIcone>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
