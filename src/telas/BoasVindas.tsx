import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { lerConfig, gravarConfig } from "../db/config";
import { ehMac } from "../inicio/boasVindas";
import { notificar } from "../regras/notificar";
import { escolherTema, lerTema, NOME_TEMA, type Tema } from "../tema";
import CampoAtalho from "./CampoAtalho";
import Icone, { type NomeIcone } from "./Icone";
import { rotuloAtalho } from "./origens";
import SecaoDevops from "./SecaoDevops";

interface Props {
  atalho: string;
  aoMudarAtalho: (atalho: string) => void;
  aoSincronizarDevops: () => Promise<void>;
  /** Fecha a apresentação (terminada ou pulada); ela não abre sozinha de novo. */
  aoFechar: () => void;
}

const ETAPAS = ["Boas-vindas", "Nova tarefa", "Meu dia", "Avisos", "Azure DevOps", "Pronto"] as const;

const MARCACOES: { marca: string; exemplo: string; quer: string }[] = [
  { marca: "@", exemplo: "@Carla", quer: "quem pediu" },
  { marca: "#", exemplo: "#migracao", quer: "o projeto" },
  { marca: ">", exemplo: ">sexta  >15/10  >amanha", quer: "o prazo" },
  { marca: "!", exemplo: "!alta", quer: "a prioridade" },
];

const FLUXO_DIA: { titulo: string; texto: string }[] = [
  { titulo: "Triar o que chegou", texto: "As tarefas novas esperam na caixa de entrada até você decidir o que fazer." },
  { titulo: "Planejar o dia", texto: "Arraste para Hoje o que entra no dia. Na primeira abertura do dia o Juggl começa aqui." },
  { titulo: "Focar", texto: "Uma coisa por vez. O tempo conta sozinho e pausa quando você sai do computador." },
  { titulo: "Fechar o dia", texto: "No fim do dia, decida o que volta amanhã. O resumo da daily sai pronto para copiar." },
];

const ATALHOS: [string, string][] = [
  ["C", "nova tarefa"],
  ["Ctrl+K", "buscar itens e comandos"],
  ["F", "pôr o item em foco"],
  ["W", "esperar alguém (Aguardando)"],
  ["B", "cobrou de novo"],
  ["Z", "desfazer"],
  [",", "configurações"],
  ["Tab", "trocar de tela"],
];

function Destaque({ icone, titulo, children }: { icone: NomeIcone; titulo: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-destaque-claro text-destaque-tinta">
        <Icone nome={icone} />
      </span>
      <span>
        <b className="block text-[15px] font-semibold">{titulo}</b>
        <span className="text-sm text-suave">{children}</span>
      </span>
    </li>
  );
}

