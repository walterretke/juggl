import { normalizarNome, type Captura } from "../captura/parser";
import type { CorPrioridade } from "./prioridades";
import { getDb } from ".";
import { agoraIso, novoId } from "./ids";
import { dataLocalIso } from "../captura/datas";

export type Status = "inbox" | "a_fazer" | "em_foco" | "pausado" | "aguardando" | "feito" | "arquivado";
export type Lista = "inbox" | "a_fazer" | "aguardando";
/** Momento do dia para um item de Hoje: um "quando" leve, que não quebra com interrupções. */
export type Quando = "manha" | "depois_daily" | "tarde" | "fim_dia";

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
  /** Dia em que o item foi escolhido como uma das 3 do dia (Planejar o dia). */
  dia_planejado: string | null;
  /** Momento aproximado em que vai ser feito no dia planejado. */
  quando: Quando | null;
  /** Aguardando: de quem é a vez (texto livre, como "Carlos" ou "fornecedor"). */
  aguardando_quem: string | null;
  /** Aguardando: dia de cobrar o retorno; nesse dia o item volta sozinho para A fazer. */
  aguardando_ate: string | null;
  /** Em espera: o motivo (tipo de espera das Configurações), com nome e cor para o cartão. */
  espera_tipo_id: string | null;
  espera: string | null;
  espera_cor: CorPrioridade | null;
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
  /** Onde estava antes de ser concluído ou arquivado, para restaurar no lugar certo. */
  status_anterior: Status | null;
  /** Horário na agenda (AAAA-MM-DDTHH:MM, hora local); sem horário, vale o prazo ou o dia planejado. */
  agenda_inicio: string | null;
  agenda_fim: string | null;
  /** Checklist: quantos passos e quantos já feitos. */
  subtarefas: number;
  subtarefas_feitas: number;
  anexos: number;
  /** Mensagem opcional deixada ao concluir (pelo overlay de foco). */
  encerramento: string | null;
}

/** Campos que a triagem pode mudar. */
export type Mudancas = Partial<
  Pick<
    Item,
    | "titulo"
    | "nota"
    | "status"
    | "prioridade_id"
    | "prazo"
    | "prometido_para"
    | "dia_planejado"
    | "quando"
    | "aguardando_quem"
    | "aguardando_ate"
    | "espera_tipo_id"
    | "pessoa_id"
    | "projeto_id"
    | "agenda_inicio"
    | "agenda_fim"
  >
>;

/** O que é preciso para desfazer uma mudança: os valores anteriores e os eventos gravados. */
export interface Alteracao {
  itemId: string;
  anterior: Mudancas;
  eventos: string[];
  /** Tarefa apagada: as linhas guardadas para o desfazer trazer de volta. */
  copia?: CopiaApagada;
}

type Linha = Record<string, unknown>;

/** O que `apagarItem` tirou do banco, para desfazer. */
export interface CopiaApagada {
  item: Linha;
  eventos: Linha[];
  notificacoes: Linha[];
  /** Checklist, anexos e lançamentos de horas da tarefa. */
  filhos: { tabela: string; linhas: Linha[] }[];
}

/** Tabelas com linhas que pertencem a uma tarefa e vão embora junto com ela. */
/** Apagadas junto com a tarefa (lançamentos de horas inclusive: tarefa apagada não conta nas horas). */
const TABELAS_FILHAS = ["subtarefa", "anexo", "sessao_manual"];

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

/** Coluna do quadro em que uma tarefa nova entra. */
export type Destino = "inbox" | "hoje" | "a_fazer";

/**
 * Grava a tarefa nova na coluna escolhida (caixa de entrada, Hoje ou A fazer) e registra o
 * evento `criado` com o tempo da captura. Em Hoje, `quando` diz o momento do dia.
 */
