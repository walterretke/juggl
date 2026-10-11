import { getDb } from ".";
import { dataLocalIso } from "../captura/datas";
import { primeiraOcorrencia, proximaOcorrencia, type Frequencia } from "../recorrencia/datas";
import { agoraIso, novoId } from "./ids";
import { buscarOuCriarPessoa, buscarOuCriarProjeto, registrarEvento } from "./itens";

export interface Recorrencia {
  id: string;
  titulo: string;
  nota: string | null;
  pessoa: string | null;
  projeto: string | null;
  prioridade_id: string | null;
  frequencia: Frequencia;
  dia: number | null;
  proxima: string;
}

export async function listarRecorrencias(): Promise<Recorrencia[]> {
  const db = await getDb();
  return db.select<Recorrencia[]>(
    `SELECT r.id, r.titulo, r.nota, pessoa.apelido AS pessoa, projeto.nome AS projeto, r.prioridade_id,
            r.frequencia, r.dia, r.proxima
       FROM recorrencia r
       LEFT JOIN pessoa ON pessoa.id = r.pessoa_id
       LEFT JOIN projeto ON projeto.id = r.projeto_id
      WHERE r.ativa = 1
      ORDER BY r.proxima, r.titulo`,
  );
}

export interface NovaRecorrencia {
  titulo: string;
  pessoa: string;
  projeto: string;
  frequencia: Frequencia;
  dia: number | null;
}

export async function criarRecorrencia(r: NovaRecorrencia, hoje = new Date()): Promise<void> {
  const db = await getDb();
  const pessoaId = r.pessoa.trim() ? await buscarOuCriarPessoa(r.pessoa.replace(/^@/, "")) : null;
  const projetoId = r.projeto.trim() ? await buscarOuCriarProjeto(r.projeto.replace(/^#/, "")) : null;
  await db.execute(
    `INSERT INTO recorrencia (id, titulo, pessoa_id, projeto_id, frequencia, dia, proxima, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [novoId(), r.titulo.trim(), pessoaId, projetoId, r.frequencia, r.dia, primeiraOcorrencia(r.frequencia, r.dia, hoje), agoraIso()],
  );
}

export async function removerRecorrencia(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM recorrencia WHERE id = $1", [id]);
}

/**
 * Cria na caixa de entrada os itens recorrentes que chegaram ao dia. Se o app ficou
 * fechado por vários dias, cria um só (não uma pilha) e pula para a próxima data.
 * Devolve os títulos criados.
 */
export async function gerarRecorrentes(hoje = new Date()): Promise<string[]> {
  const db = await getDb();
  const dia = dataLocalIso(hoje);
  const vencidas = await db.select<
    { id: string; titulo: string; nota: string | null; pessoa_id: string | null; projeto_id: string | null; prioridade_id: string | null; frequencia: Frequencia; dia: number | null }[]
  >("SELECT * FROM recorrencia WHERE ativa = 1 AND proxima <= $1", [dia]);
  const criados: string[] = [];
  for (const r of vencidas) {
    // Avança antes de criar: se o app fechar no meio, no máximo falta um item, nunca sobra.
    const { rowsAffected } = await db.execute("UPDATE recorrencia SET proxima = $1 WHERE id = $2 AND proxima <= $3", [
      proximaOcorrencia(r.frequencia, r.dia, hoje),
      r.id,
      dia,
    ]);
    if (rowsAffected === 0) continue; // outra janela já criou
    const id = novoId();
    const agora = agoraIso();
    await db.execute(
      `INSERT INTO item (id, titulo, nota, status, prioridade_id, pessoa_id, projeto_id, origem, criado_em, atualizado_em)
       VALUES ($1, $2, $3, 'inbox', $4, $5, $6, 'manual', $7, $7)`,
      [id, r.titulo, r.nota, r.prioridade_id, r.pessoa_id, r.projeto_id, agora],
    );
    await registrarEvento(id, "criado", { recorrencia_id: r.id }, agora);
    criados.push(r.titulo);
  }
  return criados;
}
