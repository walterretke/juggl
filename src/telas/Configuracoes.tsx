import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { backupAgora, listarBackups } from "../db/backup";
import { gravarConfig, lerConfig } from "../db/config";
import { atalhoDoEvento } from "./atalho";
import EditorPrioridades from "./EditorPrioridades";
import { rotuloAtalho } from "./origens";
import { escolherTema, lerTema, NOME_TEMA, type Tema } from "../tema";

interface Props {
  atalho: string;
  aoMudarAtalho: (atalho: string) => void;
  aoFechar: () => void;
}

export default function Configuracoes({ atalho, aoMudarAtalho, aoFechar }: Props) {
  const [gravando, setGravando] = useState(false);
  const [novoAtalho, setNovoAtalho] = useState<string | null>(null);
  const [mensagemAtalho, setMensagemAtalho] = useState<{ ok: boolean; texto: string } | null>(null);
  const [backups, setBackups] = useState<string[]>([]);
  const [mensagemBackup, setMensagemBackup] = useState<string | null>(null);
  const [tema, setTema] = useState<Tema | null>(null);
  const [usarSelecao, setUsarSelecao] = useState(true);

  useEffect(() => {
    lerTema().then(setTema);
    lerConfig("usar_selecao").then((v) => setUsarSelecao(v !== "nao"));
  }, []);

  async function trocarUsarSelecao(usar: boolean) {
    setUsarSelecao(usar);
    await invoke("definir_usar_selecao", { usar });
    await gravarConfig("usar_selecao", usar ? "sim" : "nao");
  }

  async function trocarTema(novo: Tema) {
    setTema(novo);
    await escolherTema(novo);
  }

  useEffect(() => {
    listarBackups().then(setBackups).catch((e) => setMensagemBackup(String(e)));
  }, []);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape" && !gravando) aoFechar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [gravando, aoFechar]);

  async function salvarAtalho() {
    if (!novoAtalho) return;
    try {
      await invoke("definir_atalho", { atalho: novoAtalho });
      await gravarConfig("atalho", novoAtalho);
      aoMudarAtalho(novoAtalho);
      setMensagemAtalho({ ok: true, texto: `Atalho trocado para ${rotuloAtalho(novoAtalho)}.` });
      setNovoAtalho(null);
    } catch (e) {
      setMensagemAtalho({ ok: false, texto: String(e) });
    }
  }

  async function fazerBackup() {
    try {
      await backupAgora();
      setBackups(await listarBackups());
      setMensagemBackup("Backup feito.");
    } catch (e) {
      setMensagemBackup(`Falhou: ${e}`);
    }
  }

  return (
    <div
      className="fixed inset-0 z-10 flex items-start justify-center bg-black/30 pt-16"
      onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}
    >
      <section className="w-[min(560px,90vw)] max-h-[88vh] overflow-y-auto rounded-2xl bg-folha p-7 text-tinta shadow-2xl ring-1 ring-linha">
        <header className="mb-5 flex items-center justify-between">
          <h2 className="font-titulo text-2xl font-medium tracking-tight">Configurações</h2>
          <button type="button" onClick={aoFechar} className="text-sm text-suave hover:text-tinta">
            Fechar <kbd className="ml-1 text-xs">Esc</kbd>
          </button>
        </header>

        <h3 className="text-[15px] font-semibold">Aparência</h3>
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

        <h3 className="mt-7 text-[15px] font-semibold">Atalho da captura</h3>
        <p className="mt-1 text-sm text-suave">
          Atual: <strong>{rotuloAtalho(atalho)}</strong>. Clique no campo e aperte a combinação nova.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            readOnly
            value={gravando ? (novoAtalho ? rotuloAtalho(novoAtalho) : "Aperte as teclas…") : rotuloAtalho(novoAtalho ?? atalho)}
            onFocus={() => {
              setGravando(true);
              setMensagemAtalho(null);
            }}
            onBlur={() => setGravando(false)}
            onKeyDown={(e) => {
              e.preventDefault();
              if (e.key === "Escape") {
                setNovoAtalho(null);
                e.currentTarget.blur();
                return;
              }
              const combinacao = atalhoDoEvento(e);
              if (combinacao) {
                setNovoAtalho(combinacao);
                e.currentTarget.blur();
              }
            }}
            className="flex-1 rounded-lg border border-linha bg-cartao px-3 py-2 text-[15px] outline-none focus:border-destaque"
          />
          <button
            type="button"
            disabled={!novoAtalho}
            onClick={salvarAtalho}
            className="rounded-lg bg-destaque px-4 text-sm font-semibold text-folha hover:opacity-90 disabled:opacity-40"
          >
            Salvar
          </button>
        </div>
        {mensagemAtalho && (
          <p className={`mt-2 text-xs ${mensagemAtalho.ok ? "text-destaque" : "text-atraso"}`}>
            {mensagemAtalho.texto}
          </p>
        )}

        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={usarSelecao}
            onChange={(e) => trocarUsarSelecao(e.target.checked)}
            className="mt-0.5 accent-destaque"
          />
          <span>
            Usar o texto selecionado como descrição
            <span className="block text-suave">
              Ao apertar o atalho, o Juggl copia o que estiver selecionado na janela em uso e devolve a área de
              transferência como estava.
            </span>
          </span>
        </label>

        <h3 className="mt-7 text-[15px] font-semibold">Prioridades</h3>
        <EditorPrioridades />

        <h3 className="mt-7 text-[15px] font-semibold">Backup</h3>
        <p className="mt-1 text-sm text-suave">
          Uma cópia do banco é feita todo dia, e as 7 mais recentes ficam guardadas.
          {backups[0] && <> Último: {backups[0].split(/[\\/]/).pop()}.</>}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={fazerBackup}
            className="rounded-lg border border-linha px-3.5 py-2 text-sm hover:bg-etiqueta"
          >
            Fazer backup agora
          </button>
          <button
            type="button"
            disabled={!backups[0]}
            onClick={() => backups[0] && revealItemInDir(backups[0])}
            className="rounded-lg border border-linha px-3.5 py-2 text-sm hover:bg-etiqueta disabled:opacity-40"
          >
            Mostrar na pasta
          </button>
        </div>
        {mensagemBackup && <p className="mt-2 text-sm text-suave">{mensagemBackup}</p>}

        <p className="mt-6 border-t border-linha pt-4 text-sm text-suave">
          Fechar a janela deixa o Juggl na bandeja do sistema, com o atalho ativo. Para sair, use Sair no ícone da bandeja.
        </p>
      </section>
    </div>
  );
}
