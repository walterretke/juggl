import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { bytesDoAnexo, ehImagem, formatarTamanho, paraBase64, prepararAnexo } from "../anexos/compressao";
import { apagarAnexo, criarAnexo, lerDadosAnexo, listarAnexos, type Anexo } from "../db/anexos";
import Icone from "./Icone";

interface Props {
  itemId: string;
  /** Algo mudou (para atualizar o 📎 nos cartões). */
  aoMudar: () => void;
  /** O editor entrega aqui os arquivos colados ou arrastados em qualquer lugar dele. */
  refAdicionar?: React.MutableRefObject<((arquivos: File[]) => void) | null>;
}

/** Imagens com miniatura e prévia; o resto abre no programa padrão do sistema. */
function podeMostrar(anexo: Anexo) {
  return ehImagem(anexo.tipo) && anexo.compressao !== "gzip" && anexo.tipo !== "image/svg+xml";
}

function extensao(nome: string) {
  const ponto = nome.lastIndexOf(".");
  return ponto > 0 ? nome.slice(ponto + 1, ponto + 5).toUpperCase() : "ARQ";
}

/** Miniatura de imagem: carrega o conteúdo só quando aparece. */
function useImagem(anexo: Anexo | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!anexo || !podeMostrar(anexo)) return;
    let vivo = true;
    lerDadosAnexo(anexo.id).then((d) => vivo && d && setUrl(`data:${anexo.tipo};base64,${d.dados}`));
    return () => {
      vivo = false;
    };
  }, [anexo?.id]);
  return url;
}

function Miniatura({ anexo }: { anexo: Anexo }) {
  const url = useImagem(anexo);
  if (url) return <img src={url} alt="" className="size-full object-cover" />;
  return <span className="text-[11px] font-bold tracking-wider text-suave">{extensao(anexo.nome)}</span>;
}

/**
 * Anexos da tarefa: clique em "Anexar", arraste ou cole (Ctrl+V) arquivos. Imagens são
 * reduzidas e convertidas para WebP; os outros arquivos vão comprimidos quando compensa.
 */
