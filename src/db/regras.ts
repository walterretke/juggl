import { getDb } from ".";
import { dataLocalIso } from "../captura/datas";
import type { Acao, Disparo, Regra } from "../regras/motor";
import { lerConfig } from "./config";
import { agoraIso, novoId } from "./ids";
import { SELECT_ITEM, type Item } from "./itens";

interface LinhaRegra {
  id: string;
  nome: string;
  tipo: Regra["tipo"];
  condicao: string;
  acao: string;
  ativa: number;
  urgente: number;
  ordem: number;
}

function deLinha(l: LinhaRegra): Regra {
  return {
    ...l,
    condicao: JSON.parse(l.condicao || "{}"),
    acao: JSON.parse(l.acao || '{"tipo":"notificar"}') as Acao,
    ativa: l.ativa === 1,
    urgente: l.urgente === 1,
  };
}

export async function listarRegras(): Promise<Regra[]> {
  const db = await getDb();
  const linhas = await db.select<LinhaRegra[]>("SELECT * FROM regra ORDER BY tipo = 'personalizada', ordem, nome");
  return linhas.map(deLinha);
}

/** Grava nome, condição, ação, ativa e urgente de uma regra (pronta ou personalizada). */
export async function salvarRegra(regra: Regra): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE regra SET nome = $1, condicao = $2, acao = $3, ativa = $4, urgente = $5 WHERE id = $6",
    [regra.nome, JSON.stringify(regra.condicao), JSON.stringify(regra.acao), regra.ativa ? 1 : 0, regra.urgente ? 1 : 0, regra.id],
  );
}

export async function criarRegra(regra: Omit<Regra, "id" | "tipo" | "ordem">): Promise<string> {
  const db = await getDb();
  const id = novoId();
  const [{ ordem }] = await db.select<{ ordem: number }[]>("SELECT COALESCE(MAX(ordem), 0) + 1 AS ordem FROM regra");
  await db.execute(
    "INSERT INTO regra (id, nome, tipo, condicao, acao, ativa, urgente, ordem) VALUES ($1, $2, 'personalizada', $3, $4, $5, $6, $7)",
    [id, regra.nome, JSON.stringify(regra.condicao), JSON.stringify(regra.acao), regra.ativa ? 1 : 0, regra.urgente ? 1 : 0, ordem],
  );
  return id;
}

export async function removerRegra(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM regra WHERE id = $1 AND tipo = 'personalizada'", [id]);
}

/** Itens abertos para as regras: caixa de entrada, A fazer, pausados e o em foco. */
export async function itensAbertos(): Promise<Item[]> {
  const db = await getDb();
  return db.select<Item[]>(`${SELECT_ITEM} WHERE item.status IN ('inbox', 'a_fazer', 'pausado', 'em_foco')`);
}

/** Títulos concluídos hoje (eventos `concluido` desde a meia-noite local). */
export async function concluidosHoje(agora = new Date()): Promise<string[]> {
  const db = await getDb();
  const meiaNoite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).toISOString();
  const linhas = await db.select<{ titulo: string }[]>(
    `SELECT DISTINCT item.titulo FROM evento JOIN item ON item.id = evento.item_id
      WHERE evento.tipo = 'concluido' AND evento.timestamp >= $1`,
    [meiaNoite],
  );
  return linhas.map((l) => l.titulo);
}

/** Uma notificação gravada: enviada (entregue_em) ou esperando o fim do foco. */
export interface Notificacao {
  id: string;
  regra_id: string | null;
  item_id: string | null;
  titulo: string;
  corpo: string;
  criada_em: string;
  entregue_em: string | null;
}

/**
 * Grava os disparos novos (a `chave` única descarta o que já foi avisado) e devolve
 * só os que entraram agora. `entregar` diz se cada um já sai ou espera o fim do foco.
 */
export async function registrarDisparos(disparos: Disparo[], entregar: (d: Disparo) => boolean): Promise<Notificacao[]> {
  const db = await getDb();
  const novas: Notificacao[] = [];
  for (const d of disparos) {
    const n: Notificacao = {
      id: novoId(),
      regra_id: d.regraId,
      item_id: d.itemId,
      titulo: d.titulo,
      corpo: d.corpo,
      criada_em: agoraIso(),
      entregue_em: entregar(d) ? agoraIso() : null,
    };
    const r = await db.execute(
      `INSERT OR IGNORE INTO notificacao (id, regra_id, item_id, chave, titulo, corpo, criada_em, entregue_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [n.id, n.regra_id, n.item_id, d.chave, n.titulo, n.corpo, n.criada_em, n.entregue_em],
    );
    if (r.rowsAffected > 0) novas.push(n);
  }
  return novas;
}

/** Notificações seguradas pelo não perturbe; ficam marcadas como entregues. */
export async function liberarPendentes(): Promise<Notificacao[]> {
  const db = await getDb();
  const pendentes = await db.select<Notificacao[]>("SELECT * FROM notificacao WHERE entregue_em IS NULL ORDER BY criada_em");
  if (pendentes.length > 0) await db.execute("UPDATE notificacao SET entregue_em = $1 WHERE entregue_em IS NULL", [agoraIso()]);
  return pendentes;
}

/** Últimos avisos, para a lista na tela de regras. */
export async function ultimasNotificacoes(limite = 20): Promise<Notificacao[]> {
  const db = await getDb();
  return db.select<Notificacao[]>("SELECT * FROM notificacao ORDER BY criada_em DESC LIMIT $1", [limite]);
}

/** Não perturbe durante o foco: ligado, a menos que tenha sido desligado. */
export const CHAVE_NAO_PERTURBE = "nao_perturbe";

export async function naoPerturbeLigado(): Promise<boolean> {
  return (await lerConfig(CHAVE_NAO_PERTURBE)) !== "nao";
}

/** Marca o item como uma das do dia (ação "colocar no topo da lista do dia"). */
export async function marcarDoDia(itemId: string, agora = new Date()): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE item SET dia_planejado = $1 WHERE id = $2", [dataLocalIso(agora), itemId]);
}

/** Pessoas e projetos para os campos das regras personalizadas. */
export async function opcoesDeRegra(): Promise<{ pessoas: { id: string; nome: string }[]; projetos: { id: string; nome: string }[] }> {
  const db = await getDb();
  const [pessoas, projetos] = await Promise.all([
    db.select<{ id: string; nome: string }[]>("SELECT id, nome FROM pessoa ORDER BY nome COLLATE NOCASE"),
    db.select<{ id: string; nome: string }[]>("SELECT id, nome FROM projeto ORDER BY nome COLLATE NOCASE"),
  ]);
  return { pessoas, projetos };
}
