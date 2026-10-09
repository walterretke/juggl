import { getDb } from ".";
import { dataLocalIso } from "../captura/datas";
import { gravarConfig, lerConfig } from "./config";
import { SELECT_ITEM, type Item } from "./itens";

/** Quantas prioridades o ritual escolhe por dia. */
export const MAX_DO_DIA = 3;
/** Hora a partir da qual o app lembra do ritual que não foi feito. */
export const HORA_LEMBRETE_RITUAL = 10;

/** Último dia (AAAA-MM-DD) em que o ritual foi feito. */
const CHAVE_FEITO = "ritual_feito";
/** Último dia em que o ritual abriu sozinho, para não abrir de novo no mesmo dia. */
const CHAVE_ABERTO = "ritual_aberto";
/** Último dia em que o app lembrou do ritual pendente (lembra uma vez só). */
const CHAVE_LEMBRADO = "ritual_lembrado";

/** Tudo que pode entrar no dia: A fazer, pausados e a caixa de entrada. */
export async function candidatosDoRitual(): Promise<Item[]> {
  const db = await getDb();
  return db.select<Item[]>(
    `${SELECT_ITEM} WHERE item.status IN ('inbox', 'a_fazer', 'pausado', 'em_foco')
      ORDER BY item.prazo IS NULL, item.prazo, prioridade.ordem IS NULL, prioridade.ordem, item.criado_em`,
  );
}

/**
 * Grava as escolhas do dia: marca `dia_planejado` nos escolhidos, tira dos que tinham sido
 * escolhidos hoje e saíram, e leva para A fazer o que ainda estava na caixa de entrada.
 */
export async function salvarRitual(escolhidos: string[], hoje = new Date()): Promise<void> {
  const db = await getDb();
  const dia = dataLocalIso(hoje);
  // Escolher no ritual não conta como mexer no item: `atualizado_em` (o "parado há") fica igual.
  await db.execute(
    "UPDATE item SET dia_planejado = NULL WHERE dia_planejado = $1 AND id NOT IN (SELECT value FROM json_each($2))",
    [dia, JSON.stringify(escolhidos)],
  );
  for (const id of escolhidos) {
    await db.execute(
      `UPDATE item SET dia_planejado = $1,
              status = CASE WHEN status = 'inbox' THEN 'a_fazer' ELSE status END
        WHERE id = $2`,
      [dia, id],
    );
  }
  await gravarConfig(CHAVE_FEITO, dia);
}

export async function ritualFeitoHoje(hoje = new Date()): Promise<boolean> {
  return (await lerConfig(CHAVE_FEITO)) === dataLocalIso(hoje);
}

/** Primeira abertura do dia sem ritual: abre o ritual (uma vez por dia). */
export async function deveAbrirRitual(hoje = new Date()): Promise<boolean> {
  const dia = dataLocalIso(hoje);
  if ((await lerConfig(CHAVE_FEITO)) === dia || (await lerConfig(CHAVE_ABERTO)) === dia) return false;
  await gravarConfig(CHAVE_ABERTO, dia);
  return true;
}

/**
 * Passou da hora da regra "Ritual pendente" (10h por padrão) e o ritual não foi feito:
 * mostra o aviso no topo uma vez só no dia. Desligar a regra desliga o aviso.
 */
export async function deveLembrarRitual(agora = new Date()): Promise<boolean> {
  const db = await getDb();
  const [regra] = await db.select<{ ativa: number; condicao: string }[]>(
    "SELECT ativa, condicao FROM regra WHERE id = 'ritual_pendente'",
  );
  if (regra && regra.ativa !== 1) return false;
  const [h, m] = ((JSON.parse(regra?.condicao ?? "{}").hora as string | undefined) ?? `${HORA_LEMBRETE_RITUAL}:00`)
    .split(":")
    .map(Number);
  if (agora.getHours() * 60 + agora.getMinutes() < h * 60 + (m || 0)) return false;
  const dia = dataLocalIso(agora);
  if ((await lerConfig(CHAVE_FEITO)) === dia || (await lerConfig(CHAVE_LEMBRADO)) === dia) return false;
  await gravarConfig(CHAVE_LEMBRADO, dia);
  return true;
}
