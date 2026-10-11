import { useState } from "react";
import { dataLocalIso, descreverPrazo, formatarDuracao, tempoParado } from "../captura/datas";
import type { Item, Lista } from "../db/itens";
import type { Prioridade } from "../db/prioridades";
import Calendario from "./captura/Calendario";
import { BOLINHA_PRIORIDADE, ETIQUETA_PRIORIDADE } from "./cores";
import Icone, { type NomeIcone } from "./Icone";
import { COR_ORIGEM, NOME_ORIGEM } from "./origens";

export type Menu = "prazo" | "prometido" | "prioridade" | "aguardando";
export type CampoEditavel = "prazo" | "projeto" | "pessoa" | "titulo" | "nota";

export interface AcoesItem {
  selecionar: () => void;
  concluir: () => void;
  focar: () => void;
  mover: (lista: Lista) => void;
  arquivar: () => void;
  abrirLink: () => void;
  editar: (campo: CampoEditavel) => void;
  definirPrazo: (prazo: string | null) => void;
  definirPrometido: (data: string | null) => void;
  cobrar: () => void;
  definirPrioridade: (id: string | null) => void;
  /** Põe em Aguardando: de quem é a vez e quando cobrar o retorno. */
  aguardar: (quem: string | null, ate: string | null) => void;
  /** Copia uma linha com o status, pronta para responder no Teams. */
  copiarStatus: () => void;
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

/** "prometido sexta", em vermelho se a promessa vence hoje ou já passou. */
function classePromessa(texto: string): string {
  if (texto.startsWith("atrasado")) return "font-semibold text-atraso";
  if (texto === "hoje") return "font-semibold text-destaque";
  return "";
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
  const promessa = item.prometido_para ? descreverPrazo(item.prometido_para, agora) : null;
  const hoje = dataLocalIso(agora);
  const amanha = dataLocalIso(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1));
  const retorno = item.status !== "aguardando" && item.aguardando_ate && item.aguardando_ate <= hoje;
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
            {item.dia_planejado === hoje && (
              <span title="Escolhido para hoje em Meu dia" className="shrink-0 rounded-full bg-destaque-claro px-2 text-xs font-semibold text-destaque-tinta">
                Do dia
              </span>
            )}
            {item.status === "pausado" && (
              <span className="shrink-0 rounded-full bg-etiqueta px-2 text-xs font-semibold text-tinta-2">Pausado</span>
            )}
            {item.status === "aguardando" && (
              <button
                type="button"
                title="De quem é a vez e quando cobrar (W)"
                onClick={(e) => {
                  e.stopPropagation();
                  acoes.abrirMenu("aguardando");
                }}
                className="shrink-0 rounded-full bg-etiqueta px-2 text-xs font-semibold text-tinta-2 hover:ring-1 hover:ring-current"
              >
                {item.aguardando_quem ? `esperando ${item.aguardando_quem}` : "esperando"}
                {item.aguardando_ate && ` · cobrar ${descreverPrazo(item.aguardando_ate, agora)}`}
              </button>
            )}
            {retorno && (
              <span title="Voltou de Aguardando: hora de cobrar o retorno" className="shrink-0 rounded-full bg-atraso-claro px-2 text-xs font-semibold text-atraso">
                {item.aguardando_quem ? `cobrar ${item.aguardando_quem}` : "cobrar retorno"}
              </span>
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
          <div className="mt-0.5 flex h-5 min-w-0 items-center gap-2 truncate text-[13px] text-suave">
            <span
              title={NOME_ORIGEM[item.origem] ?? item.origem}
              className={`size-2 shrink-0 rounded-full ${COR_ORIGEM[item.origem] ?? COR_ORIGEM.manual}`}
            />
            <Campo texto={item.pessoa} vazio="+ quem pediu" titulo="Quem pediu (@)" aoClicar={() => acoes.editar("pessoa")} />
            {item.cobrancas > 0 && (
              <span className="shrink-0 font-semibold text-atraso" title="Cobranças registradas com B">
                cobrou {item.cobrancas}×
              </span>
            )}
            {promessa && (
              <button
                type="button"
                title="Data que você prometeu (M)"
                onClick={(e) => {
                  e.stopPropagation();
                  acoes.abrirMenu("prometido");
                }}
                className={`-mx-1 shrink-0 rounded px-1 hover:bg-etiqueta ${classePromessa(promessa)}`}
              >
                prometido {promessa}
              </button>
            )}
            <Campo texto={item.projeto} vazio="+ projeto" titulo="Projeto (#)" aoClicar={() => acoes.editar("projeto")} />
            {extras.length > 0 && <span className="truncate">{extras.join(" · ")}</span>}
          </div>
          {item.nota && !children && (
            <button
              type="button"
              title="Descrição: clique para editar (D)"
              onClick={(e) => {
                e.stopPropagation();
                acoes.editar("nota");
              }}
              className="mt-1 block w-full truncate rounded text-left text-[13px] text-apagado hover:text-tinta-2"
            >
              {item.nota.replace(/\s+/g, " ")}
            </button>
          )}
        </div>

        {/* Ações: aparecem ao passar o mouse ou no item selecionado. Em janela estreita, só no
            selecionado e numa linha embaixo, para não espremer o título. */}
        <div
          className={`shrink-0 items-center ${
            ativo
              ? "order-last flex basis-full pl-9 lg:order-none lg:basis-auto lg:pl-0"
              : "hidden opacity-0 group-hover:opacity-100 lg:flex"
          }`}
        >
          {lista === "inbox" ? (
            <Acao icone="seta" titulo="Mover para A fazer (Enter)" aoClicar={() => acoes.mover("a_fazer")} />
          ) : lista === "aguardando" ? (
            <Acao icone="voltar" titulo="Voltar para A fazer (Enter)" aoClicar={() => acoes.mover("a_fazer")} />
          ) : (
            <Acao icone="voltar" titulo="Voltar para a caixa de entrada" aoClicar={() => acoes.mover("inbox")} />
          )}
          {lista !== "aguardando" && (
            <Acao icone="ampulheta" titulo="Aguardando alguém (W)" aoClicar={() => acoes.abrirMenu("aguardando")} />
          )}
          <Acao icone="foco" titulo={item.status === "pausado" ? "Retomar o foco (F)" : "Focar agora (F)"} aoClicar={acoes.focar} />
          {!item.prioridade && <Acao icone="bandeira" titulo="Prioridade" aoClicar={() => acoes.abrirMenu("prioridade")} />}
          {!item.prazo && <Acao icone="calendario" titulo="Prazo e promessa (P, M)" aoClicar={() => acoes.abrirMenu("prazo")} />}
          {!item.nota && <Acao icone="texto" titulo="Descrição (D)" aoClicar={() => acoes.editar("nota")} />}
          <Acao icone="cobrar" titulo="Cobrou de novo (B)" aoClicar={acoes.cobrar} />
          {item.link && <Acao icone="link" titulo="Abrir o link (O)" aoClicar={acoes.abrirLink} />}
          <Acao icone="copiar" titulo="Copiar o status para responder (Ctrl+C)" aoClicar={acoes.copiarStatus} />
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
            {menu === "aguardando" ? (
              <MenuAguardando item={item} agora={agora} acoes={acoes} />
            ) : menu === "prioridade" ? (
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
              <MenuData item={item} menu={menu} hoje={hoje} amanha={amanha} acoes={acoes} />
            )}
          </div>
        </>
      )}
    </li>
  );
}

