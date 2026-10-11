import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import { dataLocalIso, formatarCronometro, formatarDuracao } from "../captura/datas";
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
  devolverAguardando,
  lerItem,
  listarItens,
  listarSugestoes,
  registrarCobranca,
  type Alteracao,
  type Item,
  type ItemBusca,
  type Lista,
  type Mudancas,
} from "../db/itens";
import { listarPrioridades, type Prioridade } from "../db/prioridades";
import { dadosDaDaily, deveAbrirRitual, deveLembrarRitual, ritualFeitoHoje } from "../db/ritual";
import { gerarRecorrentes } from "../db/recorrencias";
import { resumoDaDaily } from "../dia/daily";
import { statusParaResponder } from "../pessoas/resumo";
import { abrirMiniJanela } from "../mini";
import Busca, { type Comando } from "./Busca";
import Icone from "./Icone";
import { liberarAvisosDoFoco, verificarRegras } from "../regras/verificar";
import { notificar } from "../regras/notificar";
import type { Urgencia } from "../regras/urgencia";
import { adiarAlertas, continuarApesarDoAlerta, pontuacoesAgora, verificarPrioridade, type AlertaComFoco } from "../db/detector";
import AlertaPrioridade from "./AlertaPrioridade";
import AnotarIrritacao from "./AnotarIrritacao";
import Uso from "./Uso";
import { anotarIrritacao, registrarDiaDeUso } from "../db/uso";
import type { Update } from "@tauri-apps/plugin-updater";
import { instalarAtualizacao, INTERVALO_ATUALIZACAO_MS, procurarAtualizacao } from "../atualizacao";
import { horaDeSincronizar, lerConfigDevops, sincronizarDevops } from "../db/devops";
import Agora from "./Agora";
import Configuracoes from "./Configuracoes";
import Horas from "./Horas";
import ItemLista, { type CampoEditavel, type Menu } from "./ItemLista";
import PedidoNota from "./PedidoNota";
import Pessoas from "./Pessoas";
import Regras from "./Regras";
import MeuDia from "./MeuDia";
import { rotuloAtalho } from "./origens";

const MINUTO_MS = 60 * 1000;
const MAX_DESFAZER = 30;

/** Telas da janela principal: Meu dia (o fluxo do dia), Agora (o foco), as listas, Pessoas e Horas. */
type Tela = "dia" | "agora" | Lista | "pessoas" | "horas" | "regras" | "uso";
const TELAS: Tela[] = ["dia", "agora", "inbox", "a_fazer", "aguardando", "pessoas", "horas", "regras", "uso"];
/**
 * Grupos da barra lateral; Regras e Uso ficam no rodapé, junto das configurações.
 * Agora não tem botão próprio: o cartão "Em foco", logo abaixo de Meu dia, leva até ele.
 */
const GRUPOS_MENU: { titulo: string; telas: Tela[] }[] = [
  { titulo: "Hoje", telas: ["dia"] },
  { titulo: "Listas", telas: ["inbox", "a_fazer", "aguardando"] },
  { titulo: "Acompanhar", telas: ["pessoas", "horas"] },
];
const NOME_TELA: Record<Tela, string> = {
  dia: "Meu dia",
  agora: "Agora",
  inbox: "Caixa de entrada",
  a_fazer: "A fazer",
  aguardando: "Aguardando",
  pessoas: "Pessoas",
  horas: "Horas da semana",
  regras: "Regras",
  uso: "Uso",
};

