import { itemEmFoco } from "../db/foco";
import { notasVencidas, registrarAviso } from "../db/notas";
import { naoPerturbeLigado } from "../db/regras";
import { notificar } from "../regras/notificar";
import { textoDoAviso } from "./lembrete";

/**
 * Avisa das notas cujo intervalo venceu, numa notificação só, e marca o próximo aviso.
 * Durante o foco com o não perturbe ligado, espera: o aviso sai no primeiro minuto depois do foco.
 * Devolve quantas notas avisou.
 */
export async function avisarNotas(agora = new Date()): Promise<number> {
  const vencidas = await notasVencidas(agora);
  if (vencidas.length === 0) return 0;
  if ((await itemEmFoco()) && (await naoPerturbeLigado())) return 0;
  const aviso = textoDoAviso(vencidas);
  if (aviso) await notificar(aviso.titulo, aviso.corpo);
  for (const nota of vencidas) await registrarAviso(nota, agora);
  return vencidas.length;
}
