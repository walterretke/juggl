import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { dataLocalIso } from "../captura/datas";
import { getDb } from ".";

const HORA_MS = 60 * 60 * 1000;

/**
 * Copia o banco para backups/<nome> com VACUUM INTO (cópia consistente mesmo em WAL)
 * e apaga os mais antigos, mantendo 7. Devolve false se o arquivo já existia.
 */
let emAndamento: Promise<unknown> = Promise.resolve();

function gravarBackup(nome: string, limpar = true): Promise<boolean> {
  // Um backup por vez: dois VACUUM INTO no mesmo arquivo fariam o segundo falhar.
  const proximo = emAndamento.then(() => gravarSemFila(nome, limpar));
  emAndamento = proximo.catch(() => undefined);
  return proximo;
}

async function gravarSemFila(nome: string, limpar = true): Promise<boolean> {
  const caminho = await invoke<string | null>("caminho_backup", { nome });
  if (!caminho) return false;
  const db = await getDb();
  await db.execute("VACUUM INTO $1", [caminho]);
  if (limpar) await invoke("limpar_backups");
  return true;
}

function horaCompacta(d: Date): string {
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join("");
}

/** Backup do dia, uma vez por dia. */
export function backupDiario(): Promise<boolean> {
  return gravarBackup(`juggl-${dataLocalIso(new Date())}.db`);
}

/** Backup pedido pelo usuário, com a hora no nome para não colidir com o diário. */
export async function backupAgora(): Promise<void> {
  const agora = new Date();
  await gravarBackup(`juggl-${dataLocalIso(agora)}-${horaCompacta(agora)}.db`);
}

/** Backups existentes, do mais novo para o mais antigo (caminhos completos). */
export async function listarBackups(): Promise<string[]> {
  const caminhos = await invoke<string[]>("limpar_backups");
  // "juggl-2026-10-11.db" (o diário, feito ao abrir) é mais antigo que "juggl-2026-10-11-1430.db".
  const chave = (c: string) => (c.split(/[\\/]/).pop() ?? c).replace(/^juggl-(\d{4}-\d{2}-\d{2})\.db$/, "juggl-$1-000000.db");
  return caminhos.sort((a, b) => chave(b).localeCompare(chave(a)));
}

/** Faz o backup do dia ao abrir e confere de hora em hora (o app fica aberto na bandeja). */
export function agendarBackupDiario(aoFalhar: (erro: string) => void): () => void {
  const tentar = () => backupDiario().catch((e) => aoFalhar(String(e)));
  tentar();
  const id = setInterval(tentar, HORA_MS);
  return () => clearInterval(id);
}

/** Colunas de cada tabela de dados (sem as internas do SQLite e das migrations). */
async function colunasPorTabela(db: Database): Promise<Map<string, string[]>> {
  const tabelas = await db.select<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_sqlx%'",
  );
  const mapa = new Map<string, string[]>();
  for (const { name } of tabelas) {
    const colunas = await db.select<{ name: string }[]>("SELECT name FROM pragma_table_info($1)", [name]);
    mapa.set(name, colunas.map((c) => c.name));
  }
  return mapa;
}

const aspas = (nome: string) => `"${nome.replace(/"/g, '""')}"`;

/**
 * Volta o banco para um backup. Antes, grava o estado atual como backup ("antes de
 * restaurar"), para dar para voltar atrás. A troca é uma transação só: os dados do
 * backup entram nas tabelas atuais, coluna a coluna, então um backup de uma versão
 * anterior do Juggl também serve (o que é novo fica vazio). Depois, recarregue a tela.
 */
export async function restaurarBackup(caminho: string): Promise<void> {
  const copia = await Database.load(`sqlite:${caminho}`);
  let doBackup: Map<string, string[]>;
  try {
    doBackup = await colunasPorTabela(copia);
  } finally {
    // Com o nome: close() sem argumento fecha todos os bancos, inclusive o principal.
    await copia.close(copia.path).catch(() => {});
  }
  if (!doBackup.has("item")) throw new Error("Esse arquivo não é um backup do Juggl.");

  const agora = new Date();
  // Sem limpar os antigos: o backup escolhido pode ser o mais antigo dos 7.
  await gravarBackup(`juggl-${dataLocalIso(agora)}-${horaCompacta(agora)}-antes-de-restaurar.db`, false);

  const db = await getDb();
  const atuais = await colunasPorTabela(db);
  // Um comando só, com várias instruções: o pool de conexões garante que ATTACH,
  // transação e DETACH rodam na mesma conexão.
  const comandos = [`ATTACH DATABASE '${caminho.replace(/'/g, "''")}' AS copia`, "BEGIN", "PRAGMA defer_foreign_keys = ON"];
  for (const [tabela, colunas] of atuais) {
    comandos.push(`DELETE FROM main.${aspas(tabela)}`);
    const comuns = colunas.filter((c) => doBackup.get(tabela)?.includes(c)).map(aspas);
    if (comuns.length > 0) {
      comandos.push(`INSERT INTO main.${aspas(tabela)} (${comuns.join(", ")}) SELECT ${comuns.join(", ")} FROM copia.${aspas(tabela)}`);
    }
  }
  comandos.push("COMMIT", "DETACH DATABASE copia");
  try {
    await db.execute(comandos.join(";\n"));
  } catch (e) {
    // Falhou no meio: desfaz a transação e solta a cópia (melhor esforço; o banco atual fica como estava).
    await db.execute("ROLLBACK").catch(() => {});
    await db.execute("DETACH DATABASE copia").catch(() => {});
    throw e;
  }
}
