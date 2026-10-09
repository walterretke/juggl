import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { descreverPrazo, formatarDuracao, tempoParado } from "../captura/datas";
import { interpretarPrazo } from "../captura/parser";
import { agendarBackupDiario } from "../db/backup";
import { ATALHO_PADRAO, lerConfig } from "../db/config";
import {
  encerrarFoco,
  itemEmFoco,
  LIMITE_PULSO_MS,
  recuperarFocoAberto,
  registrarPulso,
  trocarFoco,
  type Foco,
} from "../db/foco";
import {
  alterarItem,
  buscarOuCriarPessoa,
  buscarOuCriarProjeto,
  contarPorLista,
  desfazerAlteracao,
  listarItens,
  listarSugestoes,
  type Alteracao,
  type Item,
  type Lista,
  type Mudancas,
} from "../db/itens";
import { listarPrioridades, type Prioridade } from "../db/prioridades";
import Agora from "./Agora";
import { ETIQUETA_PRIORIDADE } from "./cores";
import Configuracoes from "./Configuracoes";
import PedidoNota from "./PedidoNota";
import { COR_ORIGEM, NOME_ORIGEM, rotuloAtalho } from "./origens";

const MINUTO_MS = 60 * 1000;
const MAX_DESFAZER = 30;

/** Telas da janela principal: Agora (o foco) e as duas listas. */
type Tela = "agora" | Lista;
const TELAS: Tela[] = ["agora", "inbox", "a_fazer"];
const NOME_TELA: Record<Tela, string> = { agora: "Agora", inbox: "Caixa de entrada", a_fazer: "A fazer" };
const MAX_PROXIMAS = 3;
const MAX_TITULO_BANDEJA = 40;

interface Pedido {
  titulo: string;
  acao: (nota: string | null) => Promise<void>;
}

type CampoEditavel = "prazo" | "projeto" | "pessoa" | "titulo";

const ROTULO_CAMPO: Record<CampoEditavel, string> = {
  prazo: "Prazo (hoje, amanha, sexta, 15/10; vazio tira)",
  projeto: "Projeto (vazio tira)",
  pessoa: "Quem pediu (vazio tira)",
  titulo: "Título",
};


interface Edicao {
  campo: CampoEditavel;
  valor: string;
  erro: string | null;
}

function valorAtual(item: Item, campo: CampoEditavel): string {
  if (campo === "prazo") return item.prazo ? item.prazo.split("-").reverse().slice(0, 2).join("/") : "";
  if (campo === "projeto") return item.projeto ?? "";
  if (campo === "pessoa") return item.pessoa ?? "";
  return item.titulo;
}

