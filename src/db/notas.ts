import { getDb } from ".";
import { proximoAviso } from "../notas/lembrete";
import { lerConfig } from "./config";
import { agoraIso, novoId } from "./ids";
import { criarItem } from "./itens";

export type StatusNota = "ativa" | "resolvida" | "virou_tarefa";

/** Algo para não esquecer, que avisa a cada `intervalo_min` até ser resolvido ou virar tarefa. */
export interface Nota {
  id: string;
  titulo: string;
  descricao: string | null;
  intervalo_min: number;
  proximo_aviso: string;
  status: StatusNota;
  item_id: string | null;
  avisos: number;
  criada_em: string;
  fechada_em: string | null;
}

/** Atalho global da nota rápida, ao lado do da nova tarefa (Ctrl+Shift+Espaço). */
export const ATALHO_NOTA_PADRAO = "Ctrl+Alt+Space";
export const CHAVE_ATALHO_NOTA = "atalho_nota";
/** Último intervalo escolhido, que vem marcado na próxima nota. */
export const CHAVE_INTERVALO_NOTA = "nota_intervalo";

export async function lerAtalhoNota(): Promise<string> {
  return (await lerConfig(CHAVE_ATALHO_NOTA)) ?? ATALHO_NOTA_PADRAO;
}

export async function criarNota(titulo: string, descricao: string | null, intervaloMin: number, agora = new Date()): Promise<string> {
  const db = await getDb();
  const id = novoId();
  await db.execute(
    `INSERT INTO nota (id, titulo, descricao, intervalo_min, proximo_aviso, criada_em)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, titulo.trim(), descricao?.trim() || null, intervaloMin, proximoAviso(agora, intervaloMin), agora.toISOString()],
  );
  return id;
}

/** Notas ativas (o próximo aviso primeiro) e as fechadas mais recentes. */
export async function listarNotas(limiteFechadas = 30): Promise<{ ativas: Nota[]; fechadas: Nota[] }> {
  const db = await getDb();
  const [ativas, fechadas] = await Promise.all([
    db.select<Nota[]>("SELECT * FROM nota WHERE status = 'ativa' ORDER BY proximo_aviso, criada_em"),
    db.select<Nota[]>("SELECT * FROM nota WHERE status <> 'ativa' ORDER BY fechada_em DESC LIMIT $1", [limiteFechadas]),
  ]);
  return { ativas, fechadas };
}

export async function contarNotasAtivas(): Promise<number> {
  const db = await getDb();
  const [linha] = await db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM nota WHERE status = 'ativa'");
  return linha?.n ?? 0;
}

/** Notas ativas cujo aviso já venceu. */
export async function notasVencidas(agora = new Date()): Promise<Nota[]> {
  const db = await getDb();
  return db.select<Nota[]>("SELECT * FROM nota WHERE status = 'ativa' AND proximo_aviso <= $1 ORDER BY proximo_aviso", [
    agora.toISOString(),
  ]);
}

/** Avisou: o próximo aviso fica para daqui a um intervalo. */
export async function registrarAviso(nota: Nota, agora = new Date()): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE nota SET proximo_aviso = $1, avisos = avisos + 1 WHERE id = $2", [
    proximoAviso(agora, nota.intervalo_min),
    nota.id,
  ]);
}

/** Muda título, descrição ou intervalo. Trocar o intervalo recomeça a contagem a partir de agora. */
export async function editarNota(
  nota: Nota,
  campos: Partial<Pick<Nota, "titulo" | "descricao" | "intervalo_min">>,
  agora = new Date(),
): Promise<void> {
  const db = await getDb();
  const titulo = campos.titulo?.trim() || nota.titulo;
  const descricao = "descricao" in campos ? campos.descricao?.trim() || null : nota.descricao;
  const intervalo = campos.intervalo_min ?? nota.intervalo_min;
  const proximo = intervalo !== nota.intervalo_min ? proximoAviso(agora, intervalo) : nota.proximo_aviso;
  await db.execute("UPDATE nota SET titulo = $1, descricao = $2, intervalo_min = $3, proximo_aviso = $4 WHERE id = $5", [
    titulo,
    descricao,
    intervalo,
    proximo,
    nota.id,
  ]);
}

/** Adia o próximo aviso: daqui a `minutos`. */
export async function adiarNota(nota: Nota, minutos: number, agora = new Date()): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE nota SET proximo_aviso = $1 WHERE id = $2", [proximoAviso(agora, minutos), nota.id]);
}

/** Resolvida: para de avisar. */
export async function resolverNota(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE nota SET status = 'resolvida', fechada_em = $1 WHERE id = $2", [agoraIso(), id]);
}

/** Volta a avisar, contando o intervalo a partir de agora. */
export async function reabrirNota(nota: Nota, agora = new Date()): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE nota SET status = 'ativa', fechada_em = NULL, proximo_aviso = $1 WHERE id = $2", [
    proximoAviso(agora, nota.intervalo_min),
    nota.id,
  ]);
}

export async function apagarNota(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM nota WHERE id = $1", [id]);
}

/**
 * A nota vira tarefa na caixa de entrada, com o mesmo título e descrição, e para de avisar.
 * Devolve o id da tarefa, para abrir no editor e completar.
 */
export async function virarTarefa(nota: Nota): Promise<string> {
  const itemId = await criarItem(
    { titulo: nota.titulo, pessoa: null, projeto: null, prioridade: null, prazo: null, link: null, origem: "manual", idExterno: null },
    null,
    nota.descricao,
  );
  const db = await getDb();
  await db.execute("UPDATE nota SET status = 'virou_tarefa', item_id = $1, fechada_em = $2 WHERE id = $3", [
    itemId,
    agoraIso(),
    nota.id,
  ]);
  return itemId;
}
