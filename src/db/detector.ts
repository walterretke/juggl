import {
  chavePar,
  detectarPrioridadeErrada,
  HISTORICO_VAZIO,
  pontosDasPrioridades,
  pontuar,
  UMA_HORA_MS,
  type Alerta,
  type Historico,
  type Urgencia,
} from "../regras/urgencia";
import { gravarConfig, lerConfig } from "./config";
import { itemEmFoco } from "./foco";
import { registrarEvento } from "./itens";
import { listarPrioridades } from "./prioridades";
import { itensAbertos } from "./regras";

export const CHAVE_DETECTOR = "alerta_prioridade";
const CHAVE_HISTORICO = "alerta_prioridade_historico";
const ADIAR_MS = 30 * 60 * 1000;

export async function detectorLigado(): Promise<boolean> {
  return (await lerConfig(CHAVE_DETECTOR)) !== "nao";
}

async function lerHistorico(): Promise<Historico> {
  try {
    const salvo = await lerConfig(CHAVE_HISTORICO);
    return salvo ? { ...HISTORICO_VAZIO, ...JSON.parse(salvo) } : HISTORICO_VAZIO;
  } catch {
    return HISTORICO_VAZIO;
  }
}

/** Grava o histórico, esquecendo avisos com mais de uma hora (não bloqueiam mais nada). */
async function gravarHistorico(h: Historico, agora: Date): Promise<void> {
  const avisados = Object.fromEntries(
    Object.entries(h.avisados).filter(([, quando]) => agora.getTime() - new Date(quando).getTime() < UMA_HORA_MS),
  );
  await gravarConfig(CHAVE_HISTORICO, JSON.stringify({ ...h, avisados }));
}

async function ordemDasPrioridades(): Promise<Map<string, number>> {
  return pontosDasPrioridades((await listarPrioridades()).map((p) => p.id));
}

/** Pontuação de todos os itens abertos agora (para comparar durante o foco). */
export async function pontuacoesAgora(agora = new Date()): Promise<Map<string, Urgencia>> {
  const [itens, ordem] = await Promise.all([itensAbertos(), ordemDasPrioridades()]);
  return new Map(itens.map((i) => [i.id, pontuar(i, agora, ordem)]));
}

/** Detalhe da pontuação de um item, para mostrar no alerta. */
export interface AlertaComFoco extends Alerta {
  focoTitulo: string;
  partesFoco: Urgencia["partes"];
  partesOutro: Urgencia["partes"];
}

/**
 * Roda o detector de prioridade errada para o item em foco. Registra o aviso
 * no histórico (uma vez por hora por par) e devolve o alerta, se houver.
 */
export async function verificarPrioridade(inicio: Map<string, Urgencia> | null, agora = new Date()): Promise<AlertaComFoco | null> {
  if (!(await detectorLigado())) return null;
  const foco = await itemEmFoco();
  if (!foco) return null;
  const [itens, ordem, historico] = await Promise.all([itensAbertos(), ordemDasPrioridades(), lerHistorico()]);
  const alerta = detectarPrioridadeErrada(foco.item, itens, agora, ordem, historico, inicio);
  if (!alerta) return null;
  historico.avisados[chavePar(alerta.focoId, alerta.outro.id)] = agora.toISOString();
  await gravarHistorico(historico, agora);
  return {
    ...alerta,
    focoTitulo: foco.item.titulo,
    partesFoco: pontuar(foco.item, agora, ordem).partes,
    partesOutro: pontuar(alerta.outro, agora, ordem).partes,
  };
}

/**
 * "Continuar": registra que você discordou. Com este item em foco, nenhum outro avisa de novo
 * a menos que suba de pontuação (nova cobrança, prazo mais perto).
 */
export async function continuarApesarDoAlerta(alerta: Alerta, agora = new Date()): Promise<void> {
  await registrarEvento(alerta.outro.id, "alerta_ignorado", {
    foco_id: alerta.focoId,
    pontos_foco: alerta.pontosFoco,
    pontos_outro: alerta.pontosOutro,
  });
  const [historico, pontos] = await Promise.all([lerHistorico(), pontuacoesAgora(agora)]);
  // Só guarda pares deste foco: os de focos antigos não servem mais.
  const ignorados = Object.fromEntries(Object.entries(historico.ignorados).filter(([par]) => par.startsWith(`${alerta.focoId}:`)));
  for (const [id, u] of pontos) if (id !== alerta.focoId) ignorados[chavePar(alerta.focoId, id)] = u.total;
  await gravarHistorico({ ...historico, ignorados }, agora);
}

/** "Adiar 30 min": nenhum alerta de prioridade até lá. */
export async function adiarAlertas(agora = new Date()): Promise<void> {
  const historico = await lerHistorico();
  historico.adiadoAte = new Date(agora.getTime() + ADIAR_MS).toISOString();
  await gravarHistorico(historico, agora);
}