/** Converte o texto digitado na edição em mudanças no item, ou devolve uma mensagem de erro. */
async function mudancasDaEdicao(campo: CampoEditavel, texto: string): Promise<Mudancas | string> {
  const valor = texto.trim();
  if (campo === "titulo") return valor ? { titulo: valor } : "O título não pode ficar vazio.";
  if (campo === "prazo") {
    if (!valor) return { prazo: null };
    const prazo = interpretarPrazo(valor.replace(/^>/, ""), new Date());
    return prazo ? { prazo } : "Não entendi o prazo. Use hoje, amanha, sexta ou 15/10.";
  }
  const nome = valor.replace(/^[@#]/, "");
  if (campo === "projeto") return { projeto_id: nome ? await buscarOuCriarProjeto(nome) : null };
  return { pessoa_id: nome ? await buscarOuCriarPessoa(nome) : null };
}

function classePrazo(prazo: string, agora: Date): string {
  const texto = descreverPrazo(prazo, agora);
  if (texto.startsWith("atrasado")) return "font-semibold text-atraso";
  if (texto === "hoje") return "font-semibold text-destaque";
  return "text-suave";
}

export default function Principal() {
  const [lista, setLista] = useState<Tela>("inbox");
  const [foco, setFoco] = useState<Foco | null>(null);
  const [proximas, setProximas] = useState<Item[]>([]);
  const [pedidoNota, setPedidoNota] = useState<Pedido | null>(null);
  const [pronto, setPronto] = useState(false);
  const primeiraCarga = useRef(true);
  const ultimoPulso = useRef(Date.now());
  const [itens, setItens] = useState<Item[] | null>(null);
  const [contagem, setContagem] = useState<Record<Lista, number>>({ inbox: 0, a_fazer: 0 });
  const [selecionado, setSelecionado] = useState(0);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [configAberta, setConfigAberta] = useState(false);
  const [sugestoes, setSugestoes] = useState<{ pessoas: string[]; projetos: string[] }>({ pessoas: [], projetos: [] });
  const [aviso, setAviso] = useState<string | null>(null);
  const [atalho, setAtalho] = useState(ATALHO_PADRAO);
  const [avisoAtalho, setAvisoAtalho] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => new Date());
  const [prioridades, setPrioridades] = useState<Prioridade[]>([]);
  const desfazer = useRef<Alteracao[]>([]);
  const timerAviso = useRef<number | undefined>(undefined);

  const carregar = useCallback(async () => {
    try {
      const [emFoco, aFazer, total, opcoes] = await Promise.all([
        itemEmFoco(),
        listarItens("a_fazer"),
        contarPorLista(),
        listarPrioridades(),
      ]);
      setPrioridades(opcoes);
      const lidos = lista === "agora" ? [] : lista === "a_fazer" ? aFazer : await listarItens(lista);
      setFoco(emFoco);
      setProximas(aFazer.slice(0, MAX_PROXIMAS));
      setItens(lidos);
      setContagem(total);
      // Ao abrir o app, começa no Agora se tiver algo em foco.
      if (primeiraCarga.current) {
        primeiraCarga.current = false;
        if (emFoco) setLista("agora");
      }
      setSelecionado((s) => Math.min(s, Math.max(lidos.length - 1, 0)));
      setAgora(new Date());
    } catch (e) {
      setErro(String(e));
    }
  }, [lista]);

  // Registra o atalho global salvo (ou o padrão) ao abrir o app.
  useEffect(() => {
    lerConfig("atalho")
      .then((salvo) => salvo ?? ATALHO_PADRAO)
      .then(async (escolhido) => {
        setAtalho(escolhido);
        await invoke("definir_atalho", { atalho: escolhido });
        setAvisoAtalho(null);
      })
      .catch((e) => setAvisoAtalho(String(e)));
  }, []);

  // Usar o texto selecionado na captura: ligado, a menos que tenha sido desligado.
  useEffect(() => {
    lerConfig("usar_selecao")
      .then((salvo) => invoke("definir_usar_selecao", { usar: salvo !== "nao" }))
      .catch((e) => setErro(String(e)));
  }, []);

  useEffect(() => agendarBackupDiario((e) => setErro(`Backup diário falhou: ${e}`)), []);

  // Fecha a sessão de foco que ficou aberta se o app foi fechado no meio dela.
  useEffect(() => {
    recuperarFocoAberto()
      .catch((e) => setErro(String(e)))
      .finally(() => setPronto(true));
  }, []);

  useEffect(() => {
    if (!pronto) return;
    carregar();
    const parar = listen("item:criado", carregar);
    const pararPrioridades = listen("prioridades:alteradas", carregar);
    const relogio = setInterval(() => setAgora(new Date()), MINUTO_MS);
    return () => {
      parar.then((f) => f());
      pararPrioridades.then((f) => f());
      clearInterval(relogio);
    };
  }, [carregar, pronto]);

  // Enquanto há foco: pulso a cada minuto (para o timer sobreviver ao app fechado)
  // e o tempo na bandeja. Um pulso atrasado demais quer dizer que o computador dormiu:
  // a sessão é encerrada no último pulso, sem contar o tempo parado.
  useEffect(() => {
    if (!foco) {
      invoke("atualizar_bandeja", { foco: null }).catch(() => {});
      return;
    }
    const titulo =
      foco.item.titulo.length > MAX_TITULO_BANDEJA
        ? `${foco.item.titulo.slice(0, MAX_TITULO_BANDEJA - 1)}…`
        : foco.item.titulo;
    ultimoPulso.current = Date.now();
    async function pulsar() {
      const agoraMs = Date.now();
      if (agoraMs - ultimoPulso.current > LIMITE_PULSO_MS && foco) {
        await encerrarFoco(foco, "repouso", null, new Date(ultimoPulso.current).toISOString());
        mostrarAviso("O computador ficou parado: pausei o foco sem contar esse tempo.");
        await carregar();
        return;
      }
      ultimoPulso.current = agoraMs;
      await registrarPulso();
      const sessao = agoraMs - new Date(foco!.inicio).getTime();
      await invoke("atualizar_bandeja", { foco: `${titulo} · ${formatarDuracao(sessao)}` });
    }
    pulsar().catch((e) => setErro(String(e)));
    const intervalo = setInterval(() => pulsar().catch((e) => setErro(String(e))), MINUTO_MS);
    return () => clearInterval(intervalo);
    // Só reinicia quando a sessão muda; recarregar a lista não pode zerar o último pulso.
  }, [foco?.item.id, foco?.inicio, foco?.item.titulo]);

  function mostrarAviso(texto: string) {
    setAviso(texto);
    window.clearTimeout(timerAviso.current);
    timerAviso.current = window.setTimeout(() => setAviso(null), 4000);
  }

  const aplicar = useCallback(
    async (item: Item, mudancas: Mudancas, mensagem?: string) => {
      try {
        const alteracao = await alterarItem(item, mudancas);
        desfazer.current = [...desfazer.current, alteracao].slice(-MAX_DESFAZER);
        if (mensagem) mostrarAviso(`${mensagem}. Z desfaz.`);
        await carregar();
      } catch (e) {
        setErro(String(e));
      }
    },
    [carregar],
  );

  async function desfazerUltima() {
    const ultima = desfazer.current.pop();
    if (!ultima) {
      mostrarAviso("Nada para desfazer.");
      return;
    }
    await desfazerAlteracao(ultima);
    mostrarAviso("Desfeito.");
    await carregar();
  }

  /** Põe o item em foco. Se outro estava em foco, pergunta antes onde parou nele. */
  function focar(item: Item) {
    const trocar = async (nota: string | null) => {
      await trocarFoco(item, foco, nota);
      setLista("agora");
      await carregar();
    };
    if (foco && foco.item.id !== item.id) {
      setPedidoNota({ titulo: foco.item.titulo, acao: trocar });
    } else {
      trocar(null).catch((e) => setErro(String(e)));
    }
  }

  function pausar() {
    if (!foco) return;
    const atual = foco;
    setPedidoNota({
      titulo: atual.item.titulo,
      acao: async (nota) => {
        await encerrarFoco(atual, "pausa", nota);
        mostrarAviso("Pausado. Ele volta para A fazer.");
        await carregar();
      },
    });
  }

  async function concluirFoco() {
    if (!foco) return;
    await encerrarFoco(foco, "concluido");
    mostrarAviso("Concluído.");
    await carregar();
  }

  // "Pausar" no menu da bandeja: pausa direto, sem nota, porque a janela pode estar escondida.
  const focoAtual = useRef(foco);
  focoAtual.current = foco;
  useEffect(() => {
    const parar = listen("bandeja:pausar", async () => {
      if (!focoAtual.current) return;
      await encerrarFoco(focoAtual.current, "pausa");
      await carregar();
    });
    return () => {
      parar.then((f) => f());
    };
  }, [carregar]);

  async function iniciarEdicao(campo: CampoEditavel, item: Item) {
    if (campo === "pessoa" || campo === "projeto") setSugestoes(await listarSugestoes());
    setEdicao({ campo, valor: valorAtual(item, campo), erro: null });
  }

  async function confirmarEdicao(item: Item) {
    if (!edicao) return;
    const resultado = await mudancasDaEdicao(edicao.campo, edicao.valor);
    if (typeof resultado === "string") {
      setEdicao({ ...edicao, erro: resultado });
      return;
    }
    setEdicao(null);
    await aplicar(item, resultado);
  }

  // Atalhos da lista. Ficam desligados enquanto um campo está sendo editado.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      // # e @ podem vir com AltGr (Ctrl+Alt no Windows) em alguns teclados.
      if (edicao || configAberta || pedidoNota || ((e.ctrlKey || e.metaKey || e.altKey) && e.key !== "#" && e.key !== "@")) return;
      const item = itens?.[selecionado];
      const tecla = e.key;

      const acoes: Record<string, () => void> = {
        ArrowDown: () => setSelecionado((s) => Math.min(s + 1, (itens?.length ?? 1) - 1)),
        ArrowUp: () => setSelecionado((s) => Math.max(s - 1, 0)),
        Tab: () => {
          setLista((l) => TELAS[(TELAS.indexOf(l) + (e.shiftKey ? TELAS.length - 1 : 1)) % TELAS.length]);
          setSelecionado(0);
        },
        c: () => invoke("abrir_captura"),
        ",": () => setConfigAberta(true),
        z: () => desfazerUltima(),
      };
      acoes.j = acoes.ArrowDown;
      acoes.k = acoes.ArrowUp;

      if (lista === "agora") {
        Object.assign(acoes, {
          p: () => pausar(),
          " ": () => pausar(),
          x: () => concluirFoco(),
          o: () => foco?.item.link && openUrl(foco.item.link),
        });
        proximas.forEach((proxima, i) => (acoes[String(i + 1)] = () => focar(proxima)));
      } else if (item) {
        Object.assign(acoes, {
          f: () => focar(item),
          Enter: () => lista === "inbox" && aplicar(item, { status: "a_fazer" }, "Movido para A fazer"),
          e: () => aplicar(item, { status: "arquivado" }, "Arquivado"),
          x: () => aplicar(item, { status: "feito" }, "Concluído"),
          p: () => iniciarEdicao("prazo", item),
          "#": () => iniciarEdicao("projeto", item),
          "@": () => iniciarEdicao("pessoa", item),
          r: () => iniciarEdicao("titulo", item),
          o: () => item.link && openUrl(item.link),
        });
        // 1 a 9: prioridades na ordem das configurações; 0 tira a prioridade.
        acoes["0"] = () => aplicar(item, { prioridade_id: null });
        prioridades.slice(0, 9).forEach((p, i) => (acoes[String(i + 1)] = () => aplicar(item, { prioridade_id: p.id })));
      }

      const acao = acoes[tecla] ?? acoes[tecla.toLowerCase()];
      if (acao) {
        e.preventDefault();
        acao();
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [edicao, configAberta, pedidoNota, itens, selecionado, lista, aplicar, foco, proximas, prioridades]);

  // Mantém o item selecionado visível ao navegar pelo teclado.
  useEffect(() => {
    document.getElementById(`item-${selecionado}`)?.scrollIntoView({ block: "nearest" });
  }, [selecionado]);

  const sugestoesEdicao =
    edicao?.campo === "pessoa" ? sugestoes.pessoas : edicao?.campo === "projeto" ? sugestoes.projetos : [];

  const total = itens?.length ?? 0;
  const subtitulo =
    lista === "agora"
      ? foco
        ? "Uma coisa por vez. Interrupções viram captura."
        : "Escolha o que fazer agora."
      : itens === null
      ? ""
      : lista === "inbox"
        ? total === 0
          ? "Nada esperando triagem."
          : `${total === 1 ? "Uma coisa chegou" : `${total} coisas chegaram`}. Decida o destino de cada uma.`
        : total === 0
          ? "Nada a fazer por enquanto."
          : `${total === 1 ? "Uma tarefa" : `${total} tarefas`}, por prazo e prioridade.`;

  function trocarLista(l: Tela) {
    setLista(l);
    setSelecionado(0);
  }

  const botaoCapturar = (
    <button
      type="button"
      onClick={() => invoke("abrir_captura")}
      title="Abre a mesma janela do atalho global"
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-suave hover:bg-folha hover:text-tinta"
    >
      <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
        <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="flex-1">Nova captura</span>
      <kbd className="font-sans text-xs text-apagado">{rotuloAtalho(atalho)}</kbd>
    </button>
  );

  return (
    <div className="flex h-screen bg-folha text-tinta">
      <nav aria-label="Listas" className="hidden w-56 shrink-0 flex-col gap-1 bg-lateral px-4 py-7 md:flex">
        <div className="px-3 pb-6 font-titulo text-[22px] font-semibold tracking-tight">Juggl</div>
        {TELAS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => trocarLista(l)}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-[15px] ${
              lista === l ? "bg-folha font-semibold text-tinta shadow-sm" : "text-tinta-2 hover:text-tinta"
            }`}
          >
            {NOME_TELA[l]}
            {l === "agora" ? (
              foco && <span title="Algo em foco" className="size-2 rounded-full bg-destaque" />
            ) : (
              <span className="text-[13px] font-normal tabular-nums text-apagado">{contagem[l] || ""}</span>
            )}
          </button>
        ))}
        {foco && lista !== "agora" && (
          <button
            type="button"
            onClick={() => trocarLista("agora")}
            className="mx-3 mt-1 truncate text-left text-[13px] text-suave hover:text-tinta"
            title={foco.item.titulo}
          >
            Em foco: {foco.item.titulo}
          </button>
        )}
        <div className="flex-1" />
        {botaoCapturar}
        <button
          type="button"
          onClick={() => setConfigAberta(true)}
          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-suave hover:bg-folha hover:text-tinta"
        >
          Configurações <kbd className="font-sans text-xs text-apagado">,</kbd>
        </button>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Janela estreita: as listas viram abas no topo. */}
        <nav aria-label="Listas" className="flex items-center gap-1 border-b border-linha px-4 py-2 md:hidden">
          {TELAS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => trocarLista(l)}
              className={`rounded-full px-3 py-1 text-sm ${lista === l ? "bg-etiqueta font-semibold" : "text-suave"}`}
            >
              {NOME_TELA[l]}{" "}
              {l !== "agora" && <span className="tabular-nums text-apagado">{contagem[l] || ""}</span>}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setConfigAberta(true)}
            className="ml-auto px-2 text-sm text-suave hover:text-tinta"
          >
            Configurações
          </button>
        </nav>

        <main className="flex-1 overflow-y-auto px-6 pt-8 md:px-14 md:pt-11">
          <h1 className="font-titulo text-[34px] font-medium leading-tight tracking-tight">{NOME_TELA[lista]}</h1>
          <p className="mt-1.5 mb-7 text-[15px] text-suave">{subtitulo}</p>

          {avisoAtalho && (
            <p className="mb-5 rounded-xl bg-atraso-claro px-4 py-3 text-sm text-atraso">
              O atalho global não funcionou: {avisoAtalho}. Use Nova captura enquanto isso.
            </p>
          )}
          {erro && <p className="mb-5 rounded-xl bg-atraso-claro px-4 py-3 text-sm text-atraso">Erro no banco: {erro}</p>}

          {itens?.length === 0 && lista === "inbox" && (
            <p className="mt-16 text-center text-[15px] text-apagado">
              Aperte {rotuloAtalho(atalho)} em qualquer janela para capturar um pedido.
            </p>
          )}

          {lista === "agora" && (
            <Agora foco={foco} proximas={proximas} aoFocar={focar} aoPausar={pausar} aoConcluir={concluirFoco} />
          )}

          <ul className="flex flex-col gap-1.5 pb-6">
            {itens?.map((item, i) => {
              const ativo = i === selecionado;
              const meta = [
                item.nota_pausa && `Parou em: ${item.nota_pausa}`,
                item.pessoa,
                item.projeto,
                origemComId(item),
                item.tempo_ms > 0 && `${formatarDuracao(item.tempo_ms)} em foco`,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li
                  key={item.id}
                  id={`item-${i}`}
                  onClick={() => setSelecionado(i)}
                  onDoubleClick={() => item.link && openUrl(item.link)}
                  className={`rounded-xl px-[18px] py-3.5 ${
                    ativo ? "bg-cartao shadow-[0_0_0_1.5px_var(--color-destaque),0_4px_14px_rgba(0,0,0,0.08)]" : ""
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span
                      title={NOME_ORIGEM[item.origem] ?? item.origem}
                      className={`size-2.5 shrink-0 rounded-full ${COR_ORIGEM[item.origem] ?? COR_ORIGEM.manual}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-base font-medium">{item.titulo}</span>
                        {item.status === "pausado" && (
                          <span className="shrink-0 rounded-full bg-etiqueta px-2 text-xs font-semibold text-tinta-2">Pausado</span>
                        )}
                        {item.prioridade && (
                          <span
                            className={`shrink-0 rounded-full px-2 text-xs font-semibold ${ETIQUETA_PRIORIDADE[item.prioridade_cor ?? "cinza"]}`}
                          >
                            {item.prioridade}
                          </span>
                        )}
                      </div>
                      {meta && <div className="mt-0.5 truncate text-[13px] text-suave">{meta}</div>}
                    </div>
                    <div className="shrink-0 text-right">
                      {item.prazo && (
                        <div className={`text-sm ${classePrazo(item.prazo, agora)}`}>{rotuloPrazo(item.prazo, agora)}</div>
                      )}
                      <div className="text-xs tabular-nums text-apagado" title="Parado há">
                        {tempoParado(lista === "inbox" ? item.criado_em : item.atualizado_em, agora)}
                      </div>
                    </div>
                  </div>

                  {ativo && edicao && (
                    <form
                      className="mt-3 pl-6"
                      onSubmit={(e) => {
                        e.preventDefault();
                        confirmarEdicao(item);
                      }}
                    >
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-apagado">
                        {ROTULO_CAMPO[edicao.campo]}
                      </label>
                      <input
                        autoFocus
                        onFocus={(e) => e.target.select()}
                        list="sugestoes-edicao"
                        value={edicao.valor}
                        onChange={(e) => setEdicao({ ...edicao, valor: e.target.value, erro: null })}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setEdicao(null);
                          }
                        }}
                        onBlur={() => setEdicao(null)}
                        className="w-full rounded-lg border border-linha bg-folha px-3 py-1.5 text-[15px] outline-none focus:border-destaque"
                      />
                      <datalist id="sugestoes-edicao">
                        {sugestoesEdicao.map((s) => (
                          <option key={s} value={s} />
                        ))}
                      </datalist>
                      {edicao.erro && <p className="mt-1 text-sm text-atraso">{edicao.erro}</p>}
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </main>

        <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 px-6 py-4 text-[13px] text-apagado md:px-14">
          {aviso ? (
            <span className="font-semibold text-tinta">{aviso}</span>
          ) : (
            lista === "agora" ? (
              <>
                <Dica teclas="P">pausar</Dica>
                <Dica teclas="X">concluir</Dica>
                <Dica teclas="1 2 3">focar uma das próximas</Dica>
                <Dica teclas="O">abrir link</Dica>
                <Dica teclas="Tab">trocar tela</Dica>
              </>
            ) : (
              <>
                {lista === "inbox" && <Dica teclas="Enter">mover para A fazer</Dica>}
                <Dica teclas="F">focar</Dica>
                <Dica teclas="P">prazo</Dica>
                <Dica teclas={prioridades.length > 1 ? `1–${Math.min(prioridades.length, 9)}` : "1"}>prioridade</Dica>
                <Dica teclas="#">projeto</Dica>
                <Dica teclas="@">quem pediu</Dica>
                <Dica teclas="X">concluir</Dica>
                <Dica teclas="E">arquivar</Dica>
                <Dica teclas="Z">desfazer</Dica>
                <Dica teclas="Tab">trocar tela</Dica>
              </>
            )
          )}
        </footer>
      </div>

      {pedidoNota && (
        <PedidoNota
          titulo={pedidoNota.titulo}
          aoCancelar={() => setPedidoNota(null)}
          aoConfirmar={(nota) => {
            setPedidoNota(null);
            pedidoNota.acao(nota).catch((e) => setErro(String(e)));
          }}
        />
      )}

      {configAberta && (
        <Configuracoes atalho={atalho} aoMudarAtalho={setAtalho} aoFechar={() => setConfigAberta(false)} />
      )}
    </div>
  );
}

function origemComId(item: Item): string | null {
  if (item.origem === "manual") return null;
  const nome = NOME_ORIGEM[item.origem] ?? item.origem;
  return item.id_externo ? `${nome} ${item.id_externo}` : nome;
}

/** "hoje" → "Hoje", para combinar com o resto da lista. */
function rotuloPrazo(prazo: string, agora: Date): string {
  const texto = descreverPrazo(prazo, agora);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function Dica({ teclas, children }: { teclas: string; children: React.ReactNode }) {
  return (
    <span>
      <b className="font-semibold text-tinta-2">{teclas}</b> {children}
    </span>
  );
}
