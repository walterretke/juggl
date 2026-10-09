import type { Captura, Prioridade } from "../captura/parser";
import { getDb } from ".";
import { agoraIso, novoId } from "./ids";

export type Status = "inbox" | "a_fazer" | "em_foco" | "pausado" | "aguardando" | "feito" | "arquivado";
export type Lista = "inbox" | "a_fazer";

export interface Item {
  id: string;
  titulo: string;
  status: Status;
  prioridade: Prioridade | null;
  prazo: string | null;
  link: string | null;
  origem: string;
  id_externo: string | null;
  criado_em: string;
  atualizado_em: string;
  pessoa_id: string | null;
  projeto_id: string | null;
  pessoa: string | null;
  projeto: string | null;
}

/** Campos que a triagem pode mudar. */
export type Mudancas = Partial<Pick<Item, "titulo" | "status" | "prioridade" | "prazo" | "pessoa_id" | "projeto_id">>;

/** O que é preciso para desfazer uma mudança: os valores anteriores e os eventos gravados. */
export interface Alteracao {
  itemId: string;
  anterior: Mudancas;
  eventos: string[];
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

const ORDEM: Record<Lista, string> = {
  // Caixa de entrada: mais antigos primeiro, para nada ficar esquecido no fundo.
  inbox: "item.criado_em",
  // A fazer: prazo mais próximo primeiro (sem prazo no fim), depois prioridade.
  a_fazer: `item.prazo IS NULL, item.prazo,
            CASE item.prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 WHEN 'baixa' THEN 2 ELSE 3 END,
            item.criado_em`,
};

export async function listarItens(lista: Lista): Promise<Item[]> {
  const db = await getDb();
  return db.select<Item[]>(
    `SELECT item.id, item.titulo, item.status, item.prioridade, item.prazo, item.link, item.origem,
            item.id_externo, item.criado_em, item.atualizado_em, item.pessoa_id, item.projeto_id,
            pessoa.apelido AS pessoa, projeto.nome AS projeto
       FROM item
       LEFT JOIN pessoa ON pessoa.id = item.pessoa_id
       LEFT JOIN projeto ON projeto.id = item.projeto_id
      WHERE item.status = $1
      ORDER BY ${ORDEM[lista]}`,
    [lista],
  );
}

export async function contarPorLista(): Promise<Record<Lista, number>> {
  const db = await getDb();
  const linhas = await db.select<{ status: Lista; total: number }[]>(
    "SELECT status, COUNT(*) AS total FROM item WHERE status IN ('inbox', 'a_fazer') GROUP BY status",
  );
  const contagem: Record<Lista, number> = { inbox: 0, a_fazer: 0 };
  for (const l of linhas) contagem[l.status] = l.total;
  return contagem;
}

const CAMPOS_EDITAVEIS = ["titulo", "status", "prioridade", "prazo", "pessoa_id", "projeto_id"] as const;

async function gravarCampos(id: string, campos: Mudancas): Promise<void> {
  const nomes = CAMPOS_EDITAVEIS.filter((c) => c in campos);
  if (nomes.length === 0) return;
  const db = await getDb();
  const sets = nomes.map((c, i) => `${c} = $${i + 1}`).join(", ");
  await db.execute(`UPDATE item SET ${sets}, atualizado_em = $${nomes.length + 1} WHERE id = $${nomes.length + 2}`, [
    ...nomes.map((c) => campos[c] ?? null),
    agoraIso(),
    id,
  ]);
}

async function registrarEvento(itemId: string, tipo: string, dados: unknown): Promise<string> {
  const db = await getDb();
  const id = novoId();
  await db.execute("INSERT INTO evento (id, item_id, tipo, timestamp, dados) VALUES ($1, $2, $3, $4, $5)", [
    id,
    itemId,
    tipo,
    agoraIso(),
    JSON.stringify(dados),
  ]);
  return id;
}

/**
 * Aplica mudanças da triagem e registra os eventos que o PDF prevê
 * (prazo_alterado, concluido). Devolve o necessário para desfazer.
 */
export async function alterarItem(item: Item, mudancas: Mudancas): Promise<Alteracao> {
  const anterior: Mudancas = {};
  for (const c of CAMPOS_EDITAVEIS) {
    if (c in mudancas) (anterior as Record<string, unknown>)[c] = item[c];
  }
  await gravarCampos(item.id, mudancas);

  const eventos: string[] = [];
  if ("prazo" in mudancas && mudancas.prazo !== item.prazo) {
    eventos.push(await registrarEvento(item.id, "prazo_alterado", { de: item.prazo, para: mudancas.prazo }));
  }
  if (mudancas.status === "feito" && item.status !== "feito") {
    eventos.push(await registrarEvento(item.id, "concluido", { de: item.status }));
  }
  return { itemId: item.id, anterior, eventos };
}

export async function desfazerAlteracao(alteracao: Alteracao): Promise<void> {
  await gravarCampos(alteracao.itemId, alteracao.anterior);
  const db = await getDb();
  for (const id of alteracao.eventos) await db.execute("DELETE FROM evento WHERE id = $1", [id]);
}

/** Apelidos e nomes já usados, para o autocompletar de @ e # na captura. */
export async function listarSugestoes(): Promise<{ pessoas: string[]; projetos: string[] }> {
  const db = await getDb();
  const pessoas = await db.select<{ apelido: string }[]>("SELECT apelido FROM pessoa ORDER BY apelido");
  const projetos = await db.select<{ nome: string }[]>("SELECT nome FROM projeto ORDER BY nome");
  return { pessoas: pessoas.map((p) => p.apelido), projetos: projetos.map((p) => p.nome) };
}
