import { getDb } from ".";

export const ATALHO_PADRAO = "Ctrl+Shift+Space";

export async function lerConfig(chave: string): Promise<string | null> {
  const db = await getDb();
  const [linha] = await db.select<{ valor: string }[]>("SELECT valor FROM config WHERE chave = $1", [chave]);
  return linha?.valor ?? null;
}
