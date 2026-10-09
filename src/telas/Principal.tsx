import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { descreverPrazo, tempoParado } from "../captura/datas";
import { ATALHO_PADRAO, lerConfig } from "../db/config";
import { listarInbox, type ItemInbox } from "../db/itens";
import { COR_ORIGEM, NOME_ORIGEM, rotuloAtalho } from "./origens";

const MINUTO_MS = 60 * 1000;

export default function Principal() {
  const [itens, setItens] = useState<ItemInbox[] | null>(null);
  const [atalho, setAtalho] = useState(ATALHO_PADRAO);
  const [avisoAtalho, setAvisoAtalho] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => new Date());

  const carregar = useCallback(() => {
    listarInbox()
      .then((lista) => {
        setItens(lista);
        setAgora(new Date());
      })
      .catch((e) => setErro(String(e)));
  }, []);

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

  useEffect(() => {
    carregar();
    const parar = listen("item:criado", carregar);
    const relogio = setInterval(() => setAgora(new Date()), MINUTO_MS);
    return () => {
      parar.then((f) => f());
      clearInterval(relogio);
    };
  }, [carregar]);

  return (
    <main className="min-h-screen bg-neutral-50 p-6 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
      <header className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">
          Caixa de entrada{itens ? ` (${itens.length})` : ""}
        </h1>
        <button
          type="button"
          onClick={() => invoke("abrir_captura")}
          className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          Capturar <span className="opacity-60">({rotuloAtalho(atalho)})</span>
        </button>
      </header>

      {avisoAtalho && (
        <p className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          O atalho global não funcionou: {avisoAtalho}. Use o botão Capturar enquanto isso.
        </p>
      )}
      {erro && <p className="mb-4 text-sm text-red-600">Erro ao ler o banco: {erro}</p>}

      {itens?.length === 0 && (
        <p className="mt-16 text-center text-neutral-500">
          Nada na caixa de entrada. Aperte {rotuloAtalho(atalho)} para capturar.
        </p>
      )}

      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {itens?.map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-2 text-sm">
            <span className={`w-20 shrink-0 rounded px-2 py-0.5 text-center text-xs ${COR_ORIGEM[item.origem]}`}>
              {NOME_ORIGEM[item.origem]}
            </span>
            {item.link ? (
              <button
                type="button"
                onClick={() => openUrl(item.link!)}
                title={item.link}
                className="min-w-0 flex-1 truncate text-left hover:underline"
              >
                {item.titulo}
              </button>
            ) : (
              <span className="min-w-0 flex-1 truncate">{item.titulo}</span>
            )}
            {item.prioridade === "alta" && <span className="text-xs font-medium text-red-600">!alta</span>}
            {item.projeto && <span className="text-xs text-neutral-500">#{item.projeto}</span>}
            {item.pessoa && <span className="text-xs text-neutral-500">@{item.pessoa}</span>}
            {item.prazo && (
              <span className="w-24 shrink-0 text-right text-xs">{descreverPrazo(item.prazo, agora)}</span>
            )}
            <span className="w-14 shrink-0 text-right text-xs text-neutral-400" title="Parado há">
              {tempoParado(item.criado_em, agora)}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
