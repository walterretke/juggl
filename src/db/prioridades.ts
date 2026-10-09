import { getDb } from ".";
import { novoId } from "./ids";

export type CorPrioridade = "vermelho" | "ambar" | "azul" | "verde" | "roxo" | "cinza";

export const CORES_PRIORIDADE: CorPrioridade[] = ["vermelho", "ambar", "azul", "verde", "roxo", "cinza"];

export interface Prioridade {
  id: string;
  nome: string;
  ordem: number;
  cor: CorPrioridade;
}

/** Da mais urgente para a menos urgente. */
export async function listarPrioridades(): Promise<Prioridade[]> {
  const db = await getDb();
  return db.select<Prioridade[]>("SELECT id, nome, ordem, cor FROM prioridade ORDER BY ordem, nome");
}

export async function criarPrioridade(nome: string, cor: CorPrioridade = "cinza"): Promise<string> {
  const db = await getDb();
  const id = novoId();
  await db.execute(
    "INSERT INTO prioridade (id, nome, ordem, cor) VALUES ($1, $2, (SELECT COALESCE(MAX(ordem), 0) + 1 FROM prioridade), $3)",
    [id, nome.trim(), cor],
  );
  return id;
}

export async function alterarPrioridade(id: string, campos: Partial<Pick<Prioridade, "nome" | "cor">>): Promise<void> {
  const db = await getDb();
  if (campos.nome !== undefined) await db.execute("UPDATE prioridade SET nome = $1 WHERE id = $2", [campos.nome.trim(), id]);
  if (campos.cor !== undefined) await db.execute("UPDATE prioridade SET cor = $1 WHERE id = $2", [campos.cor, id]);
}

/** Grava a nova ordem: a primeira da lista vira a mais urgente. */
export async function reordenarPrioridades(ids: string[]): Promise<void> {
  const db = await getDb();
  for (const [i, id] of ids.entries()) await db.execute("UPDATE prioridade SET ordem = $1 WHERE id = $2", [i + 1, id]);
}

/** Remove a prioridade; os itens que a usavam ficam sem prioridade. */
export async function removerPrioridade(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE item SET prioridade_id = NULL WHERE prioridade_id = $1", [id]);
  await db.execute("DELETE FROM prioridade WHERE id = $1", [id]);
}
