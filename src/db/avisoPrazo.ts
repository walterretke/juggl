import { gravarConfig, lerConfig } from "./config";
import { listarPrioridades } from "./prioridades";
import { listarRegras } from "./regras";
import { avisosDasPrioridades, lerAvisosGravados, type AvisoPrazo, type AvisosPorPrioridade } from "../regras/avisoPrazo";

/** Config com o aviso de prazo de cada prioridade, em JSON por id de prioridade. */
const CHAVE_AVISO_PRAZO = "aviso_prazo_prioridade";

/** Antecedência da regra Prazo chegando, que vale para quem não tem prioridade. */
export async function horasDaRegraPrazo(): Promise<number> {
  const regra = (await listarRegras()).find((r) => r.id === "prazo_chegando");
  return regra?.condicao.horas ?? 4;
}

/** O aviso de cada prioridade, com os padrões onde nada foi mudado. */
export async function lerAvisosPrazo(horasDaRegra?: number): Promise<AvisosPorPrioridade> {
  const [prioridades, texto, horas] = await Promise.all([
    listarPrioridades(),
    lerConfig(CHAVE_AVISO_PRAZO),
    horasDaRegra ?? horasDaRegraPrazo(),
  ]);
  return avisosDasPrioridades(prioridades, lerAvisosGravados(texto), horas);
}

/** Grava o aviso de uma prioridade, mantendo o das outras. */
export async function gravarAvisoPrazo(prioridadeId: string, aviso: AvisoPrazo): Promise<void> {
  const gravado = lerAvisosGravados(await lerConfig(CHAVE_AVISO_PRAZO));
  const todos = gravado && typeof gravado === "object" ? (gravado as Record<string, AvisoPrazo>) : {};
  await gravarConfig(CHAVE_AVISO_PRAZO, JSON.stringify({ ...todos, [prioridadeId]: aviso }));
}
