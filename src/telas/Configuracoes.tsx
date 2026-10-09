import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { backupAgora, listarBackups } from "../db/backup";
import { gravarConfig } from "../db/config";
import { atalhoDoEvento } from "./atalho";
import { rotuloAtalho } from "./origens";

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
      className="fixed inset-0 z-10 flex items-start justify-center bg-stone-950/30 pt-16"
      onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}
    >
      <section className="w-[min(560px,90vw)] rounded-xl bg-white p-6 shadow-xl ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
        <header className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Configurações</h2>
          <button type="button" onClick={aoFechar} className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200">
            Fechar <kbd className="ml-1 text-xs">Esc</kbd>
          </button>
        </header>

        <h3 className="text-sm font-medium">Atalho da captura</h3>
        <p className="mt-1 text-xs text-stone-500">
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
            className="flex-1 rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-amber-500 dark:border-stone-700 dark:bg-stone-950"
          />
          <button
            type="button"
            disabled={!novoAtalho}
            onClick={salvarAtalho}
            className="rounded-md bg-amber-500 px-3 text-sm font-medium text-stone-950 hover:bg-amber-400 disabled:opacity-40"
          >
            Salvar
          </button>
        </div>
        {mensagemAtalho && (
          <p className={`mt-2 text-xs ${mensagemAtalho.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}>
            {mensagemAtalho.texto}
          </p>
        )}

        <h3 className="mt-6 text-sm font-medium">Backup</h3>
        <p className="mt-1 text-xs text-stone-500">
          Uma cópia do banco é feita todo dia, e as 7 mais recentes ficam guardadas.
          {backups[0] && <> Último: {backups[0].split(/[\\/]/).pop()}.</>}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={fazerBackup}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
          >
            Fazer backup agora
          </button>
          <button
            type="button"
            disabled={!backups[0]}
            onClick={() => backups[0] && revealItemInDir(backups[0])}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:hover:bg-stone-800"
          >
            Mostrar na pasta
          </button>
        </div>
        {mensagemBackup && <p className="mt-2 text-xs text-stone-500">{mensagemBackup}</p>}

        <p className="mt-6 border-t border-stone-200 pt-4 text-xs text-stone-500 dark:border-stone-800">
          Fechar a janela deixa o Juggl na bandeja do sistema, com o atalho ativo. Para sair, use Sair no ícone da bandeja.
        </p>
      </section>
    </div>
  );
}
