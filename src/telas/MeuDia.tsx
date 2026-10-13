import { useEffect, useMemo, useState } from "react";
import { dataLocalIso, descreverPrazo, formatarCronometro, formatarDuracao } from "../captura/datas";
import { encerrarFoco, type Foco } from "../db/foco";
import { listarSessoes } from "../db/horas";
import type { Item, Mudancas } from "../db/itens";
import {
  concluidosDoDia,
  diaFechadoHoje,
  fecharDia,
  itensDoQuadro,
  marcarDiaPlanejado,
  type Destino,
} from "../db/ritual";
import { montarQuadro, NOME_QUANDO, proximoQuando, quandoPadrao } from "../ritual/quadro";
import { ETIQUETA_PRIORIDADE, FAIXA_PRIORIDADE } from "./cores";
import { COR_ORIGEM } from "./origens";
import SeletorSom from "./SeletorSom";

interface Props {
  /** Muda quando os itens mudam em outra tela, para recarregar. */
  versao: number;
  foco: Foco | null;
  planejado: boolean;
  /** Muda um item com desfazer (Z) e recarrega. */
  aoAplicar: (item: Item, mudancas: Mudancas, mensagem?: string) => Promise<void>;
  aoFocar: (item: Item) => void;
  aoPausar: () => void;
  aoConcluir: () => void;
  /** Algo mudou sem passar por aoAplicar (plano confirmado, dia fechado): recarrega tudo. */
  aoAlterar: () => void;
  aoAvisar: (texto: string) => void;
  /** Um cartão começou a ser arrastado (para soltar também na barra lateral). */
  aoArrastar: (item: Item) => void;
  /** Copia o resumo da daily (ontem, hoje, bloqueios). */
  aoCopiarDaily: () => void;
  /** Som do foco (na coluna Fazendo agora). */
  som: React.ComponentProps<typeof SeletorSom>;
  /** Clique num cartão: abre a tarefa para editar. */
  aoAbrir: (item: Item) => void;
  /** Atalho global da captura, para o primeiro uso. */
  atalhoCaptura: string;
}

type Coluna = "chegou" | "hoje" | "fazendo" | "feito" | "depois";

const TIPO_ITEM = "text/juggl-item";

const ETAPAS = ["Triar o que chegou", "Planejar o dia", "Focar", "Fechar o dia"];

function Etiqueta({ children, classe = "bg-etiqueta text-tinta-2" }: { children: React.ReactNode; classe?: string }) {
  return <span className={`shrink-0 rounded-full px-2 text-xs font-semibold ${classe}`}>{children}</span>;
}

interface PropsCartao {
  item: Item;
  hoje: Date;
  /** Atributos de arrasto do cartão. */
  arrasto: React.HTMLAttributes<HTMLElement>;
  aoAbrir: (item: Item) => void;
  numero?: number;
  children?: React.ReactNode;
}

/** Clique no cartão abre a tarefa, menos quando o clique foi num botão dentro dele. */
function aoClicarCartao(item: Item, aoAbrir: (item: Item) => void) {
  return (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    aoAbrir(item);
  };
}

