import { getDb } from ".";
import type { AnexoPreparado, Compressao } from "../anexos/compressao";
import { agoraIso, novoId } from "./ids";

/** Um anexo sem o conteúdo (para listar sem carregar megabytes). */
export interface Anexo {
  id: string;
  item_id: string;
  nome: string;
  tipo: string;
  tamanho_original: number;
  tamanho: number;
  compressao: Compressao;
  criado_em: string;
}

export async function listarAnexos(itemId: string): Promise<Anexo[]> {
  const db = await getDb();
  return db.select<Anexo[]>(
    `SELECT id, item_id, nome, tipo, tamanho_original, tamanho, compressao, criado_em
     FROM anexo WHERE item_id = $1 ORDER BY criado_em, nome`,
    [itemId],
  );
}

/** O conteúdo de um anexo, em base64 (como está no banco). */
export async function lerDadosAnexo(id: string): Promise<{ compressao: Compressao; dados: string } | null> {
  const db = await getDb();
  const [linha] = await db.select<{ compressao: Compressao; dados: string }[]>("SELECT compressao, dados FROM anexo WHERE id = $1", [id]);
  return linha ?? null;
}

export async function criarAnexo(itemId: string, anexo: AnexoPreparado): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO anexo (id, item_id, nome, tipo, tamanho_original, tamanho, compressao, dados, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [novoId(), itemId, anexo.nome, anexo.tipo, anexo.tamanho_original, anexo.tamanho, anexo.compressao, anexo.dados, agoraIso()],
  );
}

export async function apagarAnexo(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM anexo WHERE id = $1", [id]);
}
