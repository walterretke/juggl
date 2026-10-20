import { getDb } from ".";
import { novoId } from "./ids";
import type { CorPrioridade } from "./prioridades";

/** Motivo de um item estar Em espera ("Aguardando aprovação", "Bloqueado"...). */
export interface TipoEspera {
  id: string;
  nome: string;
  ordem: number;
  cor: CorPrioridade;
}

/** Na ordem das Configurações, que é a ordem do dropdown. */
export async function listarTiposEspera(): Promise<TipoEspera[]> {
  const db = await getDb();
  return db.select<TipoEspera[]>("SELECT id, nome, ordem, cor FROM tipo_espera ORDER BY ordem, nome");
}

export async function criarTipoEspera(nome: string, cor: CorPrioridade = "cinza"): Promise<string> {
  const db = await getDb();
  const id = novoId();
  await db.execute(
    "INSERT INTO tipo_espera (id, nome, ordem, cor) VALUES ($1, $2, (SELECT COALESCE(MAX(ordem), 0) + 1 FROM tipo_espera), $3)",
    [id, nome.trim(), cor],
  );
  return id;
}

export async function alterarTipoEspera(id: string, campos: Partial<Pick<TipoEspera, "nome" | "cor">>): Promise<void> {
  const db = await getDb();
  if (campos.nome !== undefined) await db.execute("UPDATE tipo_espera SET nome = $1 WHERE id = $2", [campos.nome.trim(), id]);
  if (campos.cor !== undefined) await db.execute("UPDATE tipo_espera SET cor = $1 WHERE id = $2", [campos.cor, id]);
}

export async function reordenarTiposEspera(ids: string[]): Promise<void> {
  const db = await getDb();
  for (const [i, id] of ids.entries()) await db.execute("UPDATE tipo_espera SET ordem = $1 WHERE id = $2", [i + 1, id]);
}

/** Remove o tipo; os itens em espera por ele continuam em espera, sem motivo. */
export async function removerTipoEspera(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE item SET espera_tipo_id = NULL WHERE espera_tipo_id = $1", [id]);
  await db.execute("DELETE FROM tipo_espera WHERE id = $1", [id]);
}
