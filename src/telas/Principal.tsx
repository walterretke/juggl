import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { dataLocalIso, formatarDuracao } from "../captura/datas";
import { interpretarPrazo } from "../captura/parser";
import { agendarBackupDiario } from "../db/backup";
import { ATALHO_PADRAO, lerConfig } from "../db/config";
import {
  encerrarFoco,
  itemEmFoco,
  LIMITE_PULSO_MS,
  lerLimiteInatividade,
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
  registrarCobranca,
  type Alteracao,
  type Item,
  type Lista,
  type Mudancas,
} from "../db/itens";
import { listarPrioridades, type Prioridade } from "../db/prioridades";
import { deveAbrirRitual, deveLembrarRitual, ritualFeitoHoje } from "../db/ritual";
import { liberarAvisosDoFoco, verificarRegras } from "../regras/verificar";
import { notificar } from "../regras/notificar";
import type { Urgencia } from "../regras/urgencia";
import { adiarAlertas, continuarApesarDoAlerta, pontuacoesAgora, verificarPrioridade, type AlertaComFoco } from "../db/detector";
import AlertaPrioridade from "./AlertaPrioridade";
import Agora from "./Agora";
import Configuracoes from "./Configuracoes";
import Horas from "./Horas";
import ItemLista, { type CampoEditavel, type Menu } from "./ItemLista";
import PedidoNota from "./PedidoNota";
import Pessoas from "./Pessoas";
import Regras from "./Regras";
import Ritual from "./Ritual";
import { rotuloAtalho } from "./origens";

const MINUTO_MS = 60 * 1000;
const MAX_DESFAZER = 30;

/** Telas da janela principal: Agora (o foco), o ritual, as duas listas, Pessoas e Horas. */
type Tela = "agora" | "ritual" | Lista | "pessoas" | "horas" | "regras";
const TELAS: Tela[] = ["agora", "ritual", "inbox", "a_fazer", "pessoas", "horas", "regras"];
const NOME_TELA: Record<Tela, string> = {
  agora: "Agora",
  ritual: "Ritual da manhã",
  inbox: "Caixa de entrada",
  a_fazer: "A fazer",
  pessoas: "Pessoas",
  horas: "Horas da semana",
  regras: "Regras",
};

function ehLista(tela: Tela): tela is Lista {
  return tela === "inbox" || tela === "a_fazer";
}
const MAX_PROXIMAS = 3;
const MAX_TITULO_BANDEJA = 40;

interface Pedido {
  titulo: string;
  acao: (nota: string | null) => Promise<void>;
}


const ROTULO_CAMPO: Record<CampoEditavel, string> = {
  prazo: "Prazo (hoje, amanha, sexta, 15/10; vazio tira)",
  projeto: "Projeto (vazio tira)",
  pessoa: "Quem pediu (vazio tira)",
  titulo: "Título",
  nota: "Descrição (Enter salva, Shift+Enter quebra a linha, vazio tira)",
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
  if (campo === "nota") return item.nota ?? "";
  return item.titulo;
}

