import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { reconhecerLink } from "../captura/links";
import { parseCaptura, type Captura as DadosCaptura } from "../captura/parser";
import { gravarConfig, lerConfig } from "../db/config";
import { criarItem, listarSugestoes } from "../db/itens";
import { listarPrioridades, type Prioridade } from "../db/prioridades";
import Avancada from "./captura/Avancada";
import Formulario, { FORMULARIO_VAZIO, type ValoresFormulario } from "./captura/Formulario";
import Origem from "./Origem";

const LARGURA = 640;

type Modo = "formulario" | "avancado";

interface Sugestoes {
  pessoas: string[];
  projetos: string[];
}

/** Enviado pelo Rust quando a captura abre. */
interface Abertura {
  momento: number;
  selecao: string | null;
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

/** Monta o item a partir do formulário, com o link copiado se houver. */
function capturaDoFormulario(valores: ValoresFormulario, link: string | null): DadosCaptura {
  const reconhecido = link ? reconhecerLink(link) : null;
  return {
    titulo: valores.descricao.trim(),
    pessoa: valores.pessoa.trim() || null,
    projeto: valores.projeto.trim() || null,
    prioridade: valores.prioridadeId,
    prazo: valores.prazo,
    link: reconhecido?.url ?? link,
    origem: reconhecido?.origem ?? "manual",
    idExterno: reconhecido?.idExterno ?? null,
  };
}

export default function Captura() {
  const [modo, setModo] = useState<Modo>("formulario");
  const [valores, setValores] = useState<ValoresFormulario>(FORMULARIO_VAZIO);
  const [texto, setTexto] = useState("");
  const [linkCopiado, setLinkCopiado] = useState<string | null>(null);
  const [sugestoes, setSugestoes] = useState<Sugestoes>({ pessoas: [], projetos: [] });
  const [prioridades, setPrioridades] = useState<Prioridade[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const momentoAtalho = useRef<number | null>(null);
  // Link anexado na última captura: não volta sozinho na próxima, porque provavelmente
  // ainda está na área de transferência e não tem relação com o novo pedido.
  const ultimoLinkUsado = useRef<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    lerConfig("modo_captura").then((salvo) => salvo === "avancado" && setModo("avancado"));
  }, []);

  // Cada atalho: lê a área de transferência, atualiza as listas e foca a descrição.
  // O que foi digitado continua se a captura foi escondida por perda de foco, a menos
  // que haja texto selecionado: aí ele vira a descrição.
  useEffect(() => {
    const parar = listen<Abertura>("captura:aberta", async ({ payload }) => {
      momentoAtalho.current = payload.momento;
      setErro(null);
      if (payload.selecao) {
        const selecao = payload.selecao;
        setValores((v) => ({ ...v, descricao: selecao }));
        setTexto(`${selecao} `);
      }
      entrada.current?.focus();
      const link = await lerLinkDaAreaDeTransferencia();
      setLinkCopiado(link === ultimoLinkUsado.current ? null : link);
      const [nomes, opcoes] = await Promise.all([
        listarSugestoes().catch(() => ({ pessoas: [], projetos: [] })),
        listarPrioridades().catch(() => []),
      ]);
      setSugestoes(nomes);
      setPrioridades(opcoes);
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

  // A janela acompanha a altura do conteúdo.
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const observador = new ResizeObserver(() => {
      getCurrentWindow().setSize(new LogicalSize(LARGURA, Math.ceil(el.getBoundingClientRect().height)));
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const captura = useMemo(
    () =>
      modo === "avancado"
        ? parseCaptura(texto, new Date(), linkCopiado, prioridades)
        : capturaDoFormulario(valores, linkCopiado),
    [modo, texto, valores, linkCopiado, prioridades],
  );

  function limpar() {
    setValores(FORMULARIO_VAZIO);
    setTexto("");
    setErro(null);
  }

  async function trocarModo() {
    const novo: Modo = modo === "formulario" ? "avancado" : "formulario";
    setModo(novo);
    setErro(null);
    await gravarConfig("modo_captura", novo);
    // Leva junto a descrição; as marcações não são convertidas.
    if (novo === "avancado") setTexto(texto || valores.descricao);
    else setValores((v) => ({ ...v, descricao: v.descricao || captura.titulo }));
    requestAnimationFrame(() => entrada.current?.focus());
  }

  async function salvar() {
    if (salvando) return;
    if (!captura.titulo) {
      setErro("Escreva o que precisa ser feito.");
      entrada.current?.focus();
      return;
    }
    setSalvando(true);
    try {
      const duracao = momentoAtalho.current ? Date.now() - momentoAtalho.current : null;
      await criarItem(captura, duracao);
      if (captura.link === linkCopiado) ultimoLinkUsado.current = linkCopiado;
      await emit("item:criado");
      limpar();
      setLinkCopiado(null);
      momentoAtalho.current = null;
      await esconder(true);
    } catch (e) {
      setErro(`Não foi possível salvar: ${e}`);
    } finally {
      setSalvando(false);
    }
  }

  // Enter salva e Esc fecha, de qualquer campo. Campos que usam essas teclas
  // (sugestões, calendário) marcam o evento com preventDefault antes.
  function aoTeclar(e: React.KeyboardEvent) {
    if (e.defaultPrevented) return;
    if (e.key === "Enter") {
      e.preventDefault();
      salvar();
    } else if (e.key === "Escape") {
      e.preventDefault();
      limpar();
      esconder(true);
    } else if (e.key === "." && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      trocarModo();
    }
  }

  return (
    <div ref={caixa} onKeyDown={aoTeclar} className="bg-folha px-[22px] pt-4 pb-3.5 text-tinta">
      {modo === "formulario" ? (
        <Formulario
          valores={valores}
          aoMudar={(mudancas) => {
            setValores((v) => ({ ...v, ...mudancas }));
            setErro(null);
          }}
          sugestoes={sugestoes}
          prioridades={prioridades}
          refDescricao={entrada}
        />
      ) : (
        <Avancada
          texto={texto}
          aoMudar={(t) => {
            setTexto(t);
            setErro(null);
          }}
          captura={captura}
          sugestoes={sugestoes}
          prioridades={prioridades}
          refEntrada={entrada}
        />
      )}

      {captura.link && (
        <div className="mt-3 flex">
          <span className="flex items-center gap-1 rounded-full bg-etiqueta px-2.5 py-0.5">
            <Origem origem={captura.origem} id={captura.idExterno} />
            {captura.link === linkCopiado && (
              <button
                type="button"
                title="Não anexar este link"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setLinkCopiado(null);
                }}
                className="ml-1 text-apagado hover:text-tinta"
              >
                ×
              </button>
            )}
          </span>
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 border-t border-linha pt-2.5 text-xs text-apagado">
        {erro ? (
          <span className="text-atraso">{erro}</span>
        ) : modo === "avancado" ? (
          <span>Use @pessoa, #projeto, !prioridade e &gt;prazo. Enter salva, Esc fecha.</span>
        ) : (
          <span>Enter salva, Esc fecha.</span>
        )}
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={trocarModo}
          className="ml-auto shrink-0 hover:text-tinta"
        >
          {modo === "formulario" ? "Modo avançado" : "Modo formulário"} <kbd className="font-sans">Ctrl+.</kbd>
        </button>
      </div>
    </div>
  );
}
