import { invoke } from "@tauri-apps/api/core";
import { dataLocalIso } from "../captura/datas";
import { getDb } from ".";

const HORA_MS = 60 * 60 * 1000;

/**
 * Copia o banco para backups/<nome> com VACUUM INTO (cópia consistente mesmo em WAL)
 * e apaga os mais antigos, mantendo 7. Devolve false se o arquivo já existia.
 */
let emAndamento: Promise<unknown> = Promise.resolve();

function gravarBackup(nome: string): Promise<boolean> {
  // Um backup por vez: dois VACUUM INTO no mesmo arquivo fariam o segundo falhar.
  const proximo = emAndamento.then(() => gravarSemFila(nome));
  emAndamento = proximo.catch(() => undefined);
  return proximo;
}

async function gravarSemFila(nome: string): Promise<boolean> {
  const caminho = await invoke<string | null>("caminho_backup", { nome });
  if (!caminho) return false;
  const db = await getDb();
  await db.execute("VACUUM INTO $1", [caminho]);
  await invoke("limpar_backups");
  return true;
}

/** Backup do dia, uma vez por dia. */
export function backupDiario(): Promise<boolean> {
  return gravarBackup(`juggl-${dataLocalIso(new Date())}.db`);
}

/** Backup pedido pelo usuário, com a hora no nome para não colidir com o diário. */
export async function backupAgora(): Promise<void> {
  const agora = new Date();
  const hora = `${String(agora.getHours()).padStart(2, "0")}${String(agora.getMinutes()).padStart(2, "0")}${String(agora.getSeconds()).padStart(2, "0")}`;
  await gravarBackup(`juggl-${dataLocalIso(agora)}-${hora}.db`);
}

/** Backups existentes, do mais novo para o mais antigo (caminhos completos). */
export function listarBackups(): Promise<string[]> {
  return invoke<string[]>("limpar_backups");
}

/** Faz o backup do dia ao abrir e confere de hora em hora (o app fica aberto na bandeja). */
export function agendarBackupDiario(aoFalhar: (erro: string) => void): () => void {
  const tentar = () => backupDiario().catch((e) => aoFalhar(String(e)));
  tentar();
  const id = setInterval(tentar, HORA_MS);
  return () => clearInterval(id);
}