/** Popover de datas: o prazo ou a data prometida para quem pediu, com abas para trocar. */
function MenuData({ item, menu, hoje, amanha, acoes }: { item: Item; menu: Menu; hoje: string; amanha: string; acoes: AcoesItem }) {
  const prometido = menu === "prometido";
  const valor = prometido ? item.prometido_para : item.prazo;
  const definir = prometido ? acoes.definirPrometido : acoes.definirPrazo;
  const opcoes = [
    { nome: prometido ? "Não prometi" : "Sem prazo", valor: null as string | null },
    { nome: "Hoje", valor: hoje },
    { nome: "Amanhã", valor: amanha },
  ];
  if (prometido && item.prazo && item.prazo !== hoje && item.prazo !== amanha) {
    opcoes.push({ nome: "Igual ao prazo", valor: item.prazo });
  }
  const aba = (alvo: Menu, nome: string) => (
    <button
      type="button"
      onClick={() => acoes.abrirMenu(alvo)}
      className={`flex-1 rounded-md px-3 py-1 text-[13px] ${menu === alvo ? "bg-cartao font-semibold shadow-sm" : "text-suave hover:text-tinta"}`}
    >
      {nome}
    </button>
  );
  return (
    <div className="w-72">
      <div className="mx-1 flex gap-1 rounded-lg bg-etiqueta p-0.5">
        {aba("prazo", "Prazo")}
        {aba("prometido", item.pessoa ? `Prometi a ${item.pessoa}` : "Prometi para")}
      </div>
      <div className="flex flex-wrap gap-1.5 px-1 pt-2">
        {opcoes.map((o) => (
          <button
            key={o.nome}
            type="button"
            onClick={() => definir(o.valor)}
            className={`rounded-full px-3 py-1 text-[13px] ${
              valor === o.valor ? "bg-destaque font-semibold text-folha" : "bg-etiqueta text-tinta-2 hover:text-tinta"
            }`}
          >
            {o.nome}
          </button>
        ))}
      </div>
      <Calendario key={menu} valor={valor} aoEscolher={definir} aoFechar={() => acoes.abrirMenu(null)} />
    </div>
  );
}

