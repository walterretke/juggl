import { getDb } from ".";
import { gravarConfig, lerConfig } from "./config";
import { agoraIso } from "./ids";
import { gravarCampos, registrarEvento, SELECT_ITEM, type Item } from "./itens";

/** O item em foco e quando a sessão atual começou. */
export interface Foco {
  item: Item;
  inicio: string;
}

/** Por que uma sessão de foco terminou; fica gravado no evento foco_fim. */
export type MotivoFim = "pausa" | "troca" | "concluido" | "app_fechado" | "repouso";

/** Chave da config com o último sinal de vida do timer, para fechar sessões abertas. */
const CHAVE_PULSO = "pulso_foco";

/** Sem pulso por mais que isso, o computador dormiu ou o app foi fechado. */
export const LIMITE_PULSO_MS = 5 * 60 * 1000;

export async function itemEmFoco(): Promise<Foco | null> {
  const db = await getDb();
  const [item] = await db.select<Item[]>(`${SELECT_ITEM} WHERE item.status = 'em_foco' LIMIT 1`);
  if (!item) return null;
  const [inicio] = await db.select<{ timestamp: string }[]>(
    "SELECT timestamp FROM evento WHERE item_id = $1 AND tipo = 'foco_inicio' ORDER BY timestamp DESC LIMIT 1",
    [item.id],
  );
  return { item, inicio: inicio?.timestamp ?? item.atualizado_em };
}

/**
 * Encerra a sessão do item em foco: grava foco_fim com a duração e a nota de onde parou,
 * e muda o status (pausado, ou feito ao concluir). `quando` permite fechar no passado,
 * no último pulso, quando o app foi fechado ou o computador dormiu.
 */
export async function encerrarFoco(
  foco: Foco,
  motivo: MotivoFim,
  nota: string | null = null,
  quando = agoraIso(),
): Promise<void> {
  const duracao = Math.max(0, new Date(quando).getTime() - new Date(foco.inicio).getTime());
  await registrarEvento(
    foco.item.id,
    "foco_fim",
    { inicio: foco.inicio, duracao_ms: duracao, nota: nota?.trim() || null, motivo },
    quando,
  );
  const concluido = motivo === "concluido";
  await gravarCampos(foco.item.id, { status: concluido ? "feito" : "pausado" });
  if (concluido) await registrarEvento(foco.item.id, "concluido", { de: "em_foco" }, quando);
}

/** Põe o item em foco. Quem estava em foco antes precisa ser encerrado antes (ver `trocarFoco`). */
async function iniciarFoco(itemId: string, de: string): Promise<void> {
  await gravarCampos(itemId, { status: "em_foco" });
  await registrarEvento(itemId, "foco_inicio", { de });
  await gravarConfig(CHAVE_PULSO, agoraIso());
}

/** Troca o foco para `item`, pausando o atual com a nota de onde parou. */
export async function trocarFoco(item: Item, atual: Foco | null, notaDoAtual: string | null): Promise<void> {
  if (atual?.item.id === item.id) return;
  if (atual) await encerrarFoco(atual, "troca", notaDoAtual);
  await iniciarFoco(item.id, item.status);
}

/** Sinal de vida do timer, gravado a cada minuto enquanto há algo em foco. */
export function registrarPulso(quando = agoraIso()): Promise<void> {
  return gravarConfig(CHAVE_PULSO, quando);
}

/**
 * Ao abrir o app: se ficou uma sessão aberta e o último pulso é antigo, o app foi
 * fechado (ou o computador desligado) no meio do foco. Encerra no último pulso,
 * para não contar horas que ninguém trabalhou.
 */
export async function recuperarFocoAberto(agora = new Date()): Promise<void> {
  const foco = await itemEmFoco();
  if (!foco) return;
  const pulso = (await lerConfig(CHAVE_PULSO)) ?? foco.inicio;
  if (agora.getTime() - new Date(pulso).getTime() <= LIMITE_PULSO_MS) return;
  const fim = pulso > foco.inicio ? pulso : foco.inicio;
  await encerrarFoco(foco, "app_fechado", null, fim);
}
