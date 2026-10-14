import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { gravarConfig, lerConfig } from "../db/config";
import { CHAVE_INTERVALO_NOTA, criarNota } from "../db/notas";
import { escolhaDoIntervalo, INTERVALO_PADRAO, minutosDaEscolha, type EscolhaIntervalo as Escolha } from "../notas/lembrete";
import EscolhaIntervalo from "./notas/EscolhaIntervalo";

const LARGURA = 560;
const MAX_TITULO_DA_DESCRICAO = 80;

/** Enviado pelo Rust quando a nota rápida abre. */
interface Abertura {
  momento: number;
  selecao: string | null;
}

function esconder(devolverFoco: boolean) {
  return invoke("esconder_nota", { devolverFoco });
}

/** Sem título, a primeira linha da descrição vira o título. */
function tituloDaNota(titulo: string, descricao: string): string {
  const escrito = titulo.trim();
  if (escrito) return escrito;
  const linha = descricao.split("\n").find((l) => l.trim())?.trim() ?? "";
  return linha.length > MAX_TITULO_DA_DESCRICAO ? `${linha.slice(0, MAX_TITULO_DA_DESCRICAO - 1)}…` : linha;
}

/**
 * Nota rápida, aberta pelo atalho global: algo para não esquecer ("marcar reunião com o
 * Carlos"), que avisa de tempos em tempos até ser resolvido. Enter salva, Esc fecha.
 */
export default function NotaRapida() {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [intervalo, setIntervalo] = useState<Escolha>(() => escolhaDoIntervalo(INTERVALO_PADRAO));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLDivElement>(null);

  // Cada atalho: volta ao último intervalo usado e foca o título. O texto selecionado na
  // janela em uso (a mensagem do Teams, por exemplo) vira a descrição.
  useEffect(() => {
    const parar = listen<Abertura>("nota:aberta", async ({ payload }) => {
      setErro(null);
      if (payload.selecao) setDescricao(payload.selecao.trim());
      entrada.current?.focus();
      const salvo = Number(await lerConfig(CHAVE_INTERVALO_NOTA).catch(() => null));
      if (Number.isInteger(salvo) && salvo > 0) setIntervalo(escolhaDoIntervalo(salvo));
    });
    return () => {
      parar.then((f) => f());
    };
  }, []);

  // Clicar fora esconde sem salvar; o que foi digitado continua para a próxima vez.
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

  function limpar() {
    setTitulo("");
    setDescricao("");
    setErro(null);
  }

  async function salvar() {
    if (salvando) return;
    const nome = tituloDaNota(titulo, descricao);
    if (!nome) {
      setErro("Escreva o que você não pode esquecer.");
      entrada.current?.focus();
      return;
    }
    const minutos = minutosDaEscolha(intervalo);
    if (!minutos) {
      setErro("Escolha de quanto em quanto tempo avisar (até uma semana).");
      return;
    }
    setSalvando(true);
    try {
      await criarNota(nome, descricao, minutos);
      await gravarConfig(CHAVE_INTERVALO_NOTA, String(minutos));
      await emit("nota:criada");
      limpar();
      await esconder(true);
    } catch (e) {
      setErro(`Não foi possível salvar: ${e}`);
    } finally {
      setSalvando(false);
    }
  }

  // Enter salva (na descrição, Ctrl+Enter; Enter ali quebra a linha) e Esc fecha.
  function aoTeclar(e: React.KeyboardEvent) {
    if (e.defaultPrevented) return;
    const naDescricao = e.target instanceof HTMLTextAreaElement;
    if (e.key === "Enter" && (!naDescricao || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      salvar();
    } else if (e.key === "Escape") {
      e.preventDefault();
      limpar();
      esconder(true);
    }
  }

  return (
    <div ref={caixa} onKeyDown={aoTeclar} className="bg-folha px-[22px] pt-4 pb-3.5 text-tinta">
      <label htmlFor="nota-titulo" className="block text-xs font-semibold text-suave">
        Nota para não esquecer
      </label>
      <input
        id="nota-titulo"
        ref={entrada}
        autoFocus
        value={titulo}
        onChange={(e) => {
          setTitulo(e.target.value);
          setErro(null);
        }}
        placeholder="ex.: marcar reunião com o Carlos"
        className="mt-1 w-full bg-transparent font-titulo text-xl outline-none placeholder:text-apagado"
      />
      <textarea
        aria-label="Descrição"
        value={descricao}
        onChange={(e) => {
          setDescricao(e.target.value);
          setErro(null);
        }}
        rows={descricao ? 3 : 2}
        placeholder="Detalhes ou a mensagem recebida (opcional)"
        className="mt-2 w-full resize-none rounded-lg border border-linha bg-cartao px-3 py-2 text-sm outline-none placeholder:text-apagado focus:border-destaque"
      />
      <div className="mt-2">
        <EscolhaIntervalo
          escolha={intervalo}
          aoMudar={(e) => {
            setIntervalo(e);
            setErro(null);
          }}
        />
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-linha pt-2.5 text-xs text-apagado">
        {erro ? (
          <span className="text-atraso">{erro}</span>
        ) : (
          <span className="truncate">Enter salva, Esc fecha. Avisa até você resolver ou virar tarefa.</span>
        )}
      </div>
    </div>
  );
}
