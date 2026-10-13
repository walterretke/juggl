import { getDb } from ".";
import type { Sessao } from "../horas/calculo";
import { itemEmFoco } from "./foco";
import { agoraIso, novoId } from "./ids";

interface LinhaSessao {
  id: string;
  item_id: string | null;
  titulo: string | null;
  projeto_id: string | null;
  projeto: string | null;
  codigo: string | null;
  inicio: string;
  fim: string;
}

function paraSessao(l: LinhaSessao, tipo: Sessao["tipo"]): Sessao {
  return {
    id: l.id,
    tipo,
    itemId: l.item_id,
    titulo: l.titulo ?? "Sem descrição",
    projetoId: l.projeto_id,
    projeto: l.projeto,
    codigo: l.codigo,
    inicio: new Date(l.inicio),
    fim: new Date(l.fim),
  };
}

/**
 * Sessões que tocam o intervalo [de, ate): os focos encerrados (eventos foco_fim),
 * os lançamentos à mão e a sessão em andamento (contada até agora).
 */
export async function listarSessoes(de: Date, ate: Date, agora = new Date()): Promise<Sessao[]> {
  const db = await getDb();
  const focos = await db.select<LinhaSessao[]>(
    `SELECT evento.id, item.id AS item_id, item.titulo, projeto.id AS projeto_id, projeto.nome AS projeto,
            projeto.codigo_apontamento AS codigo,
            json_extract(evento.dados, '$.inicio') AS inicio, evento.timestamp AS fim
       FROM evento
       JOIN item ON item.id = evento.item_id
       LEFT JOIN projeto ON projeto.id = item.projeto_id
      WHERE evento.tipo = 'foco_fim'
        AND evento.timestamp > $1
        AND json_extract(evento.dados, '$.inicio') < $2`,
    [de.toISOString(), ate.toISOString()],
  );
  // Lançamento à mão: o projeto do item, se tiver item; senão o projeto escolhido no lançamento.
  const manuais = await db.select<LinhaSessao[]>(
    `SELECT s.id, s.item_id, COALESCE(item.titulo, s.descricao) AS titulo,
            projeto.id AS projeto_id, projeto.nome AS projeto, projeto.codigo_apontamento AS codigo,
            s.inicio, s.fim
       FROM sessao_manual s
       LEFT JOIN item ON item.id = s.item_id
       LEFT JOIN projeto ON projeto.id = COALESCE(item.projeto_id, s.projeto_id)
      WHERE s.fim > $1 AND s.inicio < $2`,
    [de.toISOString(), ate.toISOString()],
  );
  const sessoes = [...focos.map((l) => paraSessao(l, "foco")), ...manuais.map((l) => paraSessao(l, "manual"))];

  const foco = await itemEmFoco();
  if (foco) {
    const [projeto] = foco.item.projeto_id
      ? await db.select<{ codigo: string | null }[]>("SELECT codigo_apontamento AS codigo FROM projeto WHERE id = $1", [
          foco.item.projeto_id,
        ])
      : [];
    sessoes.push({
      id: foco.item.id,
      tipo: "andamento",
      itemId: foco.item.id,
      titulo: foco.item.titulo,
      projetoId: foco.item.projeto_id,
      projeto: foco.item.projeto,
      codigo: projeto?.codigo ?? null,
      inicio: new Date(foco.inicio),
      fim: agora,
    });
  }
  return sessoes;
}

/** Código usado no sistema de apontamento de horas da empresa (vazio tira). */
export async function definirCodigoApontamento(projetoId: string, codigo: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE projeto SET codigo_apontamento = $1 WHERE id = $2", [codigo.trim() || null, projetoId]);
}

export interface Lancamento {
  /** Item a que o tempo pertence; sem item, vale o projeto e a descrição. */
  itemId: string | null;
  projetoId: string | null;
  descricao: string | null;
  inicio: Date;
  fim: Date;
}

/** Tempo lançado à mão (reunião, foco esquecido). Devolve o id, para desfazer. */
export async function lancarTempo(l: Lancamento): Promise<string> {
  const db = await getDb();
  const id = novoId();
  await db.execute(
    `INSERT INTO sessao_manual (id, item_id, projeto_id, descricao, inicio, fim, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, l.itemId, l.itemId ? null : l.projetoId, l.descricao?.trim() || null, l.inicio.toISOString(), l.fim.toISOString(), agoraIso()],
  );
  return id;
}

/** Muda o início e o fim de uma sessão encerrada (foco ou lançamento). */
export async function ajustarSessao(sessao: Sessao, inicio: Date, fim: Date): Promise<void> {
  const db = await getDb();
  if (sessao.tipo === "manual") {
    await db.execute("UPDATE sessao_manual SET inicio = $1, fim = $2 WHERE id = $3", [inicio.toISOString(), fim.toISOString(), sessao.id]);
  } else if (sessao.tipo === "foco") {
    await db.execute(
      `UPDATE evento SET timestamp = $1,
              dados = json_set(COALESCE(dados, '{}'), '$.inicio', $2, '$.duracao_ms', $3, '$.ajustado', 1)
        WHERE id = $4`,
      [fim.toISOString(), inicio.toISOString(), fim.getTime() - inicio.getTime(), sessao.id],
    );
  }
}

/** Apaga uma sessão encerrada: o tempo some das horas e do total do item. */
export async function apagarSessao(sessao: Sessao): Promise<void> {
  const db = await getDb();
  if (sessao.tipo === "manual") await db.execute("DELETE FROM sessao_manual WHERE id = $1", [sessao.id]);
  else if (sessao.tipo === "foco") await db.execute("DELETE FROM evento WHERE id = $1 AND tipo = 'foco_fim'", [sessao.id]);
}

/** Passa uma sessão para outro item (o tempo foi contado no item errado). */
export async function moverSessao(sessao: Sessao, itemId: string): Promise<void> {
  const db = await getDb();
  if (sessao.tipo === "manual") await db.execute("UPDATE sessao_manual SET item_id = $1 WHERE id = $2", [itemId, sessao.id]);
  else if (sessao.tipo === "foco") await db.execute("UPDATE evento SET item_id = $1 WHERE id = $2", [itemId, sessao.id]);
}

/** Itens para escolher num lançamento ou ao mover uma sessão: abertos e mexidos nos últimos 30 dias. */
export async function itensParaLancar(): Promise<{ id: string; titulo: string; projeto: string | null }[]> {
  const db = await getDb();
  return db.select(
    `SELECT item.id, item.titulo, projeto.nome AS projeto
       FROM item LEFT JOIN projeto ON projeto.id = item.projeto_id
      WHERE item.status NOT IN ('feito', 'arquivado') OR item.atualizado_em >= datetime('now', '-30 days')
      ORDER BY item.atualizado_em DESC`,
  );
}
