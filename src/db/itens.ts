import type { Captura } from "../captura/parser";
import { getDb } from ".";
import { agoraIso, novoId } from "./ids";

export interface ItemInbox {
  id: string;
  titulo: string;
  prioridade: string | null;
  prazo: string | null;
  link: string | null;
  origem: string;
  criado_em: string;
  pessoa: string | null;
  projeto: string | null;
}

/** Pessoa pelo apelido do @ (sem diferenciar maiúsculas); cria se ainda não existe. */
export async function buscarOuCriarPessoa(apelido: string): Promise<string> {
  const db = await getDb();
  const [existente] = await db.select<{ id: string }[]>("SELECT id FROM pessoa WHERE apelido = $1", [apelido]);
  if (existente) return existente.id;
  const id = novoId();
  await db.execute("INSERT INTO pessoa (id, nome, apelido) VALUES ($1, $2, $2)", [id, apelido]);
  return id;
}

/** Projeto pelo nome do # (sem diferenciar maiúsculas); cria se ainda não existe. */
export async function buscarOuCriarProjeto(nome: string): Promise<string> {
  const db = await getDb();
  const [existente] = await db.select<{ id: string }[]>("SELECT id FROM projeto WHERE nome = $1", [nome]);
  if (existente) return existente.id;
  const id = novoId();
  await db.execute("INSERT INTO projeto (id, nome) VALUES ($1, $2)", [id, nome]);
  return id;
}

/** Grava a captura na caixa de entrada e registra o evento `criado` com o tempo da captura. */
export async function criarItem(captura: Captura, duracaoMs: number | null): Promise<string> {
  const db = await getDb();
  const pessoaId = captura.pessoa ? await buscarOuCriarPessoa(captura.pessoa) : null;
  const projetoId = captura.projeto ? await buscarOuCriarProjeto(captura.projeto) : null;
  const id = novoId();
  const agora = agoraIso();

  await db.execute(
    `INSERT INTO item (id, titulo, status, prioridade, prazo, projeto_id, pessoa_id, link, origem, id_externo, criado_em, atualizado_em)
     VALUES ($1, $2, 'inbox', $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
    [
      id,
      captura.titulo,
      captura.prioridade,
      captura.prazo,
      projetoId,
      pessoaId,
      captura.link,
      captura.origem,
      captura.idExterno,
      agora,
    ],
  );
  await db.execute("INSERT INTO evento (id, item_id, tipo, timestamp, dados) VALUES ($1, $2, 'criado', $3, $4)", [
    novoId(),
    id,
    agora,
    JSON.stringify({ duracao_captura_ms: duracaoMs }),
  ]);
  return id;
}

export async function listarInbox(): Promise<ItemInbox[]> {
  const db = await getDb();
  return db.select<ItemInbox[]>(
    `SELECT item.id, item.titulo, item.prioridade, item.prazo, item.link, item.origem, item.criado_em,
            pessoa.apelido AS pessoa, projeto.nome AS projeto
       FROM item
       LEFT JOIN pessoa ON pessoa.id = item.pessoa_id
       LEFT JOIN projeto ON projeto.id = item.projeto_id
      WHERE item.status = 'inbox'
      ORDER BY item.criado_em`,
  );
}

/** Apelidos e nomes já usados, para o autocompletar de @ e # na captura. */
export async function listarSugestoes(): Promise<{ pessoas: string[]; projetos: string[] }> {
  const db = await getDb();
  const pessoas = await db.select<{ apelido: string }[]>("SELECT apelido FROM pessoa ORDER BY apelido");
  const projetos = await db.select<{ nome: string }[]>("SELECT nome FROM projeto ORDER BY nome");
  return { pessoas: pessoas.map((p) => p.apelido), projetos: projetos.map((p) => p.nome) };
}
