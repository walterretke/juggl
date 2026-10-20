// Roda as migrations do src-tauri num SQLite de verdade (node:sqlite), na ordem em que o app
// roda, para pegar CHECKs e colunas que o código usa mas o banco recusa. Fica fora de src/
// porque usa módulos do Node, que o tsc do app não conhece.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const RAIZ = join(import.meta.dirname, "..");
const PASTA = join(RAIZ, "src-tauri", "migrations");
const MIGRATIONS = readdirSync(PASTA)
  .filter((f) => f.endsWith(".sql"))
  .sort();

/** Roda as migrations de número `de` até `ate`, como o app faz ao atualizar. */
function migrar(db: DatabaseSync, de: number, ate = Infinity) {
  for (const arquivo of MIGRATIONS.filter((f) => Number(f.slice(0, 4)) >= de && Number(f.slice(0, 4)) <= ate)) {
    db.exec(readFileSync(join(PASTA, arquivo), "utf8"));
  }
}

function novoBanco() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

const AGORA = "2026-10-14T12:00:00.000Z";

function inserirItem(db: DatabaseSync, id: string) {
  db.prepare(
    "INSERT INTO item (id, titulo, status, origem, criado_em, atualizado_em) VALUES (?, 'Relatório', 'em_foco', 'manual', ?, ?)",
  ).run(id, AGORA, AGORA);
}

function inserirEvento(db: DatabaseSync, id: string, itemId: string, tipo: string) {
  db.prepare("INSERT INTO evento (id, item_id, tipo, timestamp, dados) VALUES (?, ?, ?, ?, '{}')").run(id, itemId, tipo, AGORA);
}

/** Tipos de evento que o código grava (registrarEvento(..., "tipo", ...)). */
function tiposUsadosNoCodigo(): string[] {
  const tipos = new Set<string>();
  const arquivos = readdirSync(join(RAIZ, "src"), { recursive: true, encoding: "utf8" }).filter(
    (f) => /\.tsx?$/.test(f) && !f.includes(".test."),
  );
  for (const arquivo of arquivos) {
    const codigo = readFileSync(join(RAIZ, "src", arquivo), "utf8");
    for (const [, tipo] of codigo.matchAll(/registrarEvento\([^,]+,\s*"(\w+)"/g)) tipos.add(tipo);
  }
  return [...tipos];
}

describe("migrations", () => {
  it("o app registra todas as migrations da pasta", () => {
    const lib = readFileSync(join(RAIZ, "src-tauri", "src", "lib.rs"), "utf8");
    for (const arquivo of MIGRATIONS) expect(lib).toContain(`../migrations/${arquivo}`);
  });

  it("um banco já em uso ganha foco_cancelado sem perder os eventos", () => {
    const db = novoBanco();
    migrar(db, 1, 9);
    inserirItem(db, "item-1");
    inserirEvento(db, "ev-1", "item-1", "foco_inicio");
    inserirEvento(db, "ev-2", "item-1", "foco_fim");
    // O erro que apareceu na 0.1.3: o schema antigo recusa o tipo novo.
    expect(() => inserirEvento(db, "ev-3", "item-1", "foco_cancelado")).toThrow(/CHECK constraint failed/);

    migrar(db, 10);
    const antigos = db.prepare("SELECT id, tipo FROM evento ORDER BY id").all();
    expect(antigos).toEqual([
      { id: "ev-1", tipo: "foco_inicio" },
      { id: "ev-2", tipo: "foco_fim" },
    ]);
    inserirEvento(db, "ev-3", "item-1", "foco_cancelado");
    expect(() => inserirEvento(db, "ev-4", "item-1", "inventado")).toThrow(/CHECK constraint failed/);

    // Continua indexado e apagando junto com o item.
    const indice = db.prepare("SELECT tbl_name FROM sqlite_master WHERE type = 'index' AND name = 'evento_item'").get();
    expect(indice).toEqual({ tbl_name: "evento" });
    db.prepare("DELETE FROM item WHERE id = 'item-1'").run();
    expect(db.prepare("SELECT COUNT(*) AS n FROM evento").get()).toEqual({ n: 0 });
  });

  it("um banco já em uso ganha os tipos de espera sem perder os itens", () => {
    const db = novoBanco();
    migrar(db, 1, 10);
    inserirItem(db, "item-1");
    db.prepare("UPDATE item SET status = 'aguardando', aguardando_quem = 'Carla' WHERE id = 'item-1'").run();

    migrar(db, 11);
    expect(db.prepare("SELECT id, status, aguardando_quem, espera_tipo_id FROM item").all()).toEqual([
      { id: "item-1", status: "aguardando", aguardando_quem: "Carla", espera_tipo_id: null },
    ]);
    const tipos = db.prepare("SELECT id, nome FROM tipo_espera ORDER BY ordem").all();
    expect(tipos.map((t) => t.nome)).toEqual([
      "Aguardando aprovação",
      "Aguardando desenvolvimento",
      "Aguardando resposta",
      "Aguardando terceiros",
      "Bloqueado",
    ]);

    // O motivo grava e, se o tipo for removido, o item continua em espera sem motivo.
    db.prepare("UPDATE item SET espera_tipo_id = 'aprovacao' WHERE id = 'item-1'").run();
    expect(() => db.prepare("UPDATE item SET espera_tipo_id = 'inventado' WHERE id = 'item-1'").run()).toThrow(/FOREIGN KEY/);
    db.prepare("DELETE FROM tipo_espera WHERE id = 'aprovacao'").run();
    expect(db.prepare("SELECT status, espera_tipo_id FROM item").get()).toEqual({ status: "aguardando", espera_tipo_id: null });
    expect(() => db.prepare("INSERT INTO tipo_espera (id, nome, ordem) VALUES ('x', 'bloqueado', 9)").run()).toThrow(/UNIQUE/);
  });

  it("o SELECT de itens do app roda no schema final", () => {
    const db = novoBanco();
    migrar(db, 1);
    inserirItem(db, "item-1");
    const codigo = readFileSync(join(RAIZ, "src", "db", "itens.ts"), "utf8");
    const select = codigo.match(/export const SELECT_ITEM = `([\s\S]*?)`;/)?.[1];
    expect(select).toBeTruthy();
    expect(db.prepare(`${select} WHERE item.id = 'item-1'`).get()).toMatchObject({ id: "item-1", espera: null, espera_cor: null });
  });

  it("o banco aceita todo tipo de evento que o código grava", () => {
    const db = novoBanco();
    migrar(db, 1);
    inserirItem(db, "item-1");
    const tipos = tiposUsadosNoCodigo();
    expect(tipos).toContain("foco_cancelado");
    tipos.forEach((tipo, i) => expect(() => inserirEvento(db, `ev-${i}`, "item-1", tipo), tipo).not.toThrow());
  });
});
