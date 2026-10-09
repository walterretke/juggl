import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { descreverPrazo } from "../captura/datas";
import { reconhecerLink } from "../captura/links";
import { parseCaptura } from "../captura/parser";
import { criarItem, listarSugestoes } from "../db/itens";
import Origem from "./Origem";

const LARGURA = 640;
const MAX_SUGESTOES = 5;

interface Sugestoes {
  pessoas: string[];
  projetos: string[];
}

async function lerLinkDaAreaDeTransferencia(): Promise<string | null> {
  try {
    const texto = await readText();
    return reconhecerLink(texto)?.url ?? null;
  } catch {
    return null; // área de transferência vazia ou sem texto
  }
}

function esconder(devolverFoco: boolean) {
  return invoke("esconder_captura", { devolverFoco });
}

export default function Captura() {
  const [texto, setTexto] = useState("");
  const [linkCopiado, setLinkCopiado] = useState<string | null>(null);
  const [sugestoes, setSugestoes] = useState<Sugestoes>({ pessoas: [], projetos: [] });
  const [selecionada, setSelecionada] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const momentoAtalho = useRef<number | null>(null);
  // Link anexado na última captura: não volta sozinho na próxima, porque provavelmente
  // ainda está na área de transferência e não tem relação com o novo pedido.
  const ultimoLinkUsado = useRef<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLDivElement>(null);

  // Cada atalho: lê a área de transferência, atualiza o autocompletar e foca a linha.
  // O texto digitado continua se a captura foi escondida por perda de foco.
  useEffect(() => {
    const parar = listen<number>("captura:aberta", async (evento) => {
      momentoAtalho.current = evento.payload;
      setErro(null);
      entrada.current?.focus();
      const link = await lerLinkDaAreaDeTransferencia();
      setLinkCopiado(link === ultimoLinkUsado.current ? null : link);
      setSugestoes(await listarSugestoes().catch(() => ({ pessoas: [], projetos: [] })));
    });
    return () => {
      parar.then((f) => f());
    };
  }, []);

  // Clicar fora esconde sem salvar.
  useEffect(() => {
    const parar = getCurrentWindow().onFocusChanged(({ payload: focada }) => {
      if (!focada) esconder(false);
    });
    return () => {
      parar.then((f) => f());
    };
  }, []);

  // A janela acompanha a altura do conteúdo (prévia e sugestões).
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const observador = new ResizeObserver(() => {
      getCurrentWindow().setSize(new LogicalSize(LARGURA, Math.ceil(el.getBoundingClientRect().height)));
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const captura = useMemo(() => parseCaptura(texto, new Date(), linkCopiado), [texto, linkCopiado]);

  // Autocompletar da palavra que está sendo digitada no fim da linha.
  const ultima = texto.match(/(^|\s)([@#])([^\s]*)$/);
  const opcoes = useMemo(() => {
    if (!ultima) return [];
    const lista = ultima[2] === "@" ? sugestoes.pessoas : sugestoes.projetos;
    const inicio = ultima[3].toLowerCase();
    return lista.filter((s) => s.toLowerCase().startsWith(inicio) && s.toLowerCase() !== inicio).slice(0, MAX_SUGESTOES);
  }, [ultima?.[2], ultima?.[3], sugestoes]);

  useEffect(() => setSelecionada(0), [opcoes.length]);

  const completar = useCallback(
    (opcao: string) => {
      if (!ultima) return;
      setTexto(texto.slice(0, texto.length - ultima[3].length) + opcao + " ");
      entrada.current?.focus();
    },
    [texto, ultima],
  );

  async function salvar() {
    if (salvando) return;
    if (!captura.titulo) {
      setErro("Escreva o que precisa ser feito.");
      return;
    }
    setSalvando(true);
    try {
      const duracao = momentoAtalho.current ? Date.now() - momentoAtalho.current : null;
      await criarItem(captura, duracao);
      if (captura.link === linkCopiado) ultimoLinkUsado.current = linkCopiado;
      await emit("item:criado");
      setTexto("");
      setLinkCopiado(null);
      momentoAtalho.current = null;
      await esconder(true);
    } catch (e) {
      setErro(`Não foi possível salvar: ${e}`);
    } finally {
      setSalvando(false);
    }
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      salvar();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setTexto("");
      setErro(null);
      esconder(true);
    } else if (opcoes.length > 0 && e.key === "Tab") {
      e.preventDefault();
      completar(opcoes[selecionada]);
    } else if (opcoes.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const passo = e.key === "ArrowDown" ? 1 : -1;
      setSelecionada((selecionada + passo + opcoes.length) % opcoes.length);
    }
  }

  const etiquetas: { texto: string; classe?: string }[] = [];
  if (captura.pessoa) etiquetas.push({ texto: `@${captura.pessoa}` });
  if (captura.projeto) etiquetas.push({ texto: `#${captura.projeto}` });
  if (captura.prioridade) etiquetas.push({ texto: `!${captura.prioridade}` });
  if (captura.prazo) etiquetas.push({ texto: `prazo: ${descreverPrazo(captura.prazo, new Date())}` });

  return (
    <div
      ref={caixa}
      className="border border-stone-300 border-l-4 border-l-amber-500 bg-white text-stone-900 dark:border-stone-700 dark:border-l-amber-500 dark:bg-stone-900 dark:text-stone-100"
    >
      <input
        ref={entrada}
        autoFocus
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setErro(null);
        }}
        onKeyDown={aoTeclar}
        placeholder="O que chegou?  @quem  #projeto  !alta  >sexta"
        spellCheck={false}
        className="h-16 w-full bg-transparent px-4 text-lg outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500"
      />

      {opcoes.length > 0 && (
        <ul className="border-t border-stone-200 py-1 dark:border-stone-800">
          {opcoes.map((opcao, i) => (
            <li
              key={opcao}
              onMouseDown={(e) => {
                e.preventDefault();
                completar(opcao);
              }}
              className={`cursor-pointer px-4 py-1 text-sm ${i === selecionada ? "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : ""}`}
            >
              {ultima?.[2]}
              {opcao}
            </li>
          ))}
        </ul>
      )}

      {(etiquetas.length > 0 || captura.link || erro) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 px-4 py-2 text-xs dark:border-stone-800">
          {captura.link && (
            <span className="flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 dark:bg-stone-800">
              <Origem origem={captura.origem} id={captura.idExterno} />
              {captura.link === linkCopiado && (
                <button
                  type="button"
                  title="Não anexar este link"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setLinkCopiado(null);
                  }}
                  className="ml-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                >
                  ×
                </button>
              )}
            </span>
          )}
          {etiquetas.map((et) => (
            <span key={et.texto} className="rounded-md bg-stone-100 px-2 py-0.5 dark:bg-stone-800">
              {et.texto}
            </span>
          ))}
          {erro && <span className="text-red-600 dark:text-red-400">{erro}</span>}
        </div>
      )}
    </div>
  );
}