/** Cartão de um item no quadro: título, quem pediu, cobranças, promessa e prazo. */
function Cartao({ item, hoje, arrasto, aoAbrir, numero, children }: PropsCartao) {
  const prazo = item.prazo ? descreverPrazo(item.prazo, hoje) : null;
  const promessa = item.prometido_para ? descreverPrazo(item.prometido_para, hoje) : null;
  const urgente = (t: string | null) => !!t && (t.startsWith("atrasado") || t === "hoje");
  return (
    <article
      {...arrasto}
      onClick={aoClicarCartao(item, aoAbrir)}
      title="Clique para abrir. Arraste para mudar de coluna."
      className={`flex cursor-pointer flex-col gap-1 rounded-xl bg-cartao px-3 py-2.5 shadow-[0_0_0_1px_var(--color-linha)] hover:shadow-[0_0_0_1.5px_var(--color-destaque)] active:cursor-grabbing ${
        item.prioridade_cor ? `border-l-4 ${FAIXA_PRIORIDADE[item.prioridade_cor]}` : ""
      }`}
    >
      <div className="flex items-baseline gap-2">
        {numero !== undefined ? (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-destaque text-[11px] font-bold text-folha">
            {numero}
          </span>
        ) : (
          <span className={`size-2 shrink-0 -translate-y-px rounded-full ${COR_ORIGEM[item.origem] ?? COR_ORIGEM.manual}`} />
        )}
        <span className="min-w-0 flex-1 text-[15px] leading-snug font-medium break-words">{item.titulo}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-suave">
        {children}
        {item.pessoa && <span>{item.pessoa}</span>}
        {item.cobrancas > 0 && <Etiqueta classe="bg-atraso-claro text-atraso">cobrou {item.cobrancas}×</Etiqueta>}
        {promessa && (
          <Etiqueta classe={urgente(promessa) ? "bg-atraso-claro text-atraso" : undefined}>prometido {promessa}</Etiqueta>
        )}
        {prazo && <Etiqueta classe={urgente(prazo) ? "bg-atraso-claro text-atraso" : undefined}>{prazo}</Etiqueta>}
        {item.prioridade && <Etiqueta classe={ETIQUETA_PRIORIDADE[item.prioridade_cor ?? "cinza"]}>{item.prioridade}</Etiqueta>}
        {item.status === "pausado" && <Etiqueta>Pausado</Etiqueta>}
        {item.subtarefas > 0 && (
          <Etiqueta classe={item.subtarefas_feitas === item.subtarefas ? "bg-ok-claro text-ok" : undefined}>
            ☑ {item.subtarefas_feitas}/{item.subtarefas}
          </Etiqueta>
        )}
        {item.anexos > 0 && <Etiqueta>📎 {item.anexos}</Etiqueta>}
      </div>
      {item.nota_pausa && (
        <p className="line-clamp-2 text-[13px] text-suave" title={item.nota_pausa}>
          Parou em: {item.nota_pausa}
        </p>
      )}
    </article>
  );
}

/** Tempo em foco hoje: sessões encerradas mais a que está rodando, cortadas na meia-noite. */
async function horasDeHoje(agora: Date): Promise<number> {
  const meiaNoite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const amanha = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);
  const sessoes = await listarSessoes(meiaNoite, amanha, agora);
  return sessoes.reduce(
    (total, s) => total + Math.max(0, Math.min(s.fim.getTime(), amanha.getTime()) - Math.max(s.inicio.getTime(), meiaNoite.getTime())),
    0,
  );
}

/**
 * Meu dia: o dia como um fluxo, em colunas. O que chegou, o que é para hoje (cada uma com um
 * "quando"), o que está em foco e o que já foi feito; o resto de A fazer fica em Depois.
 * Planejar o dia é arrastar cartões para Hoje; Fechar o dia decide o destino do que sobrou.
 */
