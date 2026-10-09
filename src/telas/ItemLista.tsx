import { dataLocalIso, descreverPrazo, formatarDuracao, tempoParado } from "../captura/datas";
import type { Item, Lista } from "../db/itens";
import type { Prioridade } from "../db/prioridades";
import Calendario from "./captura/Calendario";
import { BOLINHA_PRIORIDADE, ETIQUETA_PRIORIDADE } from "./cores";
import Icone, { type NomeIcone } from "./Icone";
import { COR_ORIGEM, NOME_ORIGEM } from "./origens";

export type Menu = "prazo" | "prioridade";
export type CampoEditavel = "prazo" | "projeto" | "pessoa" | "titulo";

export interface AcoesItem {
  selecionar: () => void;
  concluir: () => void;
  focar: () => void;
  mover: (lista: Lista) => void;
  arquivar: () => void;
  abrirLink: () => void;
  editar: (campo: CampoEditavel) => void;
  definirPrazo: (prazo: string | null) => void;
  definirPrioridade: (id: string | null) => void;
  abrirMenu: (menu: Menu | null) => void;
}

interface Props {
  item: Item;
  indice: number;
  ativo: boolean;
  lista: Lista;
  agora: Date;
  prioridades: Prioridade[];
  menu: Menu | null;
  acoes: AcoesItem;
  /** Formulário de edição pelo teclado, mostrado embaixo da linha. */
  children?: React.ReactNode;
}

function classePrazo(texto: string): string {
  if (texto.startsWith("atrasado")) return "font-semibold text-atraso";
  if (texto === "hoje") return "font-semibold text-destaque";
  return "text-suave";
}

function maiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function origemComId(item: Item): string | null {
  if (item.origem === "manual") return null;
  const nome = NOME_ORIGEM[item.origem] ?? item.origem;
  return item.id_externo ? `${nome} ${item.id_externo}` : nome;
}

function Acao({ icone, titulo, aoClicar }: { icone: NomeIcone; titulo: string; aoClicar: () => void }) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={(e) => {
        e.stopPropagation();
        aoClicar();
      }}
      className="rounded-md p-1.5 text-apagado hover:bg-etiqueta hover:text-tinta"
    >
      <Icone nome={icone} />
    </button>
  );
}

/** Pedaço clicável da segunda linha (pessoa, projeto): clique edita. */
function Campo({ texto, vazio, titulo, aoClicar }: { texto: string | null; vazio: string; titulo: string; aoClicar: () => void }) {
  return (
    <button
      type="button"
      title={titulo}
      onClick={(e) => {
        e.stopPropagation();
        aoClicar();
      }}
      className={`rounded px-1 -mx-1 hover:bg-etiqueta hover:text-tinta ${texto ? "" : "hidden text-apagado group-hover:inline"}`}
    >
      {texto ?? vazio}
    </button>
  );
}