/** Converte o texto digitado na edição em mudanças no item, ou devolve uma mensagem de erro. */
async function mudancasDaEdicao(campo: CampoEditavel, texto: string): Promise<Mudancas | string> {
  const valor = texto.trim();
  if (campo === "nota") return { nota: valor || null };
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
  const [aviso, setAviso] = useState<{ texto: string; desfazivel: boolean } | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [alvoArrasto, setAlvoArrasto] = useState<Tela | null>(null);
  const [atalho, setAtalho] = useState(ATALHO_PADRAO);
  const [avisoAtalho, setAvisoAtalho] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => new Date());
  const [prioridades, setPrioridades] = useState<Prioridade[]>([]);
  /** Aumenta a cada recarga, para as telas com dados próprios (Ritual, Pessoas) recarregarem. */
  const [versao, setVersao] = useState(0);
  const [ritualFeito, setRitualFeito] = useState(true);
  const [lembreteRitual, setLembreteRitual] = useState(false);
  const [alerta, setAlerta] = useState<AlertaComFoco | null>(null);
  /** Pontuação de cada item quando o foco atual começou, para ver quem passou à frente. */
  const pontosDoInicio = useRef<Map<string, Urgencia> | null>(null);
  const desfazer = useRef<Alteracao[]>([]);
  /** Item arrastado de uma tela que não é lista (Ritual, Pessoas), para soltar na barra lateral. */
  const arrastado = useRef<Item | null>(null);
  const timerAviso = useRef<number | undefined>(undefined);

  const carregar = useCallback(async () => {
    try {
      const [emFoco, aFazer, total, opcoes, feito] = await Promise.all([
        itemEmFoco(),
        listarItens("a_fazer"),
        contarPorLista(),
        listarPrioridades(),
        ritualFeitoHoje(),
      ]);
      setRitualFeito(feito);
      setPrioridades(opcoes);
      const lidos = !ehLista(lista) ? [] : lista === "a_fazer" ? aFazer : await listarItens(lista);
      setFoco(emFoco);
      setProximas(aFazer.slice(0, MAX_PROXIMAS));
      setItens(lidos);
      setContagem(total);
      // Ao abrir o app: primeira vez no dia com algo pendente abre o ritual;
      // senão começa no Agora se tiver algo em foco.
      if (primeiraCarga.current) {
        primeiraCarga.current = false;
        if (total.inbox + total.a_fazer > 0 && (await deveAbrirRitual())) setLista("ritual");
        else if (emFoco) setLista("agora");
      }
      setVersao((v) => v + 1);
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

  // O dia virou com o app aberto: abre o ritual. Depois das 10h sem ritual, lembra uma vez.
  const diaAtual = dataLocalIso(agora);
  useEffect(() => {
    if (!pronto) return;
    deveAbrirRitual()
      .then((abrir) => abrir && contagem.inbox + contagem.a_fazer > 0 && setLista("ritual"))
      .catch(() => {});
  }, [diaAtual]);
  useEffect(() => {
    if (!pronto || ritualFeito) return;
    deveLembrarRitual(agora)
      .then((lembrar) => lembrar && setLembreteRitual(true))
      .catch(() => {});
  }, [agora, pronto, ritualFeito]);

  // Regras de notificação: a cada minuto. Uma regra pode marcar itens como do dia.
  const carregarAtual = useRef(carregar);
  carregarAtual.current = carregar;
  useEffect(() => {
    if (!pronto) return;
    const rodar = () => {
      verificarRegras()
        .then((marcados) => {
          if (marcados > 0) return carregarAtual.current();
        })
        .catch((e) => console.error("Regras:", e));
      if (focoAtual.current) {
        verificarPrioridade(pontosDoInicio.current)
          .then((a) => a && mostrarAlerta(a))
          .catch((e) => console.error("Detector:", e));
      }
    };
    rodar();
    const relogio = setInterval(rodar, MINUTO_MS);
    return () => clearInterval(relogio);
  }, [pronto]);

  // Saiu do foco (pausa, troca ou conclusão): solta os avisos que o não perturbe segurou.
  const focoAnterior = useRef<string | null>(null);
  useEffect(() => {
    const id = foco ? `${foco.item.id}-${foco.inicio}` : null;
    if (focoAnterior.current === id) return;
    if (focoAnterior.current) liberarAvisosDoFoco().catch(() => {});
    focoAnterior.current = id;
    // Começou um foco: guarda as pontuações e avisa se outro item está bem à frente.
    setAlerta((a) => (a && a.focoId === foco?.item.id ? a : null));
    pontosDoInicio.current = null;
    if (!foco) return;
    pontuacoesAgora()
      .then((pontos) => {
        pontosDoInicio.current = pontos;
        return verificarPrioridade(null);
      })
      .then((a) => a && mostrarAlerta(a))
      .catch((e) => console.error("Detector:", e));
  }, [foco?.item.id, foco?.inicio]);

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
      // Muito tempo sem teclado nem mouse: pausa no momento do último uso.
      const limiteMin = await lerLimiteInatividade();
      const ociosoS = limiteMin > 0 ? await invoke<number | null>("tempo_ocioso").catch(() => null) : null;
      if (foco && ociosoS !== null && ociosoS >= limiteMin * 60) {
        const fim = Math.max(new Date(foco.inicio).getTime(), agoraMs - ociosoS * 1000);
        await encerrarFoco(foco, "inatividade", null, new Date(fim).toISOString());
        mostrarAviso(`Pausei o foco: ${Math.round(ociosoS / 60)} min sem usar o computador. Esse tempo não contou.`);
        await carregar();
        return;
      }
      await registrarPulso();
      const sessao = agoraMs - new Date(foco!.inicio).getTime();
      await invoke("atualizar_bandeja", { foco: `${titulo} · ${formatarDuracao(sessao)}` });
    }
    pulsar().catch((e) => setErro(String(e)));
    const intervalo = setInterval(() => pulsar().catch((e) => setErro(String(e))), MINUTO_MS);
    return () => clearInterval(intervalo);
    // Só reinicia quando a sessão muda; recarregar a lista não pode zerar o último pulso.
  }, [foco?.item.id, foco?.inicio, foco?.item.titulo]);

  function mostrarAviso(texto: string, desfazivel = false) {
    setAviso({ texto, desfazivel });
    window.clearTimeout(timerAviso.current);
    timerAviso.current = window.setTimeout(() => setAviso(null), 4000);
  }

  const aplicar = useCallback(
    async (item: Item, mudancas: Mudancas, mensagem?: string) => {
      try {
        const alteracao = await alterarItem(item, mudancas);
        desfazer.current = [...desfazer.current, alteracao].slice(-MAX_DESFAZER);
        if (mensagem) mostrarAviso(mensagem, true);
        await carregar();
      } catch (e) {
        setErro(String(e));
      }
    },
    [carregar],
  );

  /** "Cobrou de novo": registra a cobrança; dá para desfazer com Z. */
  async function cobrar(item: Item) {
    try {
      const alteracao = await registrarCobranca(item);
      desfazer.current = [...desfazer.current, alteracao].slice(-MAX_DESFAZER);
      const vezes = item.cobrancas + 1;
      mostrarAviso(`${item.pessoa ?? "Cobrança"} ${item.pessoa ? "cobrou" : "registrada"}: ${vezes}× neste item.`, true);
      await carregar();
    } catch (e) {
      setErro(String(e));
    }
  }

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

  /** Mostra o alerta de prioridade errada; com a janela escondida, também como notificação. */
  function mostrarAlerta(a: AlertaComFoco) {
    setAlerta(a);
    if (!document.hasFocus()) notificar(`Talvez você devesse focar em ${a.outro.titulo}`, `${a.explicacao}.`).catch(() => {});
  }

  function responderAlerta(resposta: "trocar" | "continuar" | "adiar") {
    if (!alerta) return;
    setAlerta(null);
    if (resposta === "trocar") {
      focar(alerta.outro);
    } else if (resposta === "continuar") {
      continuarApesarDoAlerta(alerta).catch((e) => setErro(String(e)));
      mostrarAviso("Continuando. Só aviso de novo se esse item ficar mais urgente.");
    } else {
      adiarAlertas().catch((e) => setErro(String(e)));
      mostrarAviso("Sem alertas de prioridade pelos próximos 30 minutos.");
    }
  }

  // Alerta na tela: T troca, C continua, A adia. Vem antes dos outros atalhos.
  useEffect(() => {
    if (!alerta) return;
    function aoTeclar(e: KeyboardEvent) {
      if (pedidoNota || configAberta || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      const resposta = ({ t: "trocar", c: "continuar", a: "adiar" } as const)[e.key.toLowerCase() as "t" | "c" | "a"];
      if (!resposta) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      responderAlerta(resposta);
    }
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  });

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
    // Nada mudou (ou o Enter e o clique fora confirmaram a mesma edição): não grava de novo.
    if (Object.entries(resultado).every(([campo, valor]) => item[campo as keyof Item] === valor)) return;
    await aplicar(item, resultado);
  }

  // Atalhos da lista. Ficam desligados enquanto um campo está sendo editado.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      // # e @ podem vir com AltGr (Ctrl+Alt no Windows) em alguns teclados.
      if (edicao || configAberta || pedidoNota || menu || ((e.ctrlKey || e.metaKey || e.altKey) && e.key !== "#" && e.key !== "@")) return;
      // Digitando num campo (busca, código do projeto): as letras são texto, não atalhos.
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
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
          b: () => foco && cobrar(foco.item),
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
          d: () => iniciarEdicao("nota", item),
          b: () => cobrar(item),
          m: () => setMenu("prometido"),
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
  }, [edicao, configAberta, pedidoNota, menu, itens, selecionado, lista, aplicar, foco, proximas, prioridades]);

  // Mantém o item selecionado visível ao navegar pelo teclado.
  useEffect(() => {
    document.getElementById(`item-${selecionado}`)?.scrollIntoView({ block: "nearest" });
  }, [selecionado]);

  const sugestoesEdicao =
    edicao?.campo === "pessoa" ? sugestoes.pessoas : edicao?.campo === "projeto" ? sugestoes.projetos : [];

  const total = itens?.length ?? 0;
  const subtitulo =
    lista === "horas"
      ? "Tempo em foco por projeto e por dia, pronto para o apontamento."
      : lista === "regras"
      ? "Poucos avisos e certeiros. Ligue, desligue e ajuste cada regra."
      : lista === "ritual"
      ? "O que vence, quem cobrou e o que ficou pausado. Escolha até 3 para hoje."
      : lista === "pessoas"
      ? "Tudo que cada pessoa pediu, para responder quem está cobrando."
      : lista === "agora"
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

  /** Ações de clique de cada linha; as mesmas das teclas. */
  function acoesDoItem(item: Item, indice: number) {
    const selecionar = () => {
      setSelecionado(indice);
      setEdicao(null);
    };
    return {
      selecionar,
      concluir: () => aplicar(item, { status: "feito" }, "Concluído"),
      focar: () => focar(item),
      mover: (destino: Lista) =>
        aplicar(item, { status: destino }, destino === "inbox" ? "Voltou para a caixa de entrada" : "Movido para A fazer"),
      arquivar: () => aplicar(item, { status: "arquivado" }, "Arquivado"),
      abrirLink: () => item.link && openUrl(item.link),
      editar: (campo: CampoEditavel) => {
        selecionar();
        setMenu(null);
        iniciarEdicao(campo, item);
      },
      definirPrazo: (prazo: string | null) => {
        setMenu(null);
        aplicar(item, { prazo });
      },
      definirPrometido: (prometido_para: string | null) => {
        setMenu(null);
        aplicar(item, { prometido_para }, prometido_para ? "Promessa anotada" : "Promessa removida");
      },
      cobrar: () => cobrar(item),
      definirPrioridade: (id: string | null) => {
        setMenu(null);
        aplicar(item, { prioridade_id: id });
      },
      abrirMenu: (novo: Menu | null) => {
        selecionar();
        setMenu(novo);
      },
    };
  }

  /** Soltar um item numa tela da barra lateral: Agora põe em foco, as listas movem. */
  function alvoDeArrasto(destino: Tela) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!(destino === "agora" || ehLista(destino)) || !e.dataTransfer.types.includes("text/juggl-item")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setAlvoArrasto(destino);
      },
      onDragLeave: () => setAlvoArrasto((a) => (a === destino ? null : a)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setAlvoArrasto(null);
        const id = e.dataTransfer.getData("text/juggl-item");
        const item = itens?.find((i) => i.id === id) ?? (arrastado.current?.id === id ? arrastado.current : null);
        if (!item) return;
        if (destino === "agora") focar(item);
        else if (ehLista(destino) && destino !== lista)
          aplicar(item, { status: destino }, destino === "inbox" ? "Voltou para a caixa de entrada" : "Movido para A fazer");
      },
    };
  }

  const botaoCapturar = (
    <button
      type="button"
      onClick={() => invoke("abrir_captura")}
      title={`Abre a mesma janela do atalho global (${rotuloAtalho(atalho)})`}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-suave hover:bg-folha hover:text-tinta"
    >
      <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
        <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="flex-1 whitespace-nowrap">Nova captura</span>
      <kbd className="truncate font-sans text-xs text-apagado">{rotuloAtalho(atalho)}</kbd>
    </button>
  );

  return (
    <div className="flex h-screen bg-folha text-tinta select-none">
      <nav aria-label="Listas" className="hidden w-56 shrink-0 flex-col gap-1 bg-lateral px-4 py-7 md:flex">
        <div className="px-3 pb-6 font-titulo text-[22px] font-semibold tracking-tight">Juggl</div>
        {TELAS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => trocarLista(l)}
            {...alvoDeArrasto(l)}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-[15px] ${
              alvoArrasto === l
                ? "bg-destaque-claro text-destaque-tinta ring-2 ring-destaque"
                : lista === l
                  ? "bg-folha font-semibold text-tinta shadow-sm"
                  : "text-tinta-2 hover:text-tinta"
            }`}
          >
            {NOME_TELA[l]}
            {l === "agora" ? (
              foco && <span title="Algo em foco" className="size-2 rounded-full bg-destaque" />
            ) : l === "ritual" ? (
              !ritualFeito && <span title="Ainda não feito hoje" className="size-2 rounded-full border-[1.5px] border-destaque" />
            ) : (
              ehLista(l) && <span className="text-[13px] font-normal tabular-nums text-apagado">{contagem[l] || ""}</span>
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
              {...alvoDeArrasto(l)}
              className={`rounded-full px-3 py-1 text-sm ${
                alvoArrasto === l ? "bg-destaque-claro text-destaque-tinta" : lista === l ? "bg-etiqueta font-semibold" : "text-suave"
              }`}
            >
              {NOME_TELA[l]}{" "}
              {ehLista(l) && <span className="tabular-nums text-apagado">{contagem[l] || ""}</span>}
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

          {lembreteRitual && lista !== "ritual" && (
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-destaque-claro px-4 py-3 text-sm text-destaque-tinta">
              <span className="flex-1 font-semibold">Já passou das 10h e o ritual de hoje não foi feito.</span>
              <button
                type="button"
                onClick={() => {
                  setLembreteRitual(false);
                  trocarLista("ritual");
                }}
                className="rounded-md bg-destaque px-3 py-1 font-semibold text-folha hover:opacity-90"
              >
                Fazer agora
              </button>
              <button type="button" onClick={() => setLembreteRitual(false)} className="rounded-md px-2 py-1 hover:bg-folha/50">
                Hoje não
              </button>
            </div>
          )}

          {alerta && foco?.item.id === alerta.focoId && (
            <AlertaPrioridade
              alerta={alerta}
              aoTrocar={() => responderAlerta("trocar")}
              aoContinuar={() => responderAlerta("continuar")}
              aoAdiar={() => responderAlerta("adiar")}
            />
          )}

          {itens?.length === 0 && lista === "inbox" && (
            <p className="mt-16 text-center text-[15px] text-apagado">
              Aperte {rotuloAtalho(atalho)} em qualquer janela para capturar um pedido.
            </p>
          )}

          {lista === "ritual" && (
            <Ritual
              versao={versao}
              aoComecar={(quantos) => {
                setLembreteRitual(false);
                mostrarAviso(quantos > 0 ? `Bom dia. As ${quantos} do dia estão no topo de A fazer.` : "Bom dia.");
                trocarLista("agora");
                carregar();
              }}
              aoPular={() => trocarLista(foco ? "agora" : "inbox")}
              aoArrastar={(item) => (arrastado.current = item)}
            />
          )}

          {lista === "pessoas" && (
            <Pessoas
              versao={versao}
              aoCobrar={cobrar}
              aoFocar={focar}
              aoMudarPessoa={(item, pessoa_id, nome) => aplicar(item, { pessoa_id }, `Pedido passou para ${nome}`)}
              aoArrastar={(item) => (arrastado.current = item)}
              aoAlterar={carregar}
              aoAvisar={mostrarAviso}
            />
          )}

          {lista === "regras" && <Regras aoAvisar={mostrarAviso} />}

          {lista === "horas" && <Horas versao={`${foco?.item.id}-${foco?.inicio}`} aoAvisar={mostrarAviso} />}

          {lista === "agora" && (
            <Agora
              foco={foco}
              proximas={proximas}
              ritualFeito={ritualFeito}
              aoFocar={focar}
              aoPausar={pausar}
              aoConcluir={concluirFoco}
              aoCobrar={() => foco && cobrar(foco.item)}
              aoAbrirRitual={() => trocarLista("ritual")}
              aoMudarNota={(nota) => foco && aplicar(foco.item, { nota }, nota ? "Descrição salva" : "Descrição removida")}
            />
          )}

          <ul className="flex flex-col gap-1.5 pb-6">
            {itens?.map((item, i) => (
              <ItemLista
                key={item.id}
                item={item}
                indice={i}
                ativo={i === selecionado}
                lista={ehLista(lista) ? lista : "inbox"}
                agora={agora}
                prioridades={prioridades}
                menu={i === selecionado ? menu : null}
                acoes={acoesDoItem(item, i)}
              >
                {i === selecionado && edicao && (
                  <form
                    className="mt-3 pl-9"
                    onSubmit={(e) => {
                      e.preventDefault();
                      confirmarEdicao(item);
                    }}
                  >
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-apagado">
                      {ROTULO_CAMPO[edicao.campo]}
                    </label>
                    {edicao.campo === "nota" ? (
                      <textarea
                        autoFocus
                        rows={Math.min(Math.max(edicao.valor.split("\n").length, 3), 10)}
                        value={edicao.valor}
                        onChange={(e) => setEdicao({ ...edicao, valor: e.target.value, erro: null })}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setEdicao(null);
                          } else if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            confirmarEdicao(item);
                          }
                        }}
                        // Clicar fora guarda o texto: descrição é longa demais para perder.
                        onBlur={() => confirmarEdicao(item)}
                        placeholder="Detalhes, a mensagem recebida, links..."
                        className="w-full resize-y rounded-lg border border-linha bg-folha px-3 py-1.5 text-sm leading-5 outline-none focus:border-destaque"
                      />
                    ) : (
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
                    )}
                    <datalist id="sugestoes-edicao">
                      {sugestoesEdicao.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                    {edicao.erro && <p className="mt-1 text-sm text-atraso">{edicao.erro}</p>}
                  </form>
                )}
              </ItemLista>
            ))}
          </ul>
        </main>

        <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 px-6 py-4 text-[13px] text-apagado md:px-14">
          {aviso ? (
            <span className="flex items-center gap-3 font-semibold text-tinta">
              {aviso.texto}
              {aviso.desfazivel && (
                <button
                  type="button"
                  onClick={desfazerUltima}
                  className="rounded-md bg-etiqueta px-2.5 py-0.5 font-semibold text-destaque-tinta hover:bg-destaque-claro"
                >
                  Desfazer <kbd className="font-sans font-normal text-apagado">Z</kbd>
                </button>
              )}
            </span>
          ) : (
            lista === "horas" ? (
              <>
                <Dica teclas="← →">trocar semana</Dica>
                <Dica teclas="Ctrl+C">copiar</Dica>
                <Dica teclas="Ctrl+S">exportar CSV</Dica>
                <Dica teclas="Tab">trocar tela</Dica>
              </>
            ) : lista === "regras" ? (
              <>
                <Dica teclas="↑ ↓">escolher</Dica>
                <Dica teclas="Espaço">ligar/desligar</Dica>
                <Dica teclas="U">urgente</Dica>
                <Dica teclas="N">nova regra</Dica>
                <Dica teclas="Enter">editar</Dica>
                <Dica teclas="Delete">remover</Dica>
                <Dica teclas="T">testar</Dica>
                <Dica teclas="P">alerta de prioridade</Dica>
                <Dica teclas="Tab">trocar tela</Dica>
              </>
            ) : lista === "ritual" ? (
              <>
                <Dica teclas="↑ ↓">andar</Dica>
                <Dica teclas="Espaço">escolher</Dica>
                <Dica teclas="Enter">começar o dia</Dica>
                <Dica teclas="Esc">pular</Dica>
                <Dica teclas="Tab">trocar tela</Dica>
              </>
            ) : lista === "pessoas" ? (
              <>
                <Dica teclas="/">buscar</Dica>
                <Dica teclas="↑ ↓">trocar pessoa</Dica>
                <Dica teclas="R">renomear</Dica>
                <Dica teclas="Delete">excluir</Dica>
                <Dica teclas="Ctrl+C">copiar resumo</Dica>
                <Dica teclas="Z">desfazer</Dica>
                <Dica teclas="Tab">trocar tela</Dica>
              </>
            ) : lista === "agora" ? (
              <>
                <Dica teclas="P">pausar</Dica>
                <Dica teclas="X">concluir</Dica>
                <Dica teclas="1 2 3">focar uma das próximas</Dica>
                <Dica teclas="B">cobrou de novo</Dica>
                <Dica teclas="D">descrição</Dica>
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
                <Dica teclas="D">descrição</Dica>
                <Dica teclas="M">prometi para</Dica>
                <Dica teclas="B">cobrou de novo</Dica>
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

function Dica({ teclas, children }: { teclas: string; children: React.ReactNode }) {
  return (
    <span>
      <b className="font-semibold text-tinta-2">{teclas}</b> {children}
    </span>
  );
}
