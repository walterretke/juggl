import { getDb } from ".";

export const ATALHO_PADRAO = "Ctrl+Shift+Space";

export async function lerConfig(chave: string): Promise<string | null> {
  const db = await getDb();
  const [linha] = await db.select<{ valor: string }[]>("SELECT valor FROM config WHERE chave = $1", [chave]);
  return linha?.valor ?? null;
}

export async function gravarConfig(chave: string, valor: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO config (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor",
    [chave, valor],
  );
}
