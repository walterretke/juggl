import { getDb } from ".";
import { dataLocalIso } from "../captura/datas";
import { deveMostrarBoasVindas } from "../inicio/boasVindas";
import { gravarConfig, lerConfig } from "./config";

const CHAVE = "boas_vindas_vistas";

/**
 * Decide se abre as boas-vindas. Quem já usava o app fica marcado como visto na hora,
 * para não ver a tela num dia em que o banco esteja vazio por acaso.
 */
export async function abrirBoasVindas(agora = new Date()): Promise<boolean> {
  const vistas = (await lerConfig(CHAVE)) !== null;
  if (vistas) return false;
  const db = await getDb();
  const [{ itens }] = await db.select<{ itens: number }[]>("SELECT COUNT(*) AS itens FROM item");
  const [{ dias }] = await db.select<{ dias: number }[]>("SELECT COUNT(*) AS dias FROM dia_de_uso WHERE dia < $1", [
    dataLocalIso(agora),
  ]);
  const mostrar = deveMostrarBoasVindas({ vistas, itens, diasAntesDeHoje: dias });
  if (!mostrar) await marcarBoasVindasVistas();
  return mostrar;
}

export async function marcarBoasVindasVistas(): Promise<void> {
  await gravarConfig(CHAVE, new Date().toISOString());
}
