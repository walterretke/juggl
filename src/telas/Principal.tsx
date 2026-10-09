import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { descreverPrazo, tempoParado } from "../captura/datas";
import { interpretarPrazo, type Prioridade } from "../captura/parser";
import { agendarBackupDiario } from "../db/backup";
import { ATALHO_PADRAO, lerConfig } from "../db/config";
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
import Configuracoes from "./Configuracoes";
import Origem from "./Origem";
import { rotuloAtalho } from "./origens";

const MINUTO_MS = 60 * 1000;
const MAX_DESFAZER = 30;

const NOME_LISTA: Record<Lista, string> = { inbox: "Caixa de entrada", a_fazer: "A fazer" };

type CampoEditavel = "prazo" | "projeto" | "pessoa" | "titulo";

const ROTULO_CAMPO: Record<CampoEditavel, string> = {
  prazo: "Prazo (hoje, amanha, sexta, 15/10; vazio tira)",
  projeto: "Projeto (vazio tira)",
  pessoa: "Quem pediu (vazio tira)",
  titulo: "Título",
};

const PRIORIDADE_POR_TECLA: Record<string, Prioridade | null> = { "1": "alta", "2": "media", "3": "baixa", "0": null };

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
  if (texto.startsWith("atrasado")) return "font-medium text-red-600 dark:text-red-400";
  if (texto === "hoje") return "font-medium text-amber-700 dark:text-amber-400";
  return "text-stone-600 dark:text-stone-300";
}

