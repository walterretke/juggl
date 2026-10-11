import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

/** De quanto em quanto tempo o app procura versão nova enquanto está aberto. */
export const INTERVALO_ATUALIZACAO_MS = 6 * 60 * 60 * 1000;

/**
 * Procura versão nova no GitHub (latest.json da última versão publicada).
 * Em desenvolvimento (`npm run tauri dev`) não procura: quem roda do código atualiza com git pull.
 */
export async function procurarAtualizacao(): Promise<Update | null> {
  if (import.meta.env.DEV) return null;
  return check();
}

/** Baixa, instala e reinicia. No Windows o instalador fecha o app sozinho. */
export async function instalarAtualizacao(atualizacao: Update): Promise<void> {
  await atualizacao.downloadAndInstall();
  await relaunch();
}