/** Uma linha das listas, com ações clicáveis e arrastável para a barra lateral. */
export default function ItemLista({ item, indice, ativo, lista, agora, prioridades, menu, acoes, children }: Props) {
  const prazo = item.prazo ? descreverPrazo(item.prazo, agora) : null;
  const hoje = dataLocalIso(agora);
  const amanha = dataLocalIso(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1));
  const extras = [
    item.nota_pausa && `Parou em: ${item.nota_pausa}`,
    origemComId(item),
    item.tempo_ms > 0 && `${formatarDuracao(item.tempo_ms)} em foco`,
  ].filter(Boolean);

  return (
    <li
      id={`item-${indice}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/juggl-item", item.id);
        e.dataTransfer.effectAllowed = "move";
        acoes.selecionar();
      }}
      onClick={acoes.selecionar}
      className={`group relative cursor-default rounded-xl px-[18px] py-3.5 ${
        ativo ? "bg-cartao shadow-[0_0_0_1.5px_var(--color-destaque),0_4px_14px_rgba(0,0,0,0.08)]" : "hover:bg-cartao/60"
      }`}
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          title="Concluir (X)"
          aria-label="Concluir"
          onClick={(e) => {
            e.stopPropagation();
            acoes.concluir();
          }}
          className="group/check flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-apagado text-transparent hover:border-destaque hover:text-destaque"
        >
          <Icone nome="check" className="size-3" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="truncate text-base font-medium"
              title="Dois cliques para renomear"
              onDoubleClick={(e) => {
                e.stopPropagation();
                acoes.editar("titulo");
              }}
            >
              {item.titulo}
            </span>
            {item.status === "pausado" && (
              <span className="shrink-0 rounded-full bg-etiqueta px-2 text-xs font-semibold text-tinta-2">Pausado</span>
            )}
            {item.prioridade && (
              <button
                type="button"
                title="Trocar prioridade"
                onClick={(e) => {
                  e.stopPropagation();
                  acoes.abrirMenu("prioridade");
                }}
                className={`shrink-0 rounded-full px-2 text-xs font-semibold hover:ring-1 hover:ring-current ${ETIQUETA_PRIORIDADE[item.prioridade_cor ?? "cinza"]}`}
              >
                {item.prioridade}
              </button>
            )}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 truncate text-[13px] text-suave">
            <span
              title={NOME_ORIGEM[item.origem] ?? item.origem}
              className={`size-2 shrink-0 rounded-full ${COR_ORIGEM[item.origem] ?? COR_ORIGEM.manual}`}
            />
            <Campo texto={item.pessoa} vazio="+ quem pediu" titulo="Quem pediu (@)" aoClicar={() => acoes.editar("pessoa")} />
            <Campo texto={item.projeto} vazio="+ projeto" titulo="Projeto (#)" aoClicar={() => acoes.editar("projeto")} />
            {extras.length > 0 && <span className="truncate">{extras.join(" · ")}</span>}
          </div>
        </div>

        {/* Ações: aparecem ao passar o mouse ou no item selecionado. */}
        <div className={`flex shrink-0 items-center ${ativo ? "" : "opacity-0 group-hover:opacity-100"}`}>
          {lista === "inbox" ? (
            <Acao icone="seta" titulo="Mover para A fazer (Enter)" aoClicar={() => acoes.mover("a_fazer")} />
          ) : (
            <Acao icone="voltar" titulo="Voltar para a caixa de entrada" aoClicar={() => acoes.mover("inbox")} />
          )}
          <Acao icone="foco" titulo={item.status === "pausado" ? "Retomar o foco (F)" : "Focar agora (F)"} aoClicar={acoes.focar} />
          {!item.prioridade && <Acao icone="bandeira" titulo="Prioridade" aoClicar={() => acoes.abrirMenu("prioridade")} />}
          {!item.prazo && <Acao icone="calendario" titulo="Prazo (P)" aoClicar={() => acoes.abrirMenu("prazo")} />}
          {item.link && <Acao icone="link" titulo="Abrir o link (O)" aoClicar={acoes.abrirLink} />}
          <Acao icone="arquivar" titulo="Arquivar (E)" aoClicar={acoes.arquivar} />
        </div>

        <div className="w-16 shrink-0 text-right">
          {prazo && (
            <button
              type="button"
              title="Trocar prazo"
              onClick={(e) => {
                e.stopPropagation();
                acoes.abrirMenu("prazo");
              }}
              className={`rounded px-1 -mx-1 text-sm hover:bg-etiqueta ${classePrazo(prazo)}`}
            >
              {maiuscula(prazo)}
            </button>
          )}
          <div className="text-xs tabular-nums text-apagado" title="Parado há">
            {tempoParado(lista === "inbox" ? item.criado_em : item.atualizado_em, agora)}
          </div>
        </div>
      </div>

      {children}

      {menu && (
        <>
          {/* Clique fora fecha. */}
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              e.stopPropagation();
              acoes.abrirMenu(null);
            }}
          />
          <div
            ref={(el) => el?.scrollIntoView({ block: "nearest" })}
            className="absolute top-full right-4 z-20 mt-1 rounded-xl border border-linha bg-cartao p-2 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                acoes.abrirMenu(null);
              }
            }}
          >
            {menu === "prioridade" ? (
              <ul className="flex min-w-44 flex-col">
                {[{ id: null as string | null, nome: "Nenhuma", cor: null }, ...prioridades].map((p, i) => (
                  <li key={p.id ?? "nenhuma"}>
                    <button
                      type="button"
                      autoFocus={p.id === item.prioridade_id}
                      onClick={() => acoes.definirPrioridade(p.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-etiqueta ${
                        p.id === item.prioridade_id ? "font-semibold" : ""
                      }`}
                    >
                      <span className={`size-2.5 rounded-full ${p.cor ? BOLINHA_PRIORIDADE[p.cor] : "border border-apagado"}`} />
                      <span className="flex-1">{p.nome}</span>
                      <kbd className="font-sans text-xs text-apagado">{i === 0 ? "0" : i <= 9 ? i : ""}</kbd>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div>
                <div className="flex gap-1.5 px-1 pt-1">
                  {[
                    { nome: "Sem prazo", valor: null },
                    { nome: "Hoje", valor: hoje },
                    { nome: "Amanhã", valor: amanha },
                  ].map((o) => (
                    <button
                      key={o.nome}
                      type="button"
                      onClick={() => acoes.definirPrazo(o.valor)}
                      className={`rounded-full px-3 py-1 text-[13px] ${
                        item.prazo === o.valor ? "bg-destaque font-semibold text-folha" : "bg-etiqueta text-tinta-2 hover:text-tinta"
                      }`}
                    >
                      {o.nome}
                    </button>
                  ))}
                </div>
                <Calendario valor={item.prazo} aoEscolher={acoes.definirPrazo} aoFechar={() => acoes.abrirMenu(null)} />
              </div>
            )}
          </div>
        </>
      )}
    </li>
  );
}