/** Popover de Aguardando: de quem é a vez e quando cobrar o retorno. Enter confirma. */
function MenuAguardando({ item, agora, acoes }: { item: Item; agora: Date; acoes: AcoesItem }) {
  const [quem, setQuem] = useState(item.aguardando_quem ?? item.pessoa ?? "");
  const [ate, setAte] = useState<string | null>(item.aguardando_ate ?? diasDepois(agora, 2));
  const [calendario, setCalendario] = useState(false);
  const opcoes = [
    { nome: "Amanhã", valor: diasDepois(agora, 1) },
    { nome: "Em 2 dias", valor: diasDepois(agora, 2) },
    { nome: "Em 1 semana", valor: diasDepois(agora, 7) },
    { nome: "Sem data", valor: null as string | null },
  ];
  const confirmar = () => acoes.aguardar(quem.trim() || null, ate);
  return (
    <form
      className="flex w-72 flex-col gap-2 p-1"
      onSubmit={(e) => {
        e.preventDefault();
        confirmar();
      }}
    >
      <label className="text-xs font-semibold uppercase tracking-wider text-apagado">
        Esperando quem
        <input
          autoFocus
          value={quem}
          onChange={(e) => setQuem(e.target.value)}
          placeholder="Carlos, fornecedor, equipe de redes..."
          className="mt-1 w-full rounded-lg border border-linha bg-folha px-2.5 py-1.5 text-sm font-normal normal-case tracking-normal text-tinta outline-none focus:border-destaque"
        />
      </label>
      <p className="text-xs font-semibold uppercase tracking-wider text-apagado">Cobrar o retorno</p>
      <div className="flex flex-wrap gap-1.5">
        {opcoes.map((o) => (
          <button
            key={o.nome}
            type="button"
            onClick={() => setAte(o.valor)}
            className={`rounded-full px-3 py-1 text-[13px] ${
              ate === o.valor ? "bg-destaque font-semibold text-folha" : "bg-etiqueta text-tinta-2 hover:text-tinta"
            }`}
          >
            {o.nome}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCalendario(!calendario)}
          className={`rounded-full px-3 py-1 text-[13px] ${
            ate && !opcoes.some((o) => o.valor === ate) ? "bg-destaque font-semibold text-folha" : "bg-etiqueta text-tinta-2 hover:text-tinta"
          }`}
        >
          {ate && !opcoes.some((o) => o.valor === ate) ? descreverPrazo(ate, agora) : "Outra data"}
        </button>
      </div>
      {calendario && (
        <Calendario
          valor={ate}
          aoEscolher={(d) => {
            setAte(d);
            setCalendario(false);
          }}
          aoFechar={() => setCalendario(false)}
        />
      )}
      <p className="text-[13px] text-suave">
        {ate ? `No dia, o item volta para A fazer e o Juggl avisa para cobrar.` : "Fica em Aguardando até você tirar."}
      </p>
      <button type="submit" className="self-start rounded-lg bg-destaque px-3 py-1.5 text-sm font-semibold text-folha hover:opacity-90">
        Aguardar <kbd className="ml-1 font-sans font-normal opacity-70">Enter</kbd>
      </button>
    </form>
  );
}

function diasDepois(agora: Date, dias: number): string {
  return dataLocalIso(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + dias));
}