export default function MeuDia({
  versao,
  foco,
  planejado,
  aoAplicar,
  aoFocar,
  aoPausar,
  aoConcluir,
  aoAlterar,
  aoAvisar,
  aoArrastar,
  aoCopiarDaily,
  aoAbrir,
  som,
  atalhoCaptura,
}: Props) {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [feitos, setFeitos] = useState<Item[]>([]);
  const [horas, setHoras] = useState(0);
  const [fechado, setFechado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<Coluna | null>(null);
  const [depoisAberto, setDepoisAberto] = useState<boolean | null>(null);
  const [fechando, setFechando] = useState<Record<string, Destino> | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const hoje = new Date(agora);
  const diaHoje = dataLocalIso(hoje);

  useEffect(() => {
    const data = new Date();
    Promise.all([itensDoQuadro(), concluidosDoDia(data), horasDeHoje(data), diaFechadoHoje(data)])
      .then(([abertos, concluidos, tempo, jaFechado]) => {
        setItens(abertos);
        setFeitos(concluidos);
        setHoras(tempo);
        setFechado(jaFechado);
      })
      .catch((e) => setErro(String(e)));
  }, [versao, diaHoje]);

  // Relógio do foco e da soma de horas de hoje.
  useEffect(() => {
    setAgora(Date.now());
    if (!foco) return;
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(relogio);
  }, [foco]);

  const quadro = useMemo(() => montarQuadro(itens ?? [], hoje), [itens, diaHoje]);
  const todos = useMemo(() => new Map((itens ?? []).concat(feitos).map((i) => [i.id, i])), [itens, feitos]);

  if (erro) return <p className="rounded-xl bg-atraso-claro px-4 py-3 text-sm text-atraso">{erro}</p>;
  if (!itens) return null;

  const sessao = foco ? agora - new Date(foco.inicio).getTime() : 0;
  const totalDepois = quadro.depois.reduce((n, g) => n + g.itens.length, 0);
  // Depois fica aberto enquanto Hoje tem vaga, para escolher dali; depois recolhe.
  const mostrarDepois = depoisAberto ?? quadro.hoje.length === 0;

  const etapaFeita = [quadro.chegou.length === 0, planejado, fechado, fechado];
  const etapaAtual = etapaFeita.findIndex((f) => !f);

  async function planejar(item: Item) {
    if (item.dia_planejado === diaHoje && item.status !== "inbox") return;
    const mudancas: Mudancas = { dia_planejado: diaHoje, quando: item.quando ?? quandoPadrao(new Date()) };
    if (item.status === "inbox" || item.status === "feito") mudancas.status = "a_fazer";
    await marcarDiaPlanejado();
    await aoAplicar(item, mudancas, "Escolhido para hoje");
  }

  /** Soltar um cartão numa coluna. */
  async function soltar(coluna: Coluna, id: string) {
    setAlvo(null);
    const item = todos.get(id) ?? (foco?.item.id === id ? foco.item : null);
    if (!item) return;
    const emFoco = item.status === "em_foco";
    try {
      if (coluna === "fazendo") {
        if (!emFoco) aoFocar(item);
      } else if (coluna === "feito") {
        if (emFoco) aoConcluir();
        else if (item.status !== "feito") await aoAplicar(item, { status: "feito" }, "Concluído");
      } else if (emFoco) {
        aoAvisar("Esse item está em foco. Pause ou conclua antes de mudar de coluna.");
      } else if (coluna === "hoje") {
        await planejar(item);
      } else if (item.status === "feito") {
        await aoAplicar(item, { status: coluna === "chegou" ? "inbox" : "a_fazer" }, "Reaberto");
      } else if (coluna === "chegou") {
        if (item.status !== "inbox")
          await aoAplicar(item, { status: "inbox", dia_planejado: null, quando: null }, "Voltou para a caixa de entrada");
      } else {
        const mudancas: Mudancas = { dia_planejado: null, quando: null };
        if (item.status === "inbox") mudancas.status = "a_fazer";
        if (item.status !== "inbox" && item.dia_planejado !== diaHoje) return;
        await aoAplicar(item, mudancas, item.status === "inbox" ? "Movido para A fazer" : "Tirado de hoje");
      }
    } catch (e) {
      setErro(String(e));
    }
  }

  function alvoDaColuna(coluna: Coluna) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(TIPO_ITEM)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setAlvo(coluna);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAlvo((a) => (a === coluna ? null : a));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        soltar(coluna, e.dataTransfer.getData(TIPO_ITEM));
      },
    };
  }

  function arrastavel(item: Item) {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.setData(TIPO_ITEM, item.id);
        e.dataTransfer.effectAllowed = "move";
        aoArrastar(item);
      },
      onDragEnd: () => setAlvo(null),
    };
  }

  async function confirmarPlano() {
    try {
      await marcarDiaPlanejado();
      aoAvisar(quadro.hoje.length > 0 ? "Dia planejado. Bom trabalho." : "Dia sem plano fixo. Bom trabalho.");
      aoAlterar();
    } catch (e) {
      setErro(String(e));
    }
  }

  function abrirFechamento() {
    const sobras = quadro.hoje.filter((i) => i.status !== "em_foco");
    setFechando(Object.fromEntries(sobras.map((i) => [i.id, "amanha" as Destino])));
  }

  async function concluirFechamento() {
    if (!fechando) return;
    try {
      // O foco é pausado sem pedir a nota: o dia está acabando.
      if (foco) await encerrarFoco(foco, "pausa");
      const destinos = Object.entries(fechando).flatMap(([id, destino]) => {
        const item = todos.get(id);
        return item ? [{ item, destino }] : [];
      });
      await fecharDia(destinos);
      const amanha = destinos.filter((d) => d.destino === "amanha").length;
      setFechando(null);
      aoAvisar(
        amanha > 0
          ? `Dia fechado. ${amanha === 1 ? "Um item já está" : `${amanha} itens já estão`} em Hoje amanhã.`
          : "Dia fechado. Até amanhã.",
      );
      aoAlterar();
    } catch (e) {
      setErro(String(e));
    }
  }

  const classeColuna = (coluna: Coluna, base: string) =>
    `flex min-w-0 flex-col gap-2 rounded-2xl p-3 ${alvo === coluna ? "bg-destaque-claro ring-2 ring-destaque" : base}`;

  const tituloColuna = (titulo: string, extra?: React.ReactNode) => (
    <h2 className="flex items-baseline justify-between gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-tinta-2">
      {titulo}
      {extra !== undefined && <span className="font-normal normal-case tracking-normal text-apagado tabular-nums">{extra}</span>}
    </h2>
  );

  const botaoPequeno = "rounded-md px-2 text-[13px] font-semibold text-suave hover:bg-etiqueta hover:text-tinta";

  // Banco vazio: a primeira vez de alguém (um colega instalando). Três passos em vez de colunas vazias.
  const primeiraVez = itens.length === 0 && feitos.length === 0 && !foco;

  return (
    <div className="flex flex-col gap-5 pb-6">
      {primeiraVez && (
        <section aria-label="Primeiros passos" className="rounded-2xl bg-cartao px-6 py-5 shadow-[0_0_0_1px_var(--color-linha)]">
          <h2 className="font-titulo text-[22px] font-medium">Bem-vindo ao Juggl</h2>
          <p className="mt-1 text-sm text-suave">Tudo fica neste computador. Três passos para o primeiro dia:</p>
          <ol className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              ["Anote", `Em qualquer janela, aperte ${atalhoCaptura}, escreva a tarefa e Enter. Leva 3 segundos e você volta ao que estava fazendo.`],
              ["Planeje", "Aqui em Meu dia, arraste até 3 pedidos para Hoje. É o que importa no dia."],
              ["Foque", "Clique em Focar: o timer conta as horas por projeto, prontas para o apontamento de sexta."],
            ].map(([titulo, texto], i) => (
              <li key={titulo} className="rounded-xl bg-folha px-4 py-3">
                <p className="flex items-center gap-2 text-[15px] font-semibold">
                  <b className="flex size-5 items-center justify-center rounded-full bg-destaque text-[11px] text-folha">{i + 1}</b>
                  {titulo}
                </p>
                <p className="mt-1 text-[13px] leading-snug text-suave">{texto}</p>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[13px] text-apagado">Ctrl+K busca qualquer coisa, e ! anota o que irritar no uso.</p>
        </section>
      )}
      <div className="-mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <ol aria-label="Fluxo do dia" className="flex flex-1 flex-wrap gap-1.5">
          {ETAPAS.map((etapa, i) => {
            const feita = etapaFeita[i];
            const atual = i === etapaAtual;
            const conteudo = (
              <>
                <b
                  className={`flex size-5 items-center justify-center rounded-full text-[11px] ${
                    feita ? "bg-ok text-folha" : atual ? "bg-destaque text-folha" : "bg-folha text-suave"
                  }`}
                >
                  {feita ? "✓" : i + 1}
                </b>
                {etapa}
              </>
            );
            const classe = `flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-[13px] ${
              feita ? "bg-ok-claro text-ok" : atual ? "bg-destaque-claro font-semibold text-destaque-tinta" : "bg-etiqueta text-suave"
            }`;
            return (
              <li key={etapa}>
                {i === 3 && !fechado ? (
                  <button type="button" onClick={abrirFechamento} className={`${classe} ring-1 ring-destaque hover:opacity-90`}>
                    {conteudo}
                  </button>
                ) : (
                  <span className={classe}>{conteudo}</span>
                )}
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={aoCopiarDaily}
          title="Copia o que foi feito ontem, o que é para hoje e o que está travado (Ctrl+C)"
          className="rounded-lg px-3 py-1 text-[13px] font-semibold text-suave hover:bg-etiqueta hover:text-tinta"
        >
          Copiar para a daily <kbd className="ml-1 font-sans font-normal text-apagado">Ctrl+C</kbd>
        </button>
      </div>

      {fechando && (
        <section aria-label="Fechar o dia" className="flex flex-col gap-3 rounded-2xl bg-cartao px-5 py-4 shadow-[0_0_0_1.5px_var(--color-destaque)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-titulo text-[22px] font-medium">Fechar o dia</h2>
              <p className="text-sm text-suave">Decida o destino de cada item que sobrou em Hoje. Nada fica solto para amanhã.</p>
            </div>
            <p className="flex gap-4 text-sm text-suave">
              <span>
                <b className="text-tinta tabular-nums">{feitos.length}</b> {feitos.length === 1 ? "feito" : "feitos"}
              </span>
              <span>
                <b className="text-tinta tabular-nums">{formatarDuracao(horas + (foco ? sessao : 0))}</b> em foco
              </span>
            </p>
          </div>
          {foco && (
            <p className="text-sm text-suave">
              <b className="text-tinta">{foco.item.titulo}</b> está em foco: ao fechar, ele é pausado.
            </p>
          )}
          <ul className="flex flex-col gap-1.5">
            {Object.keys(fechando).length === 0 && <li className="text-sm text-suave">Nada sobrou em Hoje.</li>}
            {Object.entries(fechando).map(([id, destino]) => (
              <li key={id} className="flex flex-wrap items-center gap-2 rounded-lg bg-folha px-3 py-2">
                <span className="min-w-[12ch] flex-1 font-medium">{todos.get(id)?.titulo}</span>
                {(
                  [
                    ["amanha", "Amanhã"],
                    ["depois", "Depois"],
                    ["feito", "Concluí"],
                  ] as const
                ).map(([valor, rotulo]) => (
                  <button
                    key={valor}
                    type="button"
                    aria-pressed={destino === valor}
                    onClick={() => setFechando({ ...fechando, [id]: valor })}
                    className={`rounded-lg border px-3 py-1 text-[13px] font-semibold ${
                      destino === valor ? "border-destaque bg-destaque text-folha" : "border-linha hover:bg-etiqueta"
                    }`}
                  >
                    {rotulo}
                  </button>
                ))}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={concluirFechamento}
              className="rounded-lg bg-destaque px-4 py-2 text-sm font-semibold text-folha hover:opacity-90"
            >
              Fechar o dia
            </button>
            <button type="button" onClick={() => setFechando(null)} className="rounded-lg px-3 py-2 text-sm text-suave hover:bg-etiqueta">
              Agora não
            </button>
          </div>
        </section>
      )}

      <section aria-label="Quadro do dia" className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1.15fr_1.25fr_1fr]">
        <div {...alvoDaColuna("chegou")} className={classeColuna("chegou", "bg-lateral")}>
          {tituloColuna("Chegou", quadro.chegou.length || "")}
          <p className="px-1 text-[13px] text-suave">
            {quadro.chegou.length === 0 ? "Nada esperando triagem." : "Pedidos novos. Arraste para Hoje ou para Depois."}
          </p>
          {quadro.chegou.map((item) => (
            <Cartao key={item.id} item={item} hoje={hoje} arrasto={arrastavel(item)} aoAbrir={aoAbrir}>
              <button type="button" onClick={() => planejar(item)} className={botaoPequeno}>
                + Hoje
              </button>
            </Cartao>
          ))}
        </div>

        <div {...alvoDaColuna("hoje")} className={classeColuna("hoje", "bg-cartao shadow-[0_0_0_1px_var(--color-linha)]")}>
          {tituloColuna("Hoje", String(quadro.hoje.length))}
          <p className="px-1 text-[13px] text-suave">O que você vai fazer hoje. Clique no "quando" para trocar.</p>
          {quadro.hoje.map((item, i) =>
            item.status === "em_foco" ? (
              <p key={item.id} className="flex items-start gap-2 rounded-xl border border-dashed border-destaque px-3 py-2 text-[13px] text-destaque-tinta">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-destaque-claro text-[11px] font-bold">{i + 1}</span>
                <span className="min-w-0 flex-1 leading-snug break-words" title={item.titulo}>
                  {item.titulo}
                </span>
                <span className="shrink-0 self-start">em foco</span>
              </p>
            ) : (
              <Cartao key={item.id} item={item} hoje={hoje} arrasto={arrastavel(item)} aoAbrir={aoAbrir} numero={i + 1}>
                <button
                  type="button"
                  title="Quando você pretende fazer (clique para trocar)"
                  onClick={() => aoAplicar(item, { quando: proximoQuando(item.quando) })}
                  className="rounded-full border border-dashed border-destaque bg-destaque-claro px-2 text-xs font-semibold text-destaque-tinta"
                >
                  {item.quando ? NOME_QUANDO[item.quando] : "quando?"}
                </button>
                <button type="button" onClick={() => aoFocar(item)} className={botaoPequeno}>
                  Focar
                </button>
              </Cartao>
            ),
          )}
          {quadro.hoje.length === 0 && (
            <p className="rounded-xl border-[1.5px] border-dashed border-linha px-3 py-2.5 text-[13px] text-apagado">
              Arraste itens para cá.
            </p>
          )}
          {!planejado && (
            <button
              type="button"
              onClick={confirmarPlano}
              className="mt-1 self-start rounded-lg bg-destaque px-3 py-1.5 text-[13px] font-semibold text-folha hover:opacity-90"
            >
              {quadro.hoje.length > 0 ? "Confirmar o plano" : "Seguir sem plano hoje"}
            </button>
          )}
        </div>

        <div
          {...alvoDaColuna("fazendo")}
          className={classeColuna(
            "fazendo",
            foco ? "bg-cartao shadow-[0_0_0_1.5px_var(--color-destaque)]" : "border border-dashed border-linha",
          )}
        >
          {tituloColuna("Fazendo agora")}
          {foco ? (
            <article
              {...arrastavel(foco.item)}
              onClick={aoClicarCartao(foco.item, aoAbrir)}
              title="Clique para abrir a tarefa"
              className="flex cursor-pointer flex-col gap-1 rounded-xl bg-folha px-3 py-3"
            >
              <p className="text-[15px] leading-snug font-semibold break-words">{foco.item.titulo}</p>
              <p className="text-[13px] text-suave">
                {[foco.item.pessoa, foco.item.projeto].filter(Boolean).join(" · ")}
                {foco.item.cobrancas > 0 && <span className="font-semibold text-atraso"> · cobrou {foco.item.cobrancas}×</span>}
              </p>
              <p className="mt-1 font-titulo text-4xl font-medium tabular-nums tracking-tight">{formatarCronometro(sessao)}</p>
              <p className="text-[13px] text-apagado">
                {foco.item.tempo_ms > 0 ? `${formatarDuracao(foco.item.tempo_ms + sessao)} no total neste item` : "Primeira sessão neste item"}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={aoPausar}
                  title="Para o timer. A tarefa continua aberta."
                  className="rounded-lg bg-destaque px-3 py-1 text-[13px] font-semibold text-folha hover:opacity-90"
                >
                  Parar timer
                </button>
                <button
                  type="button"
                  onClick={aoConcluir}
                  title="Para o timer e fecha a tarefa (Z desfaz)"
                  className="rounded-lg border border-linha px-3 py-1 text-[13px] font-semibold hover:bg-etiqueta"
                >
                  Concluir tarefa
                </button>
              </div>
              <div className="mt-1">
                <SeletorSom {...som} compacto />
              </div>
            </article>
          ) : (
            <p className="px-1 text-[13px] text-suave">Nada em foco. Clique em Focar num item de Hoje ou arraste um cartão para cá.</p>
          )}
          <p className="px-1 text-[13px] text-apagado">Uma coisa por vez. Parar o timer guarda onde você parou.</p>
        </div>

        <div {...alvoDaColuna("feito")} className={classeColuna("feito", "bg-lateral")}>
          {tituloColuna("Feito hoje", feitos.length || "")}
          {feitos.length === 0 && <p className="px-1 text-[13px] text-suave">Ainda nada concluído hoje.</p>}
          {feitos.map((item) => (
            <article
              key={item.id}
              {...arrastavel(item)}
              onClick={() => aoAbrir(item)}
              title="Clique para abrir. Arraste de volta para reabrir."
              className="cursor-pointer rounded-xl bg-cartao px-3 py-2 text-[14px] text-suave line-through decoration-apagado shadow-[0_0_0_1px_var(--color-linha)]"
            >
              {item.titulo}
            </article>
          ))}
          <p className="mt-1 flex justify-between border-t border-linha px-1 pt-2 text-[13px] text-suave">
            Em foco hoje <b className="text-tinta tabular-nums">{formatarDuracao(horas + (foco ? sessao : 0))}</b>
          </p>
        </div>
      </section>

      <section {...alvoDaColuna("depois")} className={classeColuna("depois", "bg-lateral")}>
        <button
          type="button"
          aria-expanded={mostrarDepois}
          onClick={() => setDepoisAberto(!mostrarDepois)}
          className="flex items-baseline gap-2 px-1 text-left text-xs font-semibold uppercase tracking-wider text-tinta-2"
        >
          <span aria-hidden="true">{mostrarDepois ? "▾" : "▸"}</span>
          Depois
          <span className="font-normal normal-case tracking-normal text-apagado">
            {totalDepois === 0 ? "nada" : `${totalDepois} ${totalDepois === 1 ? "item" : "itens"}`}
          </span>
        </button>
        {mostrarDepois &&
          quadro.depois.map((grupo) => (
            <div key={grupo.chave} className="flex flex-col gap-2">
              <h3 className="mt-1 px-1 text-[13px] font-semibold text-suave">
                {grupo.titulo} <span className="font-normal text-apagado">{grupo.itens.length}</span>
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                {grupo.itens.map((item) => (
                  <Cartao key={item.id} item={item} hoje={hoje} arrasto={arrastavel(item)} aoAbrir={aoAbrir}>
                    <button type="button" onClick={() => planejar(item)} className={botaoPequeno}>
                      + Hoje
                    </button>
                  </Cartao>
                ))}
              </div>
            </div>
          ))}
      </section>
    </div>
  );
}
