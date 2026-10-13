import { getDb } from ".";
import type { Compromisso, Repeticao } from "../agenda/agenda";
import { agoraIso, novoId } from "./ids";
import { SELECT_ITEM, type Item } from "./itens";

/** Todos os compromissos que podem cair no intervalo (os repetidos que ainda valem). */
export async function compromissosEntre(de: string, ate: string): Promise<Compromisso[]> {
  const db = await getDb();
  return db.select<Compromisso[]>(
    `SELECT id, titulo, nota, data, hora_inicio, hora_fim, repete, dias_semana, ate, excecoes FROM compromisso
      WHERE data <= $2 AND (repete != 'nao' OR data >= $1) AND (ate IS NULL OR ate >= $1)`,
    [de, ate],
  );
}

/** Tarefas que aparecem na agenda do intervalo: com horário, planejadas ou com prazo nele. */
export async function tarefasEntre(de: string, ate: string): Promise<Item[]> {
  const db = await getDb();
  return db.select<Item[]>(
    `${SELECT_ITEM} WHERE item.status != 'arquivado'
       AND (substr(item.agenda_inicio, 1, 10) BETWEEN $1 AND $2
            OR item.dia_planejado BETWEEN $1 AND $2
            OR item.prazo BETWEEN $1 AND $2)`,
    [de, ate],
  );
}

export interface DadosCompromisso {
  titulo: string;
  nota: string | null;
  data: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  repete: Repeticao;
  dias_semana: string | null;
  ate: string | null;
}

export async function criarCompromisso(c: DadosCompromisso): Promise<string> {
  const db = await getDb();
  const id = novoId();
  await db.execute(
    `INSERT INTO compromisso (id, titulo, nota, data, hora_inicio, hora_fim, repete, dias_semana, ate, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, c.titulo.trim(), c.nota, c.data, c.hora_inicio, c.hora_fim, c.repete, c.dias_semana, c.ate, agoraIso()],
  );
  return id;
}

export async function alterarCompromisso(id: string, c: DadosCompromisso): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE compromisso SET titulo = $1, nota = $2, data = $3, hora_inicio = $4, hora_fim = $5, repete = $6,
            dias_semana = $7, ate = $8 WHERE id = $9`,
    [c.titulo.trim(), c.nota, c.data, c.hora_inicio, c.hora_fim, c.repete, c.dias_semana, c.ate, id],
  );
}

export async function apagarCompromisso(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM compromisso WHERE id = $1", [id]);
}

/** Tira só um dia de um compromisso que repete. */
export async function pularDia(id: string, dia: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE compromisso SET excecoes = CASE WHEN excecoes IS NULL OR excecoes = '' THEN $1 ELSE excecoes || ',' || $1 END WHERE id = $2",
    [dia, id],
  );
}