function ehLista(tela: Tela): tela is Lista {
  return tela === "inbox" || tela === "a_fazer" || tela === "aguardando";
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
  const [lista, setLista] = useState<Tela>("dia");
  const [foco, setFoco] = useState<Foco | null>(null);
  const [proximas, setProximas] = useState<Item[]>([]);
  const [pedidoNota, setPedidoNota] = useState<Pedido | null>(null);
  const [pronto, setPronto] = useState(false);
  const primeiraCarga = useRef(true);
  const ultimoPulso = useRef(Date.now());
  const [itens, setItens] = useState<Item[] | null>(null);
  const [contagem, setContagem] = useState<Record<Lista, number>>({ inbox: 0, a_fazer: 0, aguardando: 0 });
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
  /** Aumenta a cada recarga, para as telas com dados próprios (Meu dia, Pessoas) recarregarem. */
  const [versao, setVersao] = useState(0);
  const [ritualFeito, setRitualFeito] = useState(true);
  const [lembreteRitual, setLembreteRitual] = useState(false);
  const [alerta, setAlerta] = useState<AlertaComFoco | null>(null);
  /** Azure DevOps configurado: mostra o botão de sincronizar na caixa de entrada. */
  const [devopsAtivo, setDevopsAtivo] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  /** Versão nova publicada no GitHub, esperando você instalar. */
  const [atualizacao, setAtualizacao] = useState<Update | null>(null);
  const [instalando, setInstalando] = useState(false);
  const [anotando, setAnotando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  /** Item a selecionar quando a lista carregar (vindo da busca global). */
  const selecionarId = useRef<string | null>(null);
  /** Pontuação de cada item quando o foco atual começou, para ver quem passou à frente. */
  const pontosDoInicio = useRef<Map<string, Urgencia> | null>(null);
  const desfazer = useRef<Alteracao[]>([]);
  /** Item arrastado de uma tela que não é lista (Meu dia, Pessoas), para soltar na barra lateral. */
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
      lerConfigDevops()
        .then((cfg) => setDevopsAtivo(cfg.ligado && !!cfg.organizacao))
        .catch(() => {});
      setPrioridades(opcoes);
      const lidos = !ehLista(lista) ? [] : lista === "a_fazer" ? aFazer : await listarItens(lista);
      setFoco(emFoco);
      // Próximas no Agora: as escolhidas para hoje; sem plano, as primeiras de A fazer como sugestão.
      const hojeIso = dataLocalIso(new Date());
      const doDia = aFazer.filter((i) => i.dia_planejado === hojeIso);
      setProximas((doDia.length > 0 ? doDia : aFazer).slice(0, MAX_PROXIMAS));
      setItens(lidos);
      setContagem(total);
      // Ao abrir o app começa em Meu dia; a primeira abertura do dia fica registrada
      // para não abrir Meu dia de novo quando o dia virar com o app aberto.
      if (primeiraCarga.current) {
        primeiraCarga.current = false;
        await deveAbrirRitual();
      }
      setVersao((v) => v + 1);
      const pedido = selecionarId.current ? lidos.findIndex((i) => i.id === selecionarId.current) : -1;
      // Só a carga da lista de destino usa o pedido (uma carga da tela anterior pode chegar antes).
      if (ehLista(lista)) selecionarId.current = null;
      setSelecionado((s) => (pedido >= 0 ? pedido : Math.min(s, Math.max(lidos.length - 1, 0))));
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

  // O dia virou com o app aberto: abre Meu dia. Depois das 10h sem plano, lembra uma vez.
  const diaAtual = dataLocalIso(agora);
  useEffect(() => {
    if (!pronto) return;
    deveAbrirRitual()
      .then((abrir) => abrir && contagem.inbox + contagem.a_fazer > 0 && setLista("dia"))
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
    const rodar = async () => {
      registrarDiaDeUso().catch(() => {});
      // Antes das regras: quem voltou de Aguardando já entra no aviso de cobrar o retorno.
      const voltaram = await devolverAguardando().catch(() => 0);
      const recorrentes = await gerarRecorrentes().catch((e) => {
        console.error("Recorrentes:", e);
        return [] as string[];
      });
      if (voltaram > 0 || recorrentes.length > 0) {
        carregarAtual.current();
        if (recorrentes.length > 0)
          mostrarAviso(recorrentes.length === 1 ? `Recorrente na caixa de entrada: ${recorrentes[0]}` : `${recorrentes.length} recorrentes na caixa de entrada.`);
      }
      verificarRegras()
        .then((marcados) => {
          if (marcados > 0) return carregarAtual.current();
        })
        .catch((e) => console.error("Regras:", e));
      lerConfigDevops()
        .then(async (cfg) => {
          if (await horaDeSincronizar(cfg)) await sincronizarAzure.current(false);
        })
        .catch((e) => console.error("Azure DevOps:", e));
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
    emit("foco:mudou").catch(() => {});
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

  // Atualização automática: procura ao abrir e a cada 6 horas. Sem internet, tenta de novo depois.
  useEffect(() => {
    const procurar = () =>
      procurarAtualizacao()
        .then((a) => a && setAtualizacao(a))
        .catch((e) => console.warn("Atualização:", e));
    procurar();
    const relogio = setInterval(procurar, INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(relogio);
  }, []);

  async function instalar() {
    if (!atualizacao || instalando) return;
    setInstalando(true);
    try {
      await instalarAtualizacao(atualizacao);
    } catch (e) {
      setInstalando(false);
      mostrarAviso(`Não consegui atualizar: ${e}`);
    }
  }

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

  /**
   * Traz os work items novos do Azure DevOps. Manual (S ou o botão): sempre diz o resultado.
   * Automática: avisa só quando chega algo ou quando aparece um erro novo.
   */
  async function sincronizarAzureAgora(manual: boolean) {
    setSincronizando(true);
    try {
      const novos = await sincronizarDevops();
      erroAzure.current = null;
      if (novos.length > 0) {
        const texto =
          novos.length === 1 ? `Do Azure DevOps: ${novos[0]}` : `${novos.length} itens novos do Azure DevOps na caixa de entrada.`;
        mostrarAviso(texto);
        if (!document.hasFocus()) notificar("Azure DevOps", texto).catch(() => {});
        await carregar();
      } else if (manual) {
        mostrarAviso("Azure DevOps: nada novo atribuído a você.");
      }
    } catch (e) {
      const texto = String(e).replace(/^Error: /, "");
      if (manual || erroAzure.current !== texto) mostrarAviso(`Azure DevOps: ${texto}`);
      erroAzure.current = texto;
      if (manual) throw e;
    } finally {
      setSincronizando(false);
    }
  }
  const sincronizarAzure = useRef(sincronizarAzureAgora);
  sincronizarAzure.current = sincronizarAzureAgora;
  const erroAzure = useRef<string | null>(null);

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
        mostrarAviso(
          atual.item.dia_planejado === dataLocalIso(new Date()) ? "Pausado. Ele volta para Hoje." : "Pausado. Ele volta para A fazer.",
        );
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

  /** Copia uma linha com o status do item, para responder quem cobrou. */
  async function copiarStatus(item: Item) {
    try {
      await writeText(statusParaResponder(item, new Date()));
      mostrarAviso("Status copiado. Cole na conversa do Teams.");
    } catch (e) {
      setErro(String(e));
    }
  }

  /** Copia o resumo da daily: o que foi feito, o que é para hoje e o que está travado. */
  async function copiarDaily() {
    try {
      await writeText(resumoDaDaily(await dadosDaDaily(), new Date()));
      mostrarAviso("Resumo da daily copiado.");
    } catch (e) {
      setErro(String(e));
    }
  }

  async function abrirMini() {
    try {
      await abrirMiniJanela();
    } catch (e) {
      mostrarAviso(`Não consegui abrir a mini-janela: ${e}`);
    }
  }

  /** Item escolhido na busca global: abre na lista dele; um concluído ou arquivado volta para A fazer. */
  async function abrirDaBusca(achado: ItemBusca) {
    const item = await lerItem(achado.id);
    if (!item) return;
    if (item.status === "em_foco") return trocarLista("agora");
    const fechado = item.status === "feito" || item.status === "arquivado";
    if (fechado) {
      // Sem `aplicar`: a recarga dela seria a da tela atual e chegaria depois da lista nova.
      const alteracao = await alterarItem(item, { status: "a_fazer" });
      desfazer.current = [...desfazer.current, alteracao].slice(-MAX_DESFAZER);
      mostrarAviso("Reaberto em A fazer", true);
    }
    const destino: Lista = fechado ? "a_fazer" : item.status === "inbox" ? "inbox" : item.status === "aguardando" ? "aguardando" : "a_fazer";
    selecionarId.current = item.id;
    if (lista === destino) await carregar();
    else setLista(destino);
  }

  const comandos: Comando[] = [
    ...TELAS.map((t) => ({ nome: `Ir para ${NOME_TELA[t]}`, acao: () => trocarLista(t) })),
    { nome: "Nova captura", tecla: "C", acao: () => invoke("abrir_captura") },
    { nome: "Copiar o resumo da daily", acao: () => copiarDaily() },
    { nome: "Abrir a mini-janela de foco", acao: () => abrirMini() },
    ...(foco ? [{ nome: `Pausar ${foco.item.titulo}`, tecla: "P", acao: () => pausar() }] : []),
    { nome: "Anotar o que irrita", tecla: "!", acao: () => setAnotando(true) },
    { nome: "Configurações", tecla: ",", acao: () => setConfigAberta(true) },
  ];

  // Ctrl+K abre a busca de qualquer tela (menos com outra janela de diálogo aberta).
  // Ctrl+C numa lista copia o status do item selecionado; em Meu dia, o resumo da daily.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (configAberta || pedidoNota || anotando || buscando) return;
      const tecla = e.key.toLowerCase();
      if (tecla === "k") {
        e.preventDefault();
        setBuscando(true);
        return;
      }
      if (tecla !== "c" || edicao || menu || window.getSelection()?.toString()) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      const item = itens?.[selecionado];
      if (ehLista(lista) && item) {
        e.preventDefault();
        copiarStatus(item);
      } else if (lista === "dia") {
        e.preventDefault();
        copiarDaily();
      } else if (lista === "agora" && foco) {
        e.preventDefault();
        copiarStatus(foco.item);
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  });

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
      if (edicao || configAberta || pedidoNota || menu || anotando || buscando || ((e.ctrlKey || e.metaKey || e.altKey) && e.key !== "#" && e.key !== "@")) return;
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
        i: () => atualizacao && instalar(),
        "!": () => setAnotando(true),
        "/": () => setBuscando(true),
        s: () =>
          lerConfigDevops().then((cfg) =>
            cfg.organizacao ? sincronizarAzureAgora(true).catch(() => {}) : mostrarAviso("Configure o Azure DevOps em Configurações (,)."),
          ),
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
          Enter: () =>
            lista === "inbox"
              ? aplicar(item, { status: "a_fazer" }, "Movido para A fazer")
              : lista === "aguardando" && aplicar(item, { status: "a_fazer" }, "Voltou para A fazer"),
          w: () => setMenu("aguardando"),
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
  }, [edicao, configAberta, pedidoNota, menu, anotando, buscando, itens, selecionado, lista, aplicar, foco, proximas, prioridades, atualizacao]);

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
      : lista === "uso"
      ? "As 4 semanas de uso real: como está indo e o que irrita."
      : lista === "dia"
      ? "O que chegou, as 3 de hoje, o que você está fazendo e o que já foi feito. Arraste os cartões entre as colunas."
      : lista === "pessoas"
      ? "Tudo que cada pessoa pediu, para responder quem está cobrando."
      : lista === "agora"
      ? foco
        ? "Uma coisa por vez. Interrupções viram captura."
        : "Escolha o que fazer agora."
      : itens === null
      ? ""
      : lista === "aguardando"
        ? total === 0
          ? "Nada esperando ninguém."
          : `${total === 1 ? "Um item espera" : `${total} itens esperam`} a resposta de alguém. No dia de cobrar, voltam para A fazer.`
      : lista === "inbox"
        ? total === 0
          ? "Nada esperando triagem."
          : `${total === 1 ? "Uma coisa chegou" : `${total} coisas chegaram`}. Decida o destino de cada uma.`
        : total === 0
          ? "Nada a fazer por enquanto."
          : `${total === 1 ? "Uma tarefa" : `${total} tarefas`}: as de hoje primeiro, depois por prazo e prioridade.`;

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
        aplicar(
          item,
          { status: destino },
          destino === "inbox" ? "Voltou para a caixa de entrada" : item.status === "aguardando" ? "Voltou para A fazer" : "Movido para A fazer",
        ),
      aguardar: (quem: string | null, ate: string | null) => {
        setMenu(null);
        aplicar(
          item,
          // Planejado para hoje e esperando alguém não combina: sai de Hoje.
          { status: "aguardando", aguardando_quem: quem, aguardando_ate: ate, dia_planejado: null, quando: null },
          quem ? `Aguardando ${quem}` : "Aguardando",
        );
      },
      copiarStatus: () => copiarStatus(item),
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
        else if (ehLista(destino) && destino !== lista && item.status !== destino)
          aplicar(
            item,
            destino === "aguardando" ? { status: destino, dia_planejado: null, quando: null } : { status: destino },
            destino === "inbox"
              ? "Voltou para a caixa de entrada"
              : destino === "aguardando"
                ? "Aguardando. Aperte W para dizer quem e quando cobrar."
                : "Movido para A fazer",
          );
      },
    };
  }

  const botaoCapturar = (
    <button
      type="button"
      onClick={() => invoke("abrir_captura")}
      title={`Abre a mesma janela do atalho global (${rotuloAtalho(atalho)})`}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm text-suave hover:bg-folha hover:text-tinta"
    >
      <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
        <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="flex-1 whitespace-nowrap">Nova captura</span>
      <kbd className="truncate font-sans text-xs text-apagado">{rotuloAtalho(atalho)}</kbd>
    </button>
  );

  /** Uma tela na barra lateral, com o indicador de cada uma (foco, plano do dia, contagem). */
  const botaoTela = (l: Tela) => (
    <button
      key={l}
      type="button"
      onClick={() => trocarLista(l)}
      {...alvoDeArrasto(l)}
      className={`flex shrink-0 items-center justify-between rounded-lg px-3 py-1.5 text-[15px] ${
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
      ) : l === "dia" ? (
        !ritualFeito && <span title="Dia ainda não planejado" className="size-2 rounded-full border-[1.5px] border-destaque" />
      ) : (
        ehLista(l) && <span className="text-[13px] font-normal tabular-nums text-apagado">{contagem[l] || ""}</span>
      )}
    </button>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-folha text-tinta select-none">
      {/* A barra lateral rola sozinha em janelas baixas, sem fazer a página inteira rolar junto. */}
      <nav aria-label="Listas" className="hidden w-56 shrink-0 flex-col gap-1 overflow-y-auto bg-lateral px-4 py-6 md:flex">
        <div className="px-3 pb-4 font-titulo text-[22px] font-semibold tracking-tight">Juggl</div>
        {GRUPOS_MENU.map((grupo, g) => (
          <Fragment key={grupo.titulo}>
            <div className="mb-3 flex shrink-0 flex-col gap-0.5">
              <h3 className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-apagado">{grupo.titulo}</h3>
              {grupo.telas.map(botaoTela)}
              {g === 0 && (
                <CartaoFoco
                  foco={foco}
                  ativo={lista === "agora"}
                  alvo={alvoArrasto === "agora"}
                  arrasto={alvoDeArrasto("agora")}
                  aoAbrir={() => trocarLista("agora")}
                  aoPausar={pausar}
                  aoAbrirMini={abrirMini}
                />
              )}
            </div>
          </Fragment>
        ))}
        <button
          type="button"
          onClick={() => setBuscando(true)}
          className="mb-2 flex w-full shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm text-suave hover:bg-folha hover:text-tinta"
        >
          <Icone nome="busca" className="shrink-0" />
          <span className="flex-1">Buscar</span>
          <kbd className="font-sans text-xs text-apagado">Ctrl+K</kbd>
        </button>
        <div className="flex-1" />
        {botaoTela("regras")}
        {botaoTela("uso")}
        <div className="my-2 border-t border-linha" />
        <button
          type="button"
          onClick={() => setAnotando(true)}
          title="Anotar algo que atrapalhou, para corrigir depois"
          className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm text-suave hover:bg-folha hover:text-tinta"
        >
          Anotar o que irrita <kbd className="font-sans text-xs text-apagado">!</kbd>
        </button>
        {botaoCapturar}
        <button
          type="button"
          onClick={() => setConfigAberta(true)}
          className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm text-suave hover:bg-folha hover:text-tinta"
        >
          Configurações <kbd className="font-sans text-xs text-apagado">,</kbd>
        </button>
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Janela estreita: as listas viram abas no topo, que rolam na horizontal se não couberem. */}
        <nav aria-label="Listas" className="flex shrink-0 items-center gap-1 overflow-x-auto whitespace-nowrap border-b border-linha px-4 py-2 md:hidden">
          {TELAS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => trocarLista(l)}
              {...alvoDeArrasto(l)}
              className={`shrink-0 rounded-full px-3 py-1 text-sm ${
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
            className="ml-auto shrink-0 px-2 text-sm text-suave hover:text-tinta"
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

          {atualizacao && (
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-destaque-claro px-4 py-3 text-sm text-destaque-tinta">
              <span className="flex-1 font-semibold">
                {instalando ? `Baixando a versão ${atualizacao.version}…` : `Versão ${atualizacao.version} do Juggl disponível.`}
              </span>
              <button
                type="button"
                disabled={instalando}
                onClick={instalar}
                className="rounded-md bg-destaque px-3 py-1 font-semibold text-folha hover:opacity-90 disabled:opacity-60"
              >
                Instalar e reiniciar <kbd className="ml-1 font-sans font-normal opacity-70">I</kbd>
              </button>
              {!instalando && (
                <button type="button" onClick={() => setAtualizacao(null)} className="rounded-md px-2 py-1 hover:bg-folha/50">
                  Depois
                </button>
              )}
            </div>
          )}

          {lembreteRitual && lista !== "dia" && (
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-destaque-claro px-4 py-3 text-sm text-destaque-tinta">
              <span className="flex-1 font-semibold">Já passou das 10h e você ainda não planejou o dia.</span>
              <button
                type="button"
                onClick={() => {
                  setLembreteRitual(false);
                  trocarLista("dia");
                }}
                className="rounded-md bg-destaque px-3 py-1 font-semibold text-folha hover:opacity-90"
              >
                Planejar agora
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

          {lista === "inbox" && devopsAtivo && (
            <div className="-mt-4 mb-4 flex justify-end">
              <button
                type="button"
                disabled={sincronizando}
                onClick={() => sincronizarAzureAgora(true).catch(() => {})}
                className="rounded-lg px-3 py-1.5 text-sm text-suave hover:bg-etiqueta hover:text-tinta disabled:opacity-50"
              >
                {sincronizando ? "Buscando no Azure DevOps…" : "Buscar no Azure DevOps"}{" "}
                <kbd className="ml-1 font-sans text-apagado">S</kbd>
              </button>
            </div>
          )}

          {itens?.length === 0 && lista === "inbox" && (
            <p className="mt-16 text-center text-[15px] text-apagado">
              Aperte {rotuloAtalho(atalho)} em qualquer janela para capturar um pedido.
            </p>
          )}
          {itens?.length === 0 && lista === "aguardando" && (
            <p className="mt-16 text-center text-[15px] text-apagado">
              Pediu algo a alguém e está esperando? Aperte W num item de A fazer: ele sai da frente e volta no dia de cobrar.
            </p>
          )}

          {lista === "dia" && (
            <MeuDia
              versao={versao}
              foco={foco}
              planejado={ritualFeito}
              aoAplicar={aplicar}
              aoFocar={focar}
              aoPausar={pausar}
              aoConcluir={concluirFoco}
              aoAlterar={() => {
                setLembreteRitual(false);
                carregar();
              }}
              aoAvisar={mostrarAviso}
              aoArrastar={(item) => (arrastado.current = item)}
              aoCopiarDaily={copiarDaily}
              atalhoCaptura={rotuloAtalho(atalho)}
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
          {lista === "uso" && <Uso versao={versao} aoAvisar={mostrarAviso} aoAnotar={() => setAnotando(true)} />}

          {lista === "horas" && <Horas versao={`${foco?.item.id}-${foco?.inicio}`} aoAvisar={mostrarAviso} />}

          {lista === "agora" && (
            <Agora
              foco={foco}
              proximas={proximas}
              planejado={ritualFeito}
              doDia={proximas.some((i) => i.dia_planejado === dataLocalIso(agora))}
              aoFocar={focar}
              aoPausar={pausar}
              aoConcluir={concluirFoco}
              aoCobrar={() => foco && cobrar(foco.item)}
              aoPlanejar={() => trocarLista("dia")}
              aoMudarNota={(nota) => foco && aplicar(foco.item, { nota }, nota ? "Descrição salva" : "Descrição removida")}
              aoAbrirMini={abrirMini}
            />
          )}

          <ul className="flex flex-col gap-1.5 pb-6">
            {itens?.map((item, i) => {
              // A fazer: as escolhidas para hoje vêm primeiro; um título separa Hoje de Depois.
              const doDia = (x: Item | undefined) => x?.dia_planejado === dataLocalIso(agora);
              const titulo =
                lista !== "a_fazer" || !itens.some((x) => doDia(x))
                  ? null
                  : i === 0 && doDia(item)
                    ? "Hoje"
                    : !doDia(item) && (i === 0 || doDia(itens[i - 1]))
                      ? "Depois"
                      : null;
              return (
              <Fragment key={item.id}>
              {titulo && (
                <li aria-hidden="true" className={`px-4 text-xs font-semibold uppercase tracking-wider text-apagado ${i > 0 ? "mt-5" : ""}`}>
                  {titulo}
                </li>
              )}
              <ItemLista
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
              </Fragment>
              );
            })}
          </ul>
        </main>

        <footer className={`${aviso ? "flex" : "hidden md:flex"} shrink-0 flex-wrap items-center gap-x-5 gap-y-1 px-6 py-4 text-[13px] text-apagado md:px-14`}>
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
                <Dica teclas="N">lançar tempo</Dica>
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
            ) : lista === "uso" ? (
              <>
                <Dica teclas="!">anotar o que irrita</Dica>
                <Dica teclas="↑ ↓">escolher</Dica>
                <Dica teclas="Espaço">resolvida</Dica>
                <Dica teclas="Delete">apagar</Dica>
                <Dica teclas="Ctrl+C">copiar a lista</Dica>
                <Dica teclas="Tab">trocar tela</Dica>
              </>
            ) : lista === "dia" ? (
              <>
                <span>Arraste os cartões entre as colunas</span>
                <Dica teclas="Ctrl+C">resumo da daily</Dica>
                <Dica teclas="Ctrl+K">buscar</Dica>
                <Dica teclas="C">nova captura</Dica>
                <Dica teclas="Z">desfazer</Dica>
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
                {lista === "aguardando" && <Dica teclas="Enter">voltar para A fazer</Dica>}
                <Dica teclas="W">{lista === "aguardando" ? "quem e quando" : "aguardando"}</Dica>
                {lista === "inbox" && devopsAtivo && <Dica teclas="S">Azure DevOps</Dica>}
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
                <Dica teclas="Ctrl+C">copiar status</Dica>
                <Dica teclas="Z">desfazer</Dica>
                <Dica teclas="Ctrl+K">buscar</Dica>
                <Dica teclas="Tab">trocar tela</Dica>
              </>
            )
          )}
        </footer>
      </div>

      {anotando && (
        <AnotarIrritacao
          tela={NOME_TELA[lista]}
          aoCancelar={() => setAnotando(false)}
          aoSalvar={(texto) => {
            setAnotando(false);
            anotarIrritacao(texto, NOME_TELA[lista])
              .then(() => {
                mostrarAviso("Anotado. A lista fica na tela Uso.");
                setVersao((v) => v + 1);
              })
              .catch((e) => setErro(String(e)));
          }}
        />
      )}
      {buscando && (
        <Busca
          comandos={comandos}
          aoFechar={() => setBuscando(false)}
          aoAbrir={(item) => abrirDaBusca(item).catch((e) => setErro(String(e)))}
          aoCopiarStatus={(achado) =>
            lerItem(achado.id)
              .then((item) => item && copiarStatus(item))
              .catch((e) => setErro(String(e)))
          }
        />
      )}
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
        <Configuracoes
          atalho={atalho}
          aoMudarAtalho={setAtalho}
          aoSincronizarDevops={() => sincronizarAzureAgora(true)}
          aoProcurarAtualizacao={async () => {
            if (import.meta.env.DEV) return "Rodando pelo código (npm run tauri dev): atualize com git pull.";
            const nova = await procurarAtualizacao();
            if (!nova) return "Você está na versão mais recente.";
            setAtualizacao(nova);
            return `Versão ${nova.version} disponível: use o aviso no topo da tela.`;
          }}
          aoFechar={() => {
            setConfigAberta(false);
            carregar();
          }}
        />
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

interface PropsCartaoFoco {
  foco: Foco | null;
  ativo: boolean;
  /** Um item está sendo arrastado por cima: soltar põe em foco. */
  alvo: boolean;
  arrasto: React.HTMLAttributes<HTMLElement>;
  aoAbrir: () => void;
  aoPausar: () => void;
  aoAbrirMini: () => void;
}

/**
 * O foco na barra lateral, sempre à vista: título, timer e Pausar. Clicar abre a tela
 * Agora; soltar um item aqui põe ele em foco.
 */
function CartaoFoco({ foco, ativo, alvo, arrasto, aoAbrir, aoPausar, aoAbrirMini }: PropsCartaoFoco) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!foco) return;
    setAgora(Date.now());
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(relogio);
  }, [foco]);

  const borda = alvo
    ? "bg-destaque-claro ring-2 ring-destaque"
    : ativo
      ? "bg-folha shadow-sm ring-1 ring-destaque"
      : foco
        ? "bg-folha/70 hover:bg-folha"
        : "hover:bg-folha/60";
  if (!foco) {
    return (
      <button
        type="button"
        {...arrasto}
        onClick={aoAbrir}
        title="Tela Agora. Solte um item aqui para focar."
        className={`mt-1 flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] text-apagado ${borda}`}
      >
        <span className="size-2 shrink-0 rounded-full border-[1.5px] border-apagado" />
        Nada em foco
      </button>
    );
  }
  return (
    <div {...arrasto} className={`mt-1 flex shrink-0 flex-col gap-1 rounded-xl px-3 py-2.5 ${borda}`}>
      <button type="button" onClick={aoAbrir} title={`${foco.item.titulo}: abrir a tela Agora`} className="text-left">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-destaque">
          <span className="size-1.5 rounded-full bg-destaque" />
          Em foco
        </span>
        <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug font-medium text-tinta">{foco.item.titulo}</span>
      </button>
      <div className="flex items-center gap-1">
        <span className="flex-1 font-titulo text-lg font-medium tabular-nums tracking-tight">
          {formatarCronometro(agora - new Date(foco.inicio).getTime())}
        </span>
        <button type="button" title="Pausar (P na tela Agora)" aria-label="Pausar" onClick={aoPausar} className="rounded-md p-1 text-suave hover:bg-etiqueta hover:text-tinta">
          <Icone nome="pausa" />
        </button>
        <button
          type="button"
          title="Mini-janela sempre por cima"
          aria-label="Abrir a mini-janela de foco"
          onClick={aoAbrirMini}
          className="rounded-md p-1 text-suave hover:bg-etiqueta hover:text-tinta"
        >
          <Icone nome="janela" />
        </button>
      </div>
    </div>
  );
}