export default function Principal() {
  const [lista, setLista] = useState<Lista>("inbox");
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
  const desfazer = useRef<Alteracao[]>([]);
  const timerAviso = useRef<number | undefined>(undefined);

  const carregar = useCallback(async () => {
    try {
      const [lidos, total] = await Promise.all([listarItens(lista), contarPorLista()]);
      setItens(lidos);
      setContagem(total);
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

  useEffect(() => agendarBackupDiario((e) => setErro(`Backup diário falhou: ${e}`)), []);

  useEffect(() => {
    carregar();
    const parar = listen("item:criado", carregar);
    const relogio = setInterval(() => setAgora(new Date()), MINUTO_MS);
    return () => {
      parar.then((f) => f());
      clearInterval(relogio);
    };
  }, [carregar]);

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
      if (edicao || configAberta || ((e.ctrlKey || e.metaKey || e.altKey) && e.key !== "#" && e.key !== "@")) return;
      const item = itens?.[selecionado];
      const tecla = e.key;

      const acoes: Record<string, () => void> = {
        ArrowDown: () => setSelecionado((s) => Math.min(s + 1, (itens?.length ?? 1) - 1)),
        ArrowUp: () => setSelecionado((s) => Math.max(s - 1, 0)),
        Tab: () => {
          setLista((l) => (l === "inbox" ? "a_fazer" : "inbox"));
          setSelecionado(0);
        },
        c: () => invoke("abrir_captura"),
        ",": () => setConfigAberta(true),
        z: () => desfazerUltima(),
      };
      acoes.j = acoes.ArrowDown;
      acoes.k = acoes.ArrowUp;

      if (item) {
        Object.assign(acoes, {
          Enter: () => lista === "inbox" && aplicar(item, { status: "a_fazer" }, "Movido para A fazer"),
          e: () => aplicar(item, { status: "arquivado" }, "Arquivado"),
          x: () => aplicar(item, { status: "feito" }, "Concluído"),
          p: () => iniciarEdicao("prazo", item),
          "#": () => iniciarEdicao("projeto", item),
          "@": () => iniciarEdicao("pessoa", item),
          r: () => iniciarEdicao("titulo", item),
          o: () => item.link && openUrl(item.link),
        });
        if (tecla in PRIORIDADE_POR_TECLA) {
          acoes[tecla] = () => aplicar(item, { prioridade: PRIORIDADE_POR_TECLA[tecla] });
        }
      }

      const acao = acoes[tecla] ?? acoes[tecla.toLowerCase()];
      if (acao) {
        e.preventDefault();
        acao();
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [edicao, configAberta, itens, selecionado, lista, aplicar]);

  // Mantém o item selecionado visível ao navegar pelo teclado.
  useEffect(() => {
    document.getElementById(`item-${selecionado}`)?.scrollIntoView({ block: "nearest" });
  }, [selecionado]);

  const sugestoesEdicao =
    edicao?.campo === "pessoa" ? sugestoes.pessoas : edicao?.campo === "projeto" ? sugestoes.projetos : [];

  return (
    <div className="flex h-screen flex-col bg-stone-50 text-stone-800 dark:bg-stone-950 dark:text-stone-100">
      <header className="flex items-center gap-4 border-b border-stone-200 px-6 py-3 dark:border-stone-800">
        <span className="font-semibold tracking-tight">
          Juggl<span className="text-amber-500">.</span>
        </span>
        <nav className="flex gap-1 rounded-lg bg-stone-200/70 p-1 text-sm dark:bg-stone-800">
          {(["inbox", "a_fazer"] as Lista[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                setLista(l);
                setSelecionado(0);
              }}
              className={`rounded-md px-3 py-1 ${
                lista === l
                  ? "bg-white font-medium shadow-sm dark:bg-stone-700"
                  : "text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100"
              }`}
            >
              {NOME_LISTA[l]} <span className="ml-1 tabular-nums text-stone-400">{contagem[l]}</span>
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setConfigAberta(true)}
          title="Configurações (,)"
          className="ml-auto rounded-md px-2 py-1 text-sm text-stone-500 hover:bg-stone-200 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
        >
          Configurações
        </button>
        <button
          type="button"
          onClick={() => invoke("abrir_captura")}
          className=" rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-stone-950 hover:bg-amber-400"
        >
          Capturar <span className="font-normal opacity-70">{rotuloAtalho(atalho)}</span>
        </button>
      </header>

      {avisoAtalho && (
        <p className="mx-6 mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          O atalho global não funcionou: {avisoAtalho}. Use o botão Capturar enquanto isso.
        </p>
      )}
      {erro && <p className="mx-6 mt-4 text-sm text-red-600">Erro no banco: {erro}</p>}

      <main className="flex-1 overflow-y-auto px-3 py-2">
        {itens?.length === 0 && (
          <div className="mt-24 text-center text-stone-500">
            {lista === "inbox" ? (
              <>
                <p className="text-base">Caixa de entrada vazia.</p>
                <p className="mt-1 text-sm">Aperte {rotuloAtalho(atalho)} em qualquer janela para capturar um pedido.</p>
              </>
            ) : (
              <p className="text-base">Nada a fazer. Triagem da caixa de entrada com Enter.</p>
            )}
          </div>
        )}

        <ul>
          {itens?.map((item, i) => {
            const ativo = i === selecionado;
            return (
              <li
                key={item.id}
                id={`item-${i}`}
                onClick={() => setSelecionado(i)}
                onDoubleClick={() => item.link && openUrl(item.link)}
                className={`group relative rounded-md px-3 py-2.5 ${
                  ativo ? "bg-white shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800" : ""
                }`}
              >
                {ativo && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-amber-500" />}
                <div className="flex items-center gap-3">
                  {item.prioridade === "alta" && (
                    <span title="Prioridade alta" className="text-xs font-bold text-red-600 dark:text-red-400">
                      !!
                    </span>
                  )}
                  {item.prioridade === "media" && (
                    <span title="Prioridade média" className="text-xs font-bold text-amber-600">
                      !
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[15px]">{item.titulo}</span>
                  {item.prazo && (
                    <span className={`shrink-0 text-xs ${classePrazo(item.prazo, agora)}`}>
                      {descreverPrazo(item.prazo, agora)}
                    </span>
                  )}
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums text-stone-400" title="Parado há">
                    {tempoParado(lista === "inbox" ? item.criado_em : item.atualizado_em, agora)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-stone-500 dark:text-stone-400">
                  <Origem origem={item.origem} id={item.id_externo} />
                  {item.pessoa && <span>@{item.pessoa}</span>}
                  {item.projeto && <span>#{item.projeto}</span>}
                </div>

                {ativo && edicao && (
                  <form
                    className="mt-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      confirmarEdicao(item);
                    }}
                  >
                    <label className="mb-1 block text-xs text-stone-500">{ROTULO_CAMPO[edicao.campo]}</label>
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
                      className="w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-sm outline-none focus:border-amber-500 dark:border-stone-700 dark:bg-stone-950"
                    />
                    <datalist id="sugestoes-edicao">
                      {sugestoesEdicao.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                    {edicao.erro && <p className="mt-1 text-xs text-red-600">{edicao.erro}</p>}
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </main>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-stone-200 px-6 py-2 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
        {aviso ? (
          <span className="font-medium text-stone-800 dark:text-stone-100">{aviso}</span>
        ) : (
          <>
            <Dica teclas="↑↓">navegar</Dica>
            {lista === "inbox" && <Dica teclas="Enter">a fazer</Dica>}
            <Dica teclas="P">prazo</Dica>
            <Dica teclas="1 2 3">prioridade</Dica>
            <Dica teclas="#">projeto</Dica>
            <Dica teclas="@">quem pediu</Dica>
            <Dica teclas="X">concluir</Dica>
            <Dica teclas="E">arquivar</Dica>
            <Dica teclas="Z">desfazer</Dica>
            <Dica teclas="Tab">trocar lista</Dica>
            <Dica teclas=",">configurações</Dica>
          </>
        )}
      </footer>

      {configAberta && (
        <Configuracoes atalho={atalho} aoMudarAtalho={setAtalho} aoFechar={() => setConfigAberta(false)} />
      )}
    </div>
  );
}

function Dica({ teclas, children }: { teclas: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="rounded border border-stone-300 bg-white px-1 font-sans text-[11px] text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
        {teclas}
      </kbd>
      {children}
    </span>
  );
}