export async function criarItem(
  captura: Captura,
  duracaoMs: number | null,
  descricao: string | null = null,
  destino: Destino = "inbox",
  quando: Quando | null = null,
): Promise<string> {
  const db = await getDb();
  const pessoaId = captura.pessoa ? await buscarOuCriarPessoa(captura.pessoa) : null;
  const projetoId = captura.projeto ? await buscarOuCriarProjeto(captura.projeto) : null;
  const id = novoId();
  const agora = agoraIso();

  await db.execute(
    `INSERT INTO item (id, titulo, nota, status, prioridade_id, prazo, projeto_id, pessoa_id, link, origem, id_externo, criado_em, atualizado_em,
                       dia_planejado, quando)
     VALUES ($1, $2, $11, $12, $3, $4, $5, $6, $7, $8, $9, $10, $10, $13, $14)`,
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
      destino === "inbox" ? "inbox" : "a_fazer",
      destino === "hoje" ? dataLocalIso(new Date()) : null,
      destino === "hoje" ? quando : null,
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
  // A fazer: as 3 do dia primeiro; depois prazo mais próximo (sem prazo no fim),
  // prioridade e quem cobrou mais.
  a_fazer: `item.dia_planejado IS NOT date('now', 'localtime'),
            item.prazo IS NULL, item.prazo,
            prioridade.ordem IS NULL, prioridade.ordem,
            cobrancas DESC, item.criado_em`,
  // Aguardando: o retorno mais próximo primeiro; sem data no fim.
  aguardando: "item.aguardando_ate IS NULL, item.aguardando_ate, item.atualizado_em",
};

/** Status que aparecem em cada lista. Pausados voltam para A fazer, com a nota de onde parou. */
const STATUS_DA_LISTA: Record<Lista, string> = {
  inbox: "'inbox'",
  a_fazer: "'a_fazer', 'pausado'",
  aguardando: "'aguardando'",
};

/** SELECT de itens com pessoa, projeto, nota da última pausa, tempo em foco e cobranças. */
export const SELECT_ITEM = `
  SELECT item.id, item.titulo, item.nota, item.status, item.prioridade_id, prioridade.nome AS prioridade,
         prioridade.cor AS prioridade_cor, item.prazo, item.prometido_para, item.dia_planejado,
         item.quando, item.aguardando_quem, item.aguardando_ate,
         item.espera_tipo_id, tipo_espera.nome AS espera, tipo_espera.cor AS espera_cor,
         item.link, item.origem,
         item.id_externo, item.criado_em, item.atualizado_em, item.pessoa_id, item.projeto_id,
         pessoa.apelido AS pessoa, projeto.nome AS projeto,
         CASE WHEN item.status = 'pausado' THEN
           (SELECT json_extract(e.dados, '$.nota') FROM evento e
             WHERE e.item_id = item.id AND e.tipo = 'foco_fim' ORDER BY e.timestamp DESC LIMIT 1)
         END AS nota_pausa,
         COALESCE((SELECT SUM(json_extract(e.dados, '$.duracao_ms')) FROM evento e
                    WHERE e.item_id = item.id AND e.tipo = 'foco_fim'), 0)
           + COALESCE((SELECT CAST(SUM((julianday(s.fim) - julianday(s.inicio)) * 86400000) AS INTEGER)
                         FROM sessao_manual s WHERE s.item_id = item.id), 0) AS tempo_ms,
         (SELECT COUNT(*) FROM evento e WHERE e.item_id = item.id AND e.tipo = 'cobrado') AS cobrancas,
         (SELECT MAX(e.timestamp) FROM evento e WHERE e.item_id = item.id AND e.tipo = 'cobrado') AS ultima_cobranca,
         item.status_anterior, item.agenda_inicio, item.agenda_fim,
         (SELECT COUNT(*) FROM subtarefa st WHERE st.item_id = item.id) AS subtarefas,
         (SELECT COUNT(*) FROM subtarefa st WHERE st.item_id = item.id AND st.feita = 1) AS subtarefas_feitas,
         (SELECT COUNT(*) FROM anexo a WHERE a.item_id = item.id) AS anexos,
         (SELECT json_extract(e.dados, '$.mensagem') FROM evento e
           WHERE e.item_id = item.id AND e.tipo = 'concluido' ORDER BY e.timestamp DESC LIMIT 1) AS encerramento
    FROM item
    LEFT JOIN pessoa ON pessoa.id = item.pessoa_id
    LEFT JOIN projeto ON projeto.id = item.projeto_id
    LEFT JOIN prioridade ON prioridade.id = item.prioridade_id
    LEFT JOIN tipo_espera ON tipo_espera.id = item.espera_tipo_id`;

export async function listarItens(lista: Lista): Promise<Item[]> {
  const db = await getDb();
  return db.select<Item[]>(`${SELECT_ITEM} WHERE item.status IN (${STATUS_DA_LISTA[lista]}) ORDER BY ${ORDEM[lista]}`);
}

export async function contarPorLista(): Promise<Record<Lista, number>> {
  const db = await getDb();
  const [linha] = await db.select<Record<Lista, number>[]>(
    `SELECT COALESCE(SUM(status IN (${STATUS_DA_LISTA.inbox})), 0) AS inbox,
            COALESCE(SUM(status IN (${STATUS_DA_LISTA.a_fazer})), 0) AS a_fazer,
            COALESCE(SUM(status IN (${STATUS_DA_LISTA.aguardando})), 0) AS aguardando
       FROM item`,
  );
  return linha ?? { inbox: 0, a_fazer: 0, aguardando: 0 };
}

const CAMPOS_EDITAVEIS = [
  "titulo",
  "nota",
  "status",
  "prioridade_id",
  "prazo",
  "prometido_para",
  "dia_planejado",
  "quando",
  "aguardando_quem",
  "aguardando_ate",
  "espera_tipo_id",
  "pessoa_id",
  "projeto_id",
  "agenda_inicio",
  "agenda_fim",
] as const;

export async function gravarCampos(id: string, campos: Mudancas): Promise<void> {
  const nomes = CAMPOS_EDITAVEIS.filter((c) => c in campos);
  if (nomes.length === 0) return;
  const db = await getDb();
  const sets = nomes.map((c, i) => `${c} = $${i + 1}`).join(", ");
  // Planejar (escolher para hoje, trocar o "quando") não conta como mexer no item:
  // `atualizado_em` (o "parado há" da urgência) fica igual.
  const soPlano = nomes.every((c) => c === "dia_planejado" || c === "quando");
  // Ao concluir ou arquivar, guarda onde a tarefa estava (no SET, `status` ainda é o valor antigo).
  const anterior =
    "status" in campos
      ? `, status_anterior = CASE WHEN $${nomes.indexOf("status") + 1} IN ('feito', 'arquivado') AND status NOT IN ('feito', 'arquivado')
                                  THEN status ELSE status_anterior END`
      : "";
  await db.execute(
    `UPDATE item SET ${sets}${anterior}, atualizado_em = ${soPlano ? "atualizado_em" : `$${nomes.length + 1}`} WHERE id = $${nomes.length + 2}`,
    [...nomes.map((c) => campos[c] ?? null), agoraIso(), id],
  );
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
export async function alterarItem(item: Item, original: Mudancas): Promise<Alteracao> {
  // Saiu de Aguardando (ou resolveu o retorno): a espera acaba junto, e o desfazer a traz de volta.
  const saiu = "status" in original && original.status !== "aguardando";
  const mudancas: Mudancas = { ...original };
  if (saiu && !("aguardando_ate" in original) && (item.aguardando_ate || item.aguardando_quem)) {
    mudancas.aguardando_quem = null;
    mudancas.aguardando_ate = null;
  }
  // O motivo só vale enquanto está em espera.
  if (saiu && !("espera_tipo_id" in original) && item.espera_tipo_id) mudancas.espera_tipo_id = null;
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
  if (alteracao.copia) return restaurarApagado(alteracao.copia);
  await gravarCampos(alteracao.itemId, alteracao.anterior);
  const db = await getDb();
  for (const id of alteracao.eventos) await db.execute("DELETE FROM evento WHERE id = $1", [id]);
}

async function inserirLinha(tabela: string, linha: Linha): Promise<void> {
  const db = await getDb();
  const colunas = Object.keys(linha);
  await db.execute(
    `INSERT INTO ${tabela} (${colunas.join(", ")}) VALUES (${colunas.map((_, i) => `$${i + 1}`).join(", ")})`,
    colunas.map((c) => linha[c]),
  );
}

/**
 * Apaga a tarefa de vez, com o histórico dela. As horas já trabalhadas continuam nas Horas
 * da semana: cada sessão de foco vira um lançamento à mão com o título e o projeto da tarefa.
 * Devolve o necessário para desfazer (Z).
 */
export async function apagarItem(item: Item): Promise<Alteracao> {
  if (item.status === "em_foco") throw new Error("Pause ou conclua a tarefa em foco antes de apagar.");
  const db = await getDb();
  const [linha] = await db.select<Linha[]>("SELECT * FROM item WHERE id = $1", [item.id]);
  if (!linha) throw new Error("Essa tarefa não existe mais.");
  const eventos = await db.select<Linha[]>("SELECT * FROM evento WHERE item_id = $1", [item.id]);
  const notificacoes = await db.select<Linha[]>("SELECT * FROM notificacao WHERE item_id = $1", [item.id]);
  const filhos: CopiaApagada["filhos"] = [];
  for (const tabela of TABELAS_FILHAS)
    filhos.push({ tabela, linhas: await db.select<Linha[]>(`SELECT * FROM ${tabela} WHERE item_id = $1`, [item.id]) });

  await db.execute("DELETE FROM notificacao WHERE item_id = $1", [item.id]);
  for (const tabela of TABELAS_FILHAS) await db.execute(`DELETE FROM ${tabela} WHERE item_id = $1`, [item.id]);
  await db.execute("DELETE FROM evento WHERE item_id = $1", [item.id]);
  await db.execute("DELETE FROM item WHERE id = $1", [item.id]);
  return { itemId: item.id, anterior: {}, eventos: [], copia: { item: linha, eventos, notificacoes, filhos } };
}

async function restaurarApagado(copia: CopiaApagada): Promise<void> {
  await inserirLinha("item", copia.item);
  for (const e of copia.eventos) await inserirLinha("evento", e);
  for (const n of copia.notificacoes) await inserirLinha("notificacao", n);
  for (const { tabela, linhas } of copia.filhos) for (const l of linhas) await inserirLinha(tabela, l);
}

/** Concluídas e arquivadas, as mexidas por último primeiro. */
export async function listarFechados(limite = 500): Promise<Item[]> {
  const db = await getDb();
  return db.select<Item[]>(
    `${SELECT_ITEM} WHERE item.status IN ('feito', 'arquivado') ORDER BY item.atualizado_em DESC LIMIT $1`,
    [limite],
  );
}

/** Apelidos e nomes já usados, para o autocompletar de @ e # na captura. */
export async function listarSugestoes(): Promise<{ pessoas: string[]; projetos: string[] }> {
  const db = await getDb();
  const pessoas = await db.select<{ apelido: string }[]>("SELECT apelido FROM pessoa ORDER BY apelido");
  const projetos = await db.select<{ nome: string }[]>("SELECT nome FROM projeto ORDER BY nome");
  return { pessoas: pessoas.map((p) => p.apelido), projetos: projetos.map((p) => p.nome) };
}

/**
 * Chegou o dia de cobrar o retorno: os itens aguardando voltam para A fazer, mantendo
 * de quem era a vez (o item mostra "cobrar retorno"). Devolve quantos voltaram.
 */
export async function devolverAguardando(hoje = new Date()): Promise<number> {
  const db = await getDb();
  const { rowsAffected } = await db.execute(
    "UPDATE item SET status = 'a_fazer', espera_tipo_id = NULL, atualizado_em = $1 WHERE status = 'aguardando' AND aguardando_ate <= $2",
    [agoraIso(), dataLocalIso(hoje)],
  );
  return rowsAffected;
}

/** Um item na busca global: o mínimo para achar e abrir. */
export interface ItemBusca {
  id: string;
  titulo: string;
  nota: string | null;
  status: Status;
  pessoa: string | null;
  projeto: string | null;
  link: string | null;
  id_externo: string | null;
  atualizado_em: string;
}

/** Todos os itens, inclusive concluídos e arquivados, para a busca global (o filtro é em `filtrarBusca`). */
export async function itensParaBusca(): Promise<ItemBusca[]> {
  const db = await getDb();
  return db.select<ItemBusca[]>(
    `SELECT item.id, item.titulo, item.nota, item.status, pessoa.apelido AS pessoa, projeto.nome AS projeto,
            item.link, item.id_externo, item.atualizado_em
       FROM item
       LEFT JOIN pessoa ON pessoa.id = item.pessoa_id
       LEFT JOIN projeto ON projeto.id = item.projeto_id
      ORDER BY item.atualizado_em DESC`,
  );
}

/** Um item completo pelo id (qualquer status). */
export async function lerItem(id: string): Promise<Item | null> {
  const db = await getDb();
  const [item] = await db.select<Item[]>(`${SELECT_ITEM} WHERE item.id = $1`, [id]);
  return item ?? null;
}

/** Itens concluídos no intervalo [de, ate), o mais antigo primeiro. */
export async function concluidosEntre(de: Date, ate: Date): Promise<Item[]> {
  const db = await getDb();
  return db.select<Item[]>(
    `${SELECT_ITEM} WHERE item.status = 'feito'
       AND EXISTS (SELECT 1 FROM evento e WHERE e.item_id = item.id AND e.tipo = 'concluido'
                    AND e.timestamp >= $1 AND e.timestamp < $2)
     ORDER BY item.atualizado_em`,
    [de.toISOString(), ate.toISOString()],
  );
}
