import { getDb } from ".";
import { agoraIso, novoId } from "./ids";

/** Um passo do checklist de uma tarefa. */
export interface Subtarefa {
  id: string;
  item_id: string;
  texto: string;
  feita: number;
  ordem: number;
}

export async function listarSubtarefas(itemId: string): Promise<Subtarefa[]> {
  const db = await getDb();
  return db.select<Subtarefa[]>("SELECT id, item_id, texto, feita, ordem FROM subtarefa WHERE item_id = $1 ORDER BY ordem, criado_em", [
    itemId,
  ]);
}

export async function criarSubtarefa(itemId: string, texto: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO subtarefa (id, item_id, texto, feita, ordem, criado_em)
     VALUES ($1, $2, $3, 0, COALESCE((SELECT MAX(ordem) + 1 FROM subtarefa WHERE item_id = $2), 0), $4)`,
    [novoId(), itemId, texto.trim(), agoraIso()],
  );
}

export async function marcarSubtarefa(id: string, feita: boolean): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE subtarefa SET feita = $1 WHERE id = $2", [feita ? 1 : 0, id]);
}

export async function renomearSubtarefa(id: string, texto: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE subtarefa SET texto = $1 WHERE id = $2", [texto.trim(), id]);
}

export async function apagarSubtarefa(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM subtarefa WHERE id = $1", [id]);
}

/** Grava a nova ordem (a lista de ids na ordem em que ficaram). */
export async function reordenarSubtarefas(ids: string[]): Promise<void> {
  const db = await getDb();
  for (const [i, id] of ids.entries()) await db.execute("UPDATE subtarefa SET ordem = $1 WHERE id = $2", [i, id]);
}