export default function Anexos({ itemId, aoMudar, refAdicionar }: Props) {
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [trabalhando, setTrabalhando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [vendo, setVendo] = useState<Anexo | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const seletor = useRef<HTMLInputElement>(null);
  const urlVendo = useImagem(vendo);

  const recarregar = () =>
    listarAnexos(itemId)
      .then(setAnexos)
      .catch((e) => setAviso(String(e)));

  useEffect(() => {
    recarregar();
  }, [itemId]);

  async function adicionar(arquivos: File[]) {
    if (arquivos.length === 0) return;
    const problemas: string[] = [];
    let economia = 0;
    for (const [i, arquivo] of arquivos.entries()) {
      setTrabalhando(arquivos.length > 1 ? `Comprimindo ${i + 1} de ${arquivos.length}…` : `Comprimindo ${arquivo.name}…`);
      try {
        const preparado = await prepararAnexo(arquivo);
        await criarAnexo(itemId, preparado);
        economia += preparado.tamanho_original - preparado.tamanho;
      } catch (e) {
        problemas.push(e instanceof Error ? e.message : String(e));
      }
    }
    setTrabalhando(null);
    setAviso(problemas.length ? problemas.join(" ") : economia > 0 ? `Economizei ${formatarTamanho(economia)} comprimindo.` : null);
    await recarregar();
    aoMudar();
  }

  if (refAdicionar) refAdicionar.current = adicionar;

  async function bytesEmBase64(anexo: Anexo) {
    const dados = await lerDadosAnexo(anexo.id);
    if (!dados) throw new Error("Anexo não encontrado.");
    return paraBase64(await bytesDoAnexo(dados));
  }

  async function abrir(anexo: Anexo) {
    if (podeMostrar(anexo)) {
      setVendo(anexo);
      return;
    }
    try {
      await invoke("abrir_anexo", { nome: anexo.nome, dados: await bytesEmBase64(anexo) });
    } catch (e) {
      setAviso(`Não consegui abrir: ${e}`);
    }
  }

  async function salvar(anexo: Anexo) {
    try {
      const caminho = await invoke<string>("salvar_anexo", { nome: anexo.nome, dados: await bytesEmBase64(anexo) });
      setAviso(`Salvo em ${caminho}`);
      revealItemInDir(caminho).catch(() => {});
    } catch (e) {
      setAviso(`Não consegui salvar: ${e}`);
    }
  }

  async function remover(anexo: Anexo) {
    try {
      await apagarAnexo(anexo.id);
      if (vendo?.id === anexo.id) setVendo(null);
      await recarregar();
      aoMudar();
    } catch (e) {
      setAviso(String(e));
    }
  }

  const temArquivos = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

  return (
    <div
      onDragOver={(e) => {
        if (!temArquivos(e)) return;
        e.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false);
      }}
      onDrop={(e) => {
        if (!temArquivos(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setArrastando(false);
        adicionar([...e.dataTransfer.files]);
      }}
      className={`rounded-lg transition-colors ${arrastando ? "bg-destaque-claro ring-2 ring-destaque ring-dashed" : ""}`}
    >
      <div className="flex items-baseline justify-between">
        <span className="block text-xs font-semibold text-suave">Anexos</span>
        {anexos.length > 0 && (
          <span className="text-xs tabular-nums text-apagado">
            {formatarTamanho(anexos.reduce((soma, a) => soma + a.tamanho, 0))} guardados
          </span>
        )}
      </div>
      {anexos.length > 0 && (
        <ul className="mt-1.5 grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2">
          {anexos.map((a) => (
            <li key={a.id} className="group relative overflow-hidden rounded-lg border border-linha bg-cartao">
              <button
                type="button"
                onClick={() => abrir(a)}
                title={podeMostrar(a) ? "Ver" : "Abrir no programa padrão"}
                className="flex w-full flex-col text-left"
              >
                <span className="flex h-20 w-full items-center justify-center overflow-hidden bg-etiqueta">
                  <Miniatura anexo={a} />
                </span>
                <span className="w-full truncate px-2 pt-1.5 text-[13px] font-semibold">{a.nome}</span>
                <span className="px-2 pb-1.5 text-[11px] text-apagado">
                  {formatarTamanho(a.tamanho)}
                  {a.tamanho < a.tamanho_original && ` · era ${formatarTamanho(a.tamanho_original)}`}
                </span>
              </button>
              <span className="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <button
                  type="button"
                  title="Salvar em Downloads"
                  aria-label={`Salvar ${a.nome} em Downloads`}
                  onClick={() => salvar(a)}
                  className="rounded-md bg-folha/90 p-1 text-suave shadow-sm hover:text-tinta"
                >
                  <Icone nome="baixar" className="size-3.5" />
                </button>
                <button
                  type="button"
                  title="Remover"
                  aria-label={`Remover ${a.nome}`}
                  onClick={() => remover(a)}
                  className="rounded-md bg-folha/90 p-1 text-suave shadow-sm hover:text-atraso"
                >
                  <Icone nome="lixeira" className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!!trabalhando}
          onClick={() => seletor.current?.click()}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-semibold text-suave hover:bg-etiqueta hover:text-tinta disabled:opacity-60"
        >
          <Icone nome="clipe" />
          Anexar arquivo
        </button>
        <span className="text-[12px] text-apagado">{trabalhando ?? "ou arraste para cá, ou cole um print com Ctrl+V"}</span>
        <input
          ref={seletor}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            adicionar([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>
      {aviso && <p className="mt-1 text-[13px] text-suave">{aviso}</p>}

      {vendo && (
        <div
          role="dialog"
          aria-label={vendo.nome}
          className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/75 p-6"
          onMouseDown={(e) => e.target === e.currentTarget && setVendo(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setVendo(null);
            }
          }}
        >
          {urlVendo ? (
            <img src={urlVendo} alt={vendo.nome} className="max-h-[80vh] max-w-full rounded-lg shadow-2xl" />
          ) : (
            <p className="text-white/80">Carregando…</p>
          )}
          <div className="flex items-center gap-2 text-sm text-white">
            <span className="mr-2 max-w-[40ch] truncate opacity-80">{vendo.nome}</span>
            <button type="button" onClick={() => salvar(vendo)} className="rounded-lg bg-white/15 px-3 py-1.5 font-semibold hover:bg-white/25">
              Salvar em Downloads
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => setVendo(null)}
              className="rounded-lg bg-white/15 px-3 py-1.5 font-semibold hover:bg-white/25"
            >
              Fechar <kbd className="ml-1 font-sans font-normal opacity-70">Esc</kbd>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
