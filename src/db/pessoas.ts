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
