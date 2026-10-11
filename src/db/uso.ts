import { getDb } from ".";
import { dataLocalIso } from "../captura/datas";
import type { DiaDeUso } from "../uso/criterios";
import { gravarConfig, lerConfig } from "./config";
import { agoraIso, novoId } from "./ids";

const CHAVE_INICIO = "uso_inicio";
const CHAVE_COLEGAS = "colegas_interessados";

/** Marca o dia de hoje como dia de uso (chamado ao abrir e a cada minuto). */
export async function registrarDiaDeUso(agora = new Date()): Promise<void> {
  const db = await getDb();
  await db.execute("INSERT OR IGNORE INTO dia_de_uso (dia, aberto_em) VALUES ($1, $2)", [dataLocalIso(agora), agora.toISOString()]);
}

/** Quanto levou o apontamento da semana (da abertura de Horas até copiar ou exportar). */
export async function registrarApontamento(semana: string, duracaoMs: number): Promise<void> {
  const db = await getDb();
  await db.execute("INSERT INTO apontamento (id, semana, duracao_ms, criado_em) VALUES ($1, $2, $3, $4)", [
    novoId(),
    semana,
    Math.round(duracaoMs),
    agoraIso(),
  ]);
}

export interface Irritacao {
  id: string;
  texto: string;
  tela: string | null;
  criada_em: string;
  resolvida_em: string | null;
}

export async function anotarIrritacao(texto: string, tela: string | null): Promise<void> {
  const db = await getDb();
  await db.execute("INSERT INTO irritacao (id, texto, tela, criada_em) VALUES ($1, $2, $3, $4)", [
    novoId(),
    texto.trim(),
    tela,
    agoraIso(),
  ]);
}

export async function alternarIrritacaoResolvida(i: Irritacao): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE irritacao SET resolvida_em = $1 WHERE id = $2", [i.resolvida_em ? null : agoraIso(), i.id]);
}

export async function removerIrritacao(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM irritacao WHERE id = $1", [id]);
}

export interface DadosDeUso {
  inicio: string;
  dias: DiaDeUso[];
  /** Primeira cópia ou exportação de cada semana apontada, mais recente primeiro. */
  apontamentos: { semana: string; duracao_ms: number }[];
  cobrancas: number;
  /** Pedidos cobrados duas vezes ou mais no período. */
  maisCobrados: { titulo: string; pessoa: string | null; vezes: number }[];
  promessasAtrasadas: number;
  colegas: number;
  irritacoes: Irritacao[];
}

export async function lerDadosDeUso(hoje = new Date()): Promise<DadosDeUso> {
  const db = await getDb();
  const inicio = (await lerConfig(CHAVE_INICIO)) ?? dataLocalIso(hoje);
  const desde = new Date(`${inicio}T00:00:00`).toISOString();
  const [dias, apontamentos, [cobrancas], maisCobrados, [promessas], colegas, irritacoes] = await Promise.all([
    db.select<{ dia: string; ritual: number }[]>("SELECT dia, ritual FROM dia_de_uso WHERE dia >= $1", [inicio]),
    db.select<{ semana: string; duracao_ms: number }[]>(
      `SELECT a.semana, a.duracao_ms FROM apontamento a
        WHERE a.criado_em >= $1
          AND a.criado_em = (SELECT MIN(b.criado_em) FROM apontamento b WHERE b.semana = a.semana)
        ORDER BY a.semana DESC`,
      [desde],
    ),
    db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM evento WHERE tipo = 'cobrado' AND timestamp >= $1", [desde]),
    db.select<{ titulo: string; pessoa: string | null; vezes: number }[]>(
      `SELECT item.titulo, pessoa.apelido AS pessoa, COUNT(*) AS vezes
         FROM evento JOIN item ON item.id = evento.item_id LEFT JOIN pessoa ON pessoa.id = item.pessoa_id
        WHERE evento.tipo = 'cobrado' AND evento.timestamp >= $1
        GROUP BY item.id HAVING COUNT(*) >= 2 ORDER BY vezes DESC LIMIT 5`,
      [desde],
    ),
    db.select<{ n: number }[]>(
      `SELECT COUNT(*) AS n FROM item
        WHERE prometido_para < $1 AND status NOT IN ('feito', 'arquivado')`,
      [dataLocalIso(hoje)],
    ),
    lerConfig(CHAVE_COLEGAS),
    db.select<Irritacao[]>(
      "SELECT id, texto, tela, criada_em, resolvida_em FROM irritacao ORDER BY resolvida_em IS NOT NULL, criada_em DESC",
    ),
  ]);
  return {
    inicio,
    dias: dias.map((d) => ({ dia: d.dia, ritual: d.ritual === 1 })),
    apontamentos,
    cobrancas: cobrancas?.n ?? 0,
    maisCobrados,
    promessasAtrasadas: promessas?.n ?? 0,
    colegas: Number(colegas) || 0,
    irritacoes,
  };
}

export async function recomecarPeriodo(hoje = new Date()): Promise<void> {
  await gravarConfig(CHAVE_INICIO, dataLocalIso(hoje));
}

export async function mudarColegas(n: number): Promise<void> {
  await gravarConfig(CHAVE_COLEGAS, String(Math.max(0, n)));
}
