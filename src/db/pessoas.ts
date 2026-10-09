import { normalizarNome } from "../captura/parser";
import { getDb } from ".";
import { SELECT_ITEM, type Item } from "./itens";

/** Uma pessoa com o resumo do que ela pediu. */
export interface ResumoPessoa {
  id: string;
  nome: string;
  apelido: string;
  /** Pedidos ainda não concluídos nem arquivados. */
  abertos: number;
  /** Cobranças registradas nos pedidos abertos. */
  cobrancas: number;
  /** Última mudança em qualquer pedido dela. */
  ultima_atualizacao: string | null;
}

const ABERTO = "item.status NOT IN ('feito', 'arquivado')";

/** Pessoas que já pediram algo: quem tem mais pedidos abertos primeiro. */
export async function listarPessoas(): Promise<ResumoPessoa[]> {
  const db = await getDb();
  return db.select<ResumoPessoa[]>(
    `SELECT pessoa.id, pessoa.nome, pessoa.apelido,
            COALESCE(SUM(${ABERTO}), 0) AS abertos,
            (SELECT COUNT(*) FROM evento e JOIN item i ON i.id = e.item_id
              WHERE e.tipo = 'cobrado' AND i.pessoa_id = pessoa.id
                AND i.status NOT IN ('feito', 'arquivado')) AS cobrancas,
            MAX(item.atualizado_em) AS ultima_atualizacao
       FROM pessoa
       LEFT JOIN item ON item.pessoa_id = pessoa.id AND item.status != 'arquivado'
      GROUP BY pessoa.id
      ORDER BY abertos DESC, ultima_atualizacao DESC, pessoa.apelido`,
  );
}

/** Pedidos de uma pessoa: os abertos (em foco primeiro) e os concluídos nos últimos 30 dias. */
export async function itensDaPessoa(pessoaId: string): Promise<Item[]> {
  const db = await getDb();
  return db.select<Item[]>(
    `${SELECT_ITEM}
      WHERE item.pessoa_id = $1
        AND (${ABERTO} OR (item.status = 'feito' AND item.atualizado_em >= datetime('now', '-30 days')))
      ORDER BY item.status = 'feito', item.status != 'em_foco',
               item.prometido_para IS NULL, item.prometido_para,
               item.prazo IS NULL, item.prazo, item.criado_em`,
    [pessoaId],
  );
}

/** Outra pessoa com o mesmo nome (ignorando maiúsculas, acentos, espaços e _), se houver. */
export async function pessoaComNome(nome: string, excetoId: string): Promise<ResumoPessoa | null> {
  const alvo = normalizarNome(nome);
  const todas = await listarPessoas();
  return todas.find((p) => p.id !== excetoId && (normalizarNome(p.apelido) === alvo || normalizarNome(p.nome) === alvo)) ?? null;
}

/** Troca o nome (usado também no @ da captura). Quem chama confere antes se o nome já existe. */
export async function renomearPessoa(id: string, nome: string): Promise<void> {
  const db = await getDb();
  const limpo = nome.trim().replace(/^@/, "");
  await db.execute("UPDATE pessoa SET nome = $1, apelido = $1 WHERE id = $2", [limpo, id]);
}

/** Junta duas pessoas: os pedidos de `origemId` passam para `destinoId` e a origem some. */
export async function juntarPessoas(origemId: string, destinoId: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE item SET pessoa_id = $1 WHERE pessoa_id = $2", [destinoId, origemId]);
  await db.execute("DELETE FROM pessoa WHERE id = $1", [origemId]);
}

/** Exclui a pessoa. Os pedidos dela continuam, só ficam sem "quem pediu". */
export async function excluirPessoa(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE item SET pessoa_id = NULL WHERE pessoa_id = $1", [id]);
  await db.execute("DELETE FROM pessoa WHERE id = $1", [id]);
}
