import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { backupAgora, listarBackups, restaurarBackup } from "../db/backup";
import { gravarConfig, lerConfig } from "../db/config";
import CampoAtalho from "./CampoAtalho";
import EditorPrioridades from "./EditorPrioridades";
import SecaoDevops from "./SecaoDevops";
import SecaoRecorrentes from "./SecaoRecorrentes";
import { CHAVE_INATIVIDADE, lerLimiteInatividade } from "../db/foco";
import { rotuloAtalho } from "./origens";
import { escolherTema, lerTema, NOME_TEMA, type Tema } from "../tema";
import { gravarOverlayAoFocar, lerOverlayAoFocar } from "../sons/preferencias";

interface Props {
  atalho: string;
  aoMudarAtalho: (atalho: string) => void;
  atalhoNota: string;
  aoMudarAtalhoNota: (atalho: string) => void;
  aoSincronizarDevops: () => Promise<void>;
  /** Procura versão nova; devolve a mensagem para mostrar. */
  aoProcurarAtualizacao: () => Promise<string>;
  /** Fecha as configurações e abre a apresentação do primeiro uso. */
  aoReverBoasVindas: () => void;
  aoFechar: () => void;
}

export default function Configuracoes({ atalho, aoMudarAtalho, atalhoNota, aoMudarAtalhoNota, aoSincronizarDevops, aoProcurarAtualizacao, aoReverBoasVindas, aoFechar }: Props) {
  const [versao, setVersao] = useState("");
  const [mensagemVersao, setMensagemVersao] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [backups, setBackups] = useState<string[]>([]);
  const [mensagemBackup, setMensagemBackup] = useState<string | null>(null);
  /** Backup escolhido para restaurar, esperando a confirmação. */
  const [restaurando, setRestaurando] = useState<string | null>(null);
  const [verBackups, setVerBackups] = useState(false);
  const [tema, setTema] = useState<Tema | null>(null);
  const [usarSelecao, setUsarSelecao] = useState(true);
  const [inatividade, setInatividade] = useState("");
  const [overlayAoFocar, setOverlayAoFocar] = useState(true);

  useEffect(() => {
    lerTema().then(setTema);
    getVersion().then(setVersao);
    lerConfig("usar_selecao").then((v) => setUsarSelecao(v !== "nao"));
    lerLimiteInatividade().then((m) => setInatividade(String(m)));
    lerOverlayAoFocar().then(setOverlayAoFocar);
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

  async function fazerBackup() {
    try {
      await backupAgora();
      setBackups(await listarBackups());
      setMensagemBackup("Backup feito.");
    } catch (e) {
      setMensagemBackup(`Falhou: ${e}`);
    }
  }

  async function restaurar(caminho: string) {
    if (restaurando !== caminho) {
      setRestaurando(caminho);
      return;
    }
    try {
      setMensagemBackup("Restaurando…");
      await restaurarBackup(caminho);
      // Tudo na tela veio do banco antigo: recarrega a janela inteira.
      window.location.reload();
    } catch (e) {
      setRestaurando(null);
      setMensagemBackup(`Não consegui restaurar: ${e}`);
    }
  }

  return (
    <div
      className="fixed inset-0 z-10 flex items-start justify-center bg-black/30 p-4 sm:pt-16"
      onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}
    >
      <section className="w-[min(560px,100%)] max-h-full overflow-y-auto rounded-2xl bg-folha p-7 text-tinta shadow-2xl ring-1 ring-linha">
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

        <h3 className="mt-7 text-[15px] font-semibold">Atalho da nova tarefa</h3>
        <p className="mt-1 text-sm text-suave">
          Atual: <strong>{rotuloAtalho(atalho)}</strong>. Clique no campo e aperte a combinação nova.
        </p>
        <CampoAtalho atalho={atalho} aoMudarAtalho={aoMudarAtalho} aoGravar={setGravando} />

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

        <h3 className="mt-7 text-[15px] font-semibold">Atalho da nota</h3>
        <p className="mt-1 text-sm text-suave">
          Atual: <strong>{rotuloAtalho(atalhoNota)}</strong>. Abre uma nota rápida para não esquecer algo, com lembrete
          de tempos em tempos.
        </p>
        <CampoAtalho atalho={atalhoNota} aoMudarAtalho={aoMudarAtalhoNota} aoGravar={setGravando} qual="nota" />

        <h3 className="mt-7 text-[15px] font-semibold">Foco</h3>
        <label className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          Pausar o foco depois de
          <input
            type="number"
            min={0}
            max={240}
            value={inatividade}
            onChange={(e) => setInatividade(e.target.value)}
            onBlur={() => {
              const minutos = Math.max(0, Math.round(Number(inatividade) || 0));
              setInatividade(String(minutos));
              gravarConfig(CHAVE_INATIVIDADE, String(minutos));
            }}
            className="w-16 rounded-lg border border-linha bg-cartao px-2 py-1 text-right text-[15px] outline-none focus:border-destaque"
          />
          minutos sem usar o computador
        </label>
        <p className="mt-1 text-sm text-suave">
          O tempo parado não entra nas horas. Use 0 para desligar. No Linux com Wayland o sistema não informa a
          inatividade.
        </p>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={overlayAoFocar}
            onChange={(e) => {
              setOverlayAoFocar(e.target.checked);
              gravarOverlayAoFocar(e.target.checked);
            }}
            className="mt-0.5 accent-destaque"
          />
          <span>
            Abrir o overlay no canto da tela quando um foco começar
            <span className="block text-suave">Uma faixa discreta com o tempo, pausar e finalizar, sempre por cima.</span>
          </span>
        </label>

        <h3 className="mt-7 text-[15px] font-semibold">Azure DevOps</h3>
        <SecaoDevops aoSincronizar={aoSincronizarDevops} />

        <h3 className="mt-7 text-[15px] font-semibold">Itens recorrentes</h3>
        <SecaoRecorrentes />

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
          <button
            type="button"
            disabled={!backups[0]}
            aria-expanded={verBackups}
            onClick={() => setVerBackups(!verBackups)}
            className="rounded-lg border border-linha px-3.5 py-2 text-sm hover:bg-etiqueta disabled:opacity-40"
          >
            Restaurar…
          </button>
        </div>
        {verBackups && (
          <ul className="mt-2 flex flex-col gap-1">
            {backups.map((caminho) => {
              const nome = caminho.split(/[\\/]/).pop() ?? caminho;
              return (
                <li key={caminho} className="flex items-center gap-2 rounded-lg bg-cartao px-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate tabular-nums">{nome.replace(/^juggl-/, "").replace(/\.db$/, "")}</span>
                  <button
                    type="button"
                    onClick={() => restaurar(caminho)}
                    onBlur={() => setRestaurando((r) => (r === caminho ? null : r))}
                    className={`rounded-md px-2.5 py-0.5 text-[13px] font-semibold ${
                      restaurando === caminho ? "bg-atraso-claro text-atraso" : "text-suave hover:bg-etiqueta hover:text-tinta"
                    }`}
                  >
                    {restaurando === caminho ? "Trocar os dados atuais por este?" : "Restaurar"}
                  </button>
                </li>
              );
            })}
            <li className="px-1 text-xs text-apagado">
              Antes de restaurar, o Juggl guarda o estado atual como um backup "antes de restaurar", para dar para voltar.
            </li>
          </ul>
        )}
        {mensagemBackup && <p className="mt-2 text-sm text-suave">{mensagemBackup}</p>}

        <h3 className="mt-7 text-[15px] font-semibold">Versão</h3>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <span>Juggl {versao}</span>
          <button
            type="button"
            onClick={() =>
              aoProcurarAtualizacao()
                .then(setMensagemVersao)
                .catch((e) => setMensagemVersao(`Não consegui procurar: ${e}`))
            }
            className="rounded-lg border border-linha px-3.5 py-2 text-sm hover:bg-etiqueta"
          >
            Procurar atualização
          </button>
        </div>
        {mensagemVersao && <p className="mt-2 text-sm text-suave">{mensagemVersao}</p>}
        <p className="mt-1 text-sm text-suave">O Juggl procura sozinho ao abrir e a cada 6 horas.</p>

        <h3 className="mt-7 text-[15px] font-semibold">Primeiros passos</h3>
        <p className="mt-1 text-sm text-suave">A apresentação do primeiro uso: atalho, Meu dia, avisos e Azure DevOps.</p>
        <button
          type="button"
          onClick={aoReverBoasVindas}
          className="mt-2 rounded-lg border border-linha px-3.5 py-2 text-sm hover:bg-etiqueta"
        >
          Rever as boas-vindas
        </button>

        <p className="mt-6 border-t border-linha pt-4 text-sm text-suave">
          Fechar a janela deixa o Juggl na bandeja do sistema, com o atalho ativo. Para sair, use Sair no ícone da bandeja.
        </p>
      </section>
    </div>
  );
}
