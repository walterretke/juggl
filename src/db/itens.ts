import { normalizarNome, type Captura } from "../captura/parser";
import type { CorPrioridade } from "./prioridades";
import { getDb } from ".";
import { agoraIso, novoId } from "./ids";

export type Status = "inbox" | "a_fazer" | "em_foco" | "pausado" | "aguardando" | "feito" | "arquivado";
export type Lista = "inbox" | "a_fazer";

export interface Item {
  id: string;
  titulo: string;
  /** Descrição livre (o texto selecionado na captura, por exemplo). */
  nota: string | null;
  status: Status;
  prioridade_id: string | null;
  prioridade: string | null; // nome
  prioridade_cor: CorPrioridade | null;
  prazo: string | null;
  /** Data que você prometeu para quem pediu (pode ser diferente do prazo). */
  prometido_para: string | null;
  /** Dia em que o item foi escolhido no ritual da manhã como uma das 3 do dia. */
  dia_planejado: string | null;
  link: string | null;
  origem: string;
  id_externo: string | null;
  criado_em: string;
  atualizado_em: string;
  pessoa_id: string | null;
  projeto_id: string | null;
  pessoa: string | null;
  projeto: string | null;
  /** Onde parou, anotado na última pausa (só para itens pausados). */
  nota_pausa: string | null;
  /** Tempo total em foco, somando as sessões já encerradas. */
  tempo_ms: number;
  /** Quantas vezes quem pediu cobrou de novo (eventos `cobrado`). */
  cobrancas: number;
  ultima_cobranca: string | null;
}

/** Campos que a triagem pode mudar. */
export type Mudancas = Partial<
  Pick<Item, "titulo" | "nota" | "status" | "prioridade_id" | "prazo" | "prometido_para" | "dia_planejado" | "pessoa_id" | "projeto_id">
>;

/** O que é preciso para desfazer uma mudança: os valores anteriores e os eventos gravados. */
export interface Alteracao {
  itemId: string;
  anterior: Mudancas;
  eventos: string[];
}

/** Id do nome igual a `nome`, ignorando maiúsculas, acentos, espaços e _ ("@carla_dias" acha "Carla Dias"). */
async function buscarPorNome(tabela: "pessoa" | "projeto", coluna: string, nome: string): Promise<string | null> {
  const db = await getDb();
  const linhas = await db.select<{ id: string; nome: string }[]>(`SELECT id, ${coluna} AS nome FROM ${tabela}`);
  const alvo = normalizarNome(nome);
  return linhas.find((l) => normalizarNome(l.nome) === alvo)?.id ?? null;
}

/** Pessoa pelo apelido do @ ou do campo Quem pediu; cria se ainda não existe. */
export async function buscarOuCriarPessoa(apelido: string): Promise<string> {
  const existente = await buscarPorNome("pessoa", "apelido", apelido);
  if (existente) return existente;
  const nome = apelido.trim().replace(/_/g, " ");
  const id = novoId();
  const db = await getDb();
  await db.execute("INSERT INTO pessoa (id, nome, apelido) VALUES ($1, $2, $2)", [id, nome]);
  return id;
}

/** Projeto pelo nome do # ou do campo Projeto; cria se ainda não existe. */
export async function buscarOuCriarProjeto(nome: string): Promise<string> {
  const existente = await buscarPorNome("projeto", "nome", nome);
  if (existente) return existente;
  const id = novoId();
  const db = await getDb();
  await db.execute("INSERT INTO projeto (id, nome) VALUES ($1, $2)", [id, nome.trim().replace(/_/g, " ")]);
  return id;
}