/** Apresentação do primeiro uso: o que é o Juggl, o atalho, o fluxo do dia, avisos e integrações. */
export default function BoasVindas({ atalho, aoMudarAtalho, aoSincronizarDevops, aoFechar }: Props) {
  const [etapa, setEtapa] = useState(0);
  const [gravando, setGravando] = useState(false);
  const [usarSelecao, setUsarSelecao] = useState(true);
  const [tema, setTema] = useState<Tema | null>(null);
  const [mensagemAviso, setMensagemAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const mac = ehMac();
  const ultima = etapa === ETAPAS.length - 1;

  useEffect(() => {
    lerTema().then(setTema);
    lerConfig("usar_selecao").then((v) => setUsarSelecao(v !== "nao"));
  }, []);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (gravando) return;
      if (e.key === "Escape") {
        e.preventDefault();
        aoFechar();
        return;
      }
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") setEtapa((n) => Math.min(n + 1, ETAPAS.length - 1));
      if (e.key === "ArrowLeft") setEtapa((n) => Math.max(n - 1, 0));
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [gravando, aoFechar]);

  async function trocarUsarSelecao(usar: boolean) {
    setUsarSelecao(usar);
    await invoke("definir_usar_selecao", { usar });
    await gravarConfig("usar_selecao", usar ? "sim" : "nao");
  }

  async function trocarTema(novo: Tema) {
    setTema(novo);
    await escolherTema(novo);
  }

  async function testarAviso() {
    const mostrou = await notificar("Juggl", "É assim que os avisos chegam. Poucos, e só quando importa.").catch(() => false);
    setMensagemAviso(
      mostrou
        ? { ok: true, texto: "Enviado. Se não apareceu, o sistema pode estar em não perturbe." }
        : {
            ok: false,
            texto: mac
              ? "O sistema não deixou mostrar. Libere o Juggl em Ajustes do Sistema › Notificações."
              : "O sistema não deixou mostrar. Libere o Juggl nas configurações de notificação do sistema.",
          },
    );
  }

  const conteudo = [
    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-apagado">Boas-vindas</p>
      <h2 className="mt-1 font-titulo text-[30px] font-medium leading-tight tracking-tight">Nada mais se perde no meio do dia.</h2>
      <p className="mt-3 text-[15px] text-tinta-2">
        O Juggl é para quem é interrompido o dia todo: guarda cada pedido em segundos, ajuda a escolher o que fazer
        hoje e lembra quem está esperando por você.
      </p>
      <ul className="mt-6 flex flex-col gap-4">
        <Destaque icone="lapis" titulo="Anote sem parar o que está fazendo">
          Um atalho de qualquer janela, uma linha de texto, Enter. O pedido do Teams não fica para trás.
        </Destaque>
        <Destaque icone="sol" titulo="Um plano por dia">
          O Meu dia mostra o que chegou, o que vence e quem cobrou. Você escolhe o que entra hoje.
        </Destaque>
        <Destaque icone="ampulheta" titulo="Foco e horas sem planilha">
          O tempo conta enquanto um item está em foco, e as horas da semana saem prontas para o apontamento.
        </Destaque>
      </ul>
      <p className="mt-6 rounded-xl bg-etiqueta px-4 py-3 text-sm text-tinta-2">
        Tudo fica neste computador. Não tem conta, nem nuvem, nem nada para a TI liberar.
      </p>
    </>,

    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-apagado">Nova tarefa</p>
      <h2 className="mt-1 font-titulo text-[26px] font-medium leading-tight tracking-tight">Um atalho, de qualquer janela</h2>
      <p className="mt-2 text-[15px] text-tinta-2">
        Aperte <b>{rotuloAtalho(atalho)}</b> no Teams, no navegador ou onde estiver. Abre uma caixinha: escreva o pedido,
        aperte Enter e volte ao que fazia. Se quiser outra combinação, clique no campo e aperte as teclas.
      </p>
      <CampoAtalho atalho={atalho} aoMudarAtalho={aoMudarAtalho} aoGravar={setGravando} />

      <h3 className="mt-6 text-[15px] font-semibold">Marcações opcionais na mesma linha</h3>
      <table className="mt-2 w-full text-sm">
        <tbody>
          {MARCACOES.map((m) => (
            <tr key={m.marca} className="border-b border-linha last:border-0">
              <td className="w-56 whitespace-pre py-1.5 pr-3 font-mono text-destaque-tinta">{m.exemplo}</td>
              <td className="py-1.5 text-suave">{m.quer}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 rounded-lg bg-cartao px-3 py-2 font-mono text-[13px] text-tinta-2 ring-1 ring-linha">
        Revisar o relatório do AD @Carla #migracao &gt;sexta !alta
      </p>
      <p className="mt-2 text-sm text-suave">
        Um link do Teams, Jira, ServiceNow ou Azure DevOps copiado antes vem junto, com a origem reconhecida.
      </p>

      <label className="mt-5 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={usarSelecao}
          onChange={(e) => trocarUsarSelecao(e.target.checked)}
          className="mt-0.5 accent-destaque"
        />
        <span>
          Usar o texto selecionado como descrição
          <span className="block text-suave">
            Selecione a mensagem no Teams antes do atalho e ela vira a descrição do item.
            {mac && " No macOS, o sistema pede para liberar o Juggl em Ajustes do Sistema › Privacidade e Segurança › Acessibilidade."}
          </span>
        </span>
      </label>

      <button
        type="button"
        onClick={() => invoke("abrir_captura")}
        className="mt-5 rounded-lg border border-linha px-3.5 py-2 text-sm hover:bg-etiqueta"
      >
        Testar a nova tarefa agora
      </button>
    </>,

    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-apagado">Meu dia</p>
      <h2 className="mt-1 font-titulo text-[26px] font-medium leading-tight tracking-tight">O dia em quatro passos</h2>
      <ol className="mt-4 flex flex-col gap-3">
        {FLUXO_DIA.map((passo, i) => (
          <li key={passo.titulo} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-destaque text-sm font-semibold text-folha">
              {i + 1}
            </span>
            <span>
              <b className="block text-[15px] font-semibold">{passo.titulo}</b>
              <span className="text-sm text-suave">{passo.texto}</span>
            </span>
          </li>
        ))}
      </ol>
      <h3 className="mt-6 text-[15px] font-semibold">E no meio do caminho</h3>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-tinta-2">
        <li>
          <b>Aguardando:</b> pediu algo a alguém? O item sai da frente e volta no dia de cobrar.
        </li>
        <li>
          <b>Pessoas:</b> tudo o que cada um pediu e quantas vezes cobrou, para responder ao chefe em segundos.
        </li>
        <li>
          <b>Horas da semana:</b> o tempo em foco por projeto e por dia, pronto para copiar ou exportar.
        </li>
      </ul>
    </>,

    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-apagado">Avisos</p>
      <h2 className="mt-1 font-titulo text-[26px] font-medium leading-tight tracking-tight">Poucos avisos, e certeiros</h2>
      <p className="mt-2 text-[15px] text-tinta-2">
        O Juggl usa as notificações do sistema para lembrar antes de estourar: prazo chegando, promessa esquecida, caixa
        de entrada acumulando, foco esquecido e o resumo do fim do dia. Enquanto você foca, só o urgente passa.
      </p>
      <p className="mt-2 text-sm text-suave">Cada regra pode ser ligada, desligada e ajustada na tela Regras.</p>
      <button
        type="button"
        onClick={testarAviso}
        className="mt-4 rounded-lg bg-destaque px-4 py-2 text-sm font-semibold text-folha hover:opacity-90"
      >
        {mac ? "Permitir e testar um aviso" : "Testar um aviso"}
      </button>
      {mensagemAviso && (
        <p className={`mt-2 text-sm ${mensagemAviso.ok ? "text-ok" : "text-atraso"}`}>{mensagemAviso.texto}</p>
      )}
      <p className="mt-6 rounded-xl bg-etiqueta px-4 py-3 text-sm text-tinta-2">
        Fechar a janela não fecha o Juggl: ele fica na bandeja do sistema, com o atalho e os avisos ativos. Para sair,
        use Sair no ícone da bandeja.
      </p>
    </>,

    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-apagado">Opcional</p>
      <h2 className="mt-1 font-titulo text-[26px] font-medium leading-tight tracking-tight">Azure DevOps</h2>
      <p className="mt-2 text-[15px] text-tinta-2">
        Se você usa o Azure DevOps, o Juggl pode trazer os itens atribuídos a você para a caixa de entrada. Precisa de um
        token pessoal, que fica guardado no cofre do sistema. Não usa? Pode pular: dá para ligar depois em Configurações.
      </p>
      <div className="mt-4">
        <SecaoDevops aoSincronizar={aoSincronizarDevops} />
      </div>
    </>,

    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-apagado">Pronto</p>
      <h2 className="mt-1 font-titulo text-[26px] font-medium leading-tight tracking-tight">Tudo certo para começar</h2>
      <p className="mt-2 text-[15px] text-tinta-2">
        Comece anotando a próxima tarefa que chegar com <b>{rotuloAtalho(atalho)}</b>. O resto se ajeita no Meu dia.
      </p>

      <h3 className="mt-6 text-[15px] font-semibold">Aparência</h3>
      <div role="radiogroup" aria-label="Tema" className="mt-2 inline-flex rounded-lg bg-etiqueta p-1">
        {(Object.keys(NOME_TEMA) as Tema[]).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tema === t}
            onClick={() => trocarTema(t)}
            className={`rounded-md px-3 py-1.5 text-sm ${tema === t ? "bg-folha font-semibold shadow-sm" : "text-suave hover:text-tinta"}`}
          >
            {NOME_TEMA[t]}
          </button>
        ))}
      </div>

      <h3 className="mt-6 text-[15px] font-semibold">Dá para fazer tudo pelo teclado</h3>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {ATALHOS.map(([tecla, faz]) => (
          <div key={tecla} className="contents">
            <dt>
              <kbd className="rounded bg-etiqueta px-1.5 py-0.5 font-sans text-xs font-semibold text-tinta-2">{tecla}</kbd>
            </dt>
            <dd className="text-suave">{faz}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-suave">Para ver esta apresentação de novo, vá em Configurações › Rever as boas-vindas.</p>
    </>,
  ];

  return (
    <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:pt-12">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Boas-vindas ao Juggl"
        className="flex max-h-full w-[min(600px,100%)] flex-col rounded-2xl bg-folha text-tinta shadow-2xl ring-1 ring-linha select-text"
      >
        <header className="flex items-center justify-between px-7 pt-6">
          <span className="font-titulo text-lg font-semibold tracking-tight">Juggl</span>
          {!ultima && (
            <button type="button" onClick={aoFechar} className="text-sm text-suave hover:text-tinta">
              Pular apresentação
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-7 pt-4 pb-6">{conteudo[etapa]}</div>

        <footer className="flex items-center gap-3 border-t border-linha px-7 py-4">
          <ol aria-label="Etapas" className="flex flex-1 gap-1.5">
            {ETAPAS.map((nome, i) => (
              <li key={nome}>
                <button
                  type="button"
                  aria-label={nome}
                  aria-current={i === etapa ? "step" : undefined}
                  title={nome}
                  onClick={() => setEtapa(i)}
                  className={`block h-2 rounded-full transition-all ${i === etapa ? "w-6 bg-destaque" : "w-2 bg-linha hover:bg-apagado"}`}
                />
              </li>
            ))}
          </ol>
          {etapa > 0 && (
            <button
              type="button"
              onClick={() => setEtapa(etapa - 1)}
              className="rounded-lg px-3.5 py-2 text-sm text-suave hover:bg-etiqueta hover:text-tinta"
            >
              Voltar
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={() => (ultima ? aoFechar() : setEtapa(etapa + 1))}
            className="rounded-lg bg-destaque px-5 py-2 text-sm font-semibold text-folha hover:opacity-90"
          >
            {ultima ? "Começar a usar" : etapa === 0 ? "Vamos lá" : etapa === 4 ? "Próximo (ou pular)" : "Próximo"}
          </button>
        </footer>
      </section>
    </div>
  );
}
