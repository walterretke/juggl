import { getDb } from ".";
import type { Sessao } from "../horas/calculo";
import { itemEmFoco } from "./foco";

interface LinhaSessao {
  item_id: string;
  titulo: string;
  projeto_id: string | null;
  projeto: string | null;
  codigo: string | null;
  inicio: string;
  fim: string;
}

/**
 * Sessões de foco que tocam o intervalo [de, ate), a partir dos eventos foco_fim,
 * mais a sessão em andamento (contada até agora).
 */
export async function listarSessoes(de: Date, ate: Date, agora = new Date()): Promise<Sessao[]> {
  const db = await getDb();
  const linhas = await db.select<LinhaSessao[]>(
    `SELECT item.id AS item_id, item.titulo, projeto.id AS projeto_id, projeto.nome AS projeto,
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
  const sessoes: Sessao[] = linhas.map((l) => ({
    itemId: l.item_id,
    titulo: l.titulo,
    projetoId: l.projeto_id,
    projeto: l.projeto,
    codigo: l.codigo,
    inicio: new Date(l.inicio),
    fim: new Date(l.fim),
  }));

  const foco = await itemEmFoco();
  if (foco) {
    const [projeto] = foco.item.projeto_id
      ? await db.select<{ codigo: string | null }[]>("SELECT codigo_apontamento AS codigo FROM projeto WHERE id = $1", [
          foco.item.projeto_id,
        ])
      : [];
    sessoes.push({
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