/** Grava a captura na caixa de entrada e registra o evento `criado` com o tempo da captura. */
export async function criarItem(captura: Captura, duracaoMs: number | null, descricao: string | null = null): Promise<string> {
  const db = await getDb();
  const pessoaId = captura.pessoa ? await buscarOuCriarPessoa(captura.pessoa) : null;
  const projetoId = captura.projeto ? await buscarOuCriarProjeto(captura.projeto) : null;
  const id = novoId();
  const agora = agoraIso();

  await db.execute(
    `INSERT INTO item (id, titulo, nota, status, prioridade_id, prazo, projeto_id, pessoa_id, link, origem, id_externo, criado_em, atualizado_em)
     VALUES ($1, $2, $11, 'inbox', $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
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
      descricao?.trim() || null,
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
  // A fazer: as 3 do dia (ritual) primeiro; depois prazo mais próximo (sem prazo no fim),
  // prioridade e quem cobrou mais.
  a_fazer: `item.dia_planejado IS NOT date('now', 'localtime'),
            item.prazo IS NULL, item.prazo,
            prioridade.ordem IS NULL, prioridade.ordem,
            cobrancas DESC, item.criado_em`,
};

/** Status que aparecem em cada lista. Pausados voltam para A fazer, com a nota de onde parou. */
const STATUS_DA_LISTA: Record<Lista, string> = {
  inbox: "'inbox'",
  a_fazer: "'a_fazer', 'pausado'",
};

/** SELECT de itens com pessoa, projeto, nota da última pausa, tempo em foco e cobranças. */
export const SELECT_ITEM = `
  SELECT item.id, item.titulo, item.nota, item.status, item.prioridade_id, prioridade.nome AS prioridade,
         prioridade.cor AS prioridade_cor, item.prazo, item.prometido_para, item.dia_planejado,
         item.link, item.origem,
         item.id_externo, item.criado_em, item.atualizado_em, item.pessoa_id, item.projeto_id,
         pessoa.apelido AS pessoa, projeto.nome AS projeto,
         CASE WHEN item.status = 'pausado' THEN
           (SELECT json_extract(e.dados, '$.nota') FROM evento e
             WHERE e.item_id = item.id AND e.tipo = 'foco_fim' ORDER BY e.timestamp DESC LIMIT 1)
         END AS nota_pausa,
         COALESCE((SELECT SUM(json_extract(e.dados, '$.duracao_ms')) FROM evento e
                    WHERE e.item_id = item.id AND e.tipo = 'foco_fim'), 0) AS tempo_ms,
         (SELECT COUNT(*) FROM evento e WHERE e.item_id = item.id AND e.tipo = 'cobrado') AS cobrancas,
         (SELECT MAX(e.timestamp) FROM evento e WHERE e.item_id = item.id AND e.tipo = 'cobrado') AS ultima_cobranca
    FROM item
    LEFT JOIN pessoa ON pessoa.id = item.pessoa_id
    LEFT JOIN projeto ON projeto.id = item.projeto_id
    LEFT JOIN prioridade ON prioridade.id = item.prioridade_id`;

export async function listarItens(lista: Lista): Promise<Item[]> {
  const db = await getDb();
  return db.select<Item[]>(`${SELECT_ITEM} WHERE item.status IN (${STATUS_DA_LISTA[lista]}) ORDER BY ${ORDEM[lista]}`);
}

export async function contarPorLista(): Promise<Record<Lista, number>> {
  const db = await getDb();
  const [linha] = await db.select<Record<Lista, number>[]>(
    `SELECT COALESCE(SUM(status IN (${STATUS_DA_LISTA.inbox})), 0) AS inbox,
            COALESCE(SUM(status IN (${STATUS_DA_LISTA.a_fazer})), 0) AS a_fazer
       FROM item`,
  );
  return linha ?? { inbox: 0, a_fazer: 0 };
}

const CAMPOS_EDITAVEIS = [
  "titulo",
  "nota",
  "status",
  "prioridade_id",
  "prazo",
  "prometido_para",
  "dia_planejado",
  "pessoa_id",
  "projeto_id",
] as const;

export async function gravarCampos(id: string, campos: Mudancas): Promise<void> {
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

export async function registrarEvento(itemId: string, tipo: string, dados: unknown, quando = agoraIso()): Promise<string> {
  const db = await getDb();
  const id = novoId();
  await db.execute("INSERT INTO evento (id, item_id, tipo, timestamp, dados) VALUES ($1, $2, $3, $4, $5)", [
    id,
    itemId,
    tipo,
    quando,
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

/** "Cobrou de novo": registra a cobrança, que pesa na ordem de A fazer. Pode ser desfeita. */
export async function registrarCobranca(item: Item): Promise<Alteracao> {
  const evento = await registrarEvento(item.id, "cobrado", { pessoa_id: item.pessoa_id });
  return { itemId: item.id, anterior: {}, eventos: [evento] };
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
