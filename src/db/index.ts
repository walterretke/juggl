import Database from "@tauri-apps/plugin-sql";

// Mesmo endereço registrado com as migrations em src-tauri/src/lib.rs.
const DB_URL = "sqlite:juggl.db";

let conexao: Promise<Database> | null = null;

/** Abre o banco uma vez (as migrations rodam aqui) e liga o modo WAL. */
export function getDb(): Promise<Database> {
  conexao ??= abrir();
  return conexao;
}

async function abrir(): Promise<Database> {
  const db = await Database.load(DB_URL);
  // WAL não pode ser ligado dentro da transação de uma migration; fica gravado no arquivo.
  await db.select("PRAGMA journal_mode = WAL");
  return db;
}
