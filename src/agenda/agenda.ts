import { dataLocalIso } from "../captura/datas";
import type { Item } from "../db/itens";

export type Repeticao = "nao" | "diaria" | "dias_uteis" | "semanal" | "mensal";

/** Um compromisso como fica no banco (tabela `compromisso`). */
export interface Compromisso {
  id: string;
  titulo: string;
  nota: string | null;
  /** AAAA-MM-DD da primeira vez. */
  data: string;
  /** HH:MM; vazio = sem horário. */
  hora_inicio: string | null;
  hora_fim: string | null;
  repete: Repeticao;
  /** Semanal: dias da semana separados por vírgula (0 = domingo). */
  dias_semana: string | null;
  ate: string | null;
  /** Dias pulados, separados por vírgula. */
  excecoes: string | null;
}

/** Uma coisa num dia da agenda: um compromisso (talvez repetido) ou uma tarefa. */
export interface Ocorrencia {
  /** Único na agenda: id do compromisso + dia, ou id da tarefa. */
  chave: string;
  tipo: "compromisso" | "tarefa";
  titulo: string;
  dia: string;
  /** Minutos desde a meia-noite; null = sem horário. */
  inicio: number | null;
  fim: number | null;
  /** Repete (toda semana, todo dia...): fica discreto na visão do mês. */
  recorrente: boolean;
  compromisso?: Compromisso;
  item?: Item;
}

export function deIso(dia: string): Date {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a, m - 1, d);
}

export function somarDias(dia: string, n: number): string {
  const d = deIso(dia);
  return dataLocalIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/** "HH:MM" em minutos. */
export function minutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Minutos em "HH:MM". */
export function hora(min: number): string {
  const limitado = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${String(Math.floor(limitado / 60)).padStart(2, "0")}:${String(limitado % 60).padStart(2, "0")}`;
}

/** Segunda-feira da semana do dia. */
export function inicioDaSemana(dia: string): string {
  const d = deIso(dia);
  return somarDias(dia, -((d.getDay() + 6) % 7));
}

/** Os 42 dias (6 semanas, de segunda a domingo) que a visão do mês mostra. */
export function diasDoMes(dia: string): string[] {
  const d = deIso(dia);
  const primeiro = inicioDaSemana(dataLocalIso(new Date(d.getFullYear(), d.getMonth(), 1)));
  return Array.from({ length: 42 }, (_, i) => somarDias(primeiro, i));
}

/** Se o compromisso acontece no dia. */
export function aconteceEm(c: Compromisso, dia: string): boolean {
  if (dia < c.data || (c.ate && dia > c.ate)) return false;
  if (c.excecoes?.split(",").includes(dia)) return false;
  const d = deIso(dia);
  const semana = d.getDay();
  switch (c.repete) {
    case "nao":
      return dia === c.data;
    case "diaria":
      return true;
    case "dias_uteis":
      return semana !== 0 && semana !== 6;
    case "semanal": {
      const dias = c.dias_semana ? c.dias_semana.split(",").map(Number) : [deIso(c.data).getDay()];
      return dias.includes(semana);
    }
    case "mensal": {
      const alvo = deIso(c.data).getDate();
      const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return d.getDate() === Math.min(alvo, ultimo);
    }
  }
}

/** Todas as vezes que os compromissos acontecem entre `de` e `ate` (inclusive). */
export function ocorrenciasDosCompromissos(compromissos: Compromisso[], de: string, ate: string): Ocorrencia[] {
  const lista: Ocorrencia[] = [];
  for (let dia = de; dia <= ate; dia = somarDias(dia, 1)) {
    for (const c of compromissos) {
      if (!aconteceEm(c, dia)) continue;
      const inicio = c.hora_inicio ? minutos(c.hora_inicio) : null;
      const fim = inicio === null ? null : c.hora_fim ? Math.max(minutos(c.hora_fim), inicio + 15) : inicio + 60;
      lista.push({
        chave: `${c.id}@${dia}`,
        tipo: "compromisso",
        titulo: c.titulo,
        dia,
        inicio,
        fim,
        recorrente: c.repete !== "nao",
        compromisso: c,
      });
    }
  }
  return lista;
}

/**
 * Tarefas na agenda: com horário, no dia e hora marcados; sem horário, na área "sem horário"
 * do dia planejado (Meu dia) ou, se não tiver, do prazo.
 */
export function ocorrenciasDasTarefas(itens: Item[], de: string, ate: string): Ocorrencia[] {
  return itens.flatMap((item) => {
    let dia: string | null;
    let inicio: number | null = null;
    let fim: number | null = null;
    if (item.agenda_inicio) {
      dia = item.agenda_inicio.slice(0, 10);
      inicio = minutos(item.agenda_inicio.slice(11, 16));
      const fimMesmoDia = item.agenda_fim?.slice(0, 10) === dia ? minutos(item.agenda_fim.slice(11, 16)) : null;
      fim = fimMesmoDia !== null && fimMesmoDia > inicio ? fimMesmoDia : Math.min(inicio + 60, 24 * 60);
    } else {
      dia = item.dia_planejado ?? item.prazo;
    }
    if (!dia || dia < de || dia > ate) return [];
    return [{ chave: item.id, tipo: "tarefa" as const, titulo: item.titulo, dia, inicio, fim, recorrente: false, item }];
  });
}

/** Ordem dentro de um dia: sem horário primeiro, depois por hora; as não recorrentes antes. */
export function ordenar(ocorrencias: Ocorrencia[]): Ocorrencia[] {
  return [...ocorrencias].sort(
    (a, b) =>
      (a.inicio ?? -1) - (b.inicio ?? -1) ||
      Number(a.recorrente) - Number(b.recorrente) ||
      a.titulo.localeCompare(b.titulo),
  );
}

/** Posição de um bloco com horário: coluna e quantas colunas dividem o espaço com ele. */
export interface Posicao {
  ocorrencia: Ocorrencia;
  coluna: number;
  colunas: number;
}

/**
 * Arruma os blocos de um dia lado a lado quando os horários se cruzam (como no Google
 * Agenda): cada grupo de blocos que se sobrepõem divide a largura em colunas.
 */
export function arrumarBlocos(ocorrencias: Ocorrencia[]): Posicao[] {
  const comHora = ocorrencias
    .filter((o) => o.inicio !== null)
    .sort((a, b) => a.inicio! - b.inicio! || b.fim! - a.fim!);
  const posicoes: Posicao[] = [];
  let grupo: Posicao[] = [];
  let fimDoGrupo = -1;
  const fecharGrupo = () => {
    const colunas = Math.max(1, ...grupo.map((p) => p.coluna + 1));
    for (const p of grupo) p.colunas = colunas;
    posicoes.push(...grupo);
    grupo = [];
  };
  for (const o of comHora) {
    if (o.inicio! >= fimDoGrupo && grupo.length > 0) fecharGrupo();
    const ocupadas = new Set(grupo.filter((p) => p.ocorrencia.fim! > o.inicio!).map((p) => p.coluna));
    let coluna = 0;
    while (ocupadas.has(coluna)) coluna++;
    grupo.push({ ocorrencia: o, coluna, colunas: 1 });
    fimDoGrupo = Math.max(fimDoGrupo, o.fim!);
  }
  if (grupo.length > 0) fecharGrupo();
  return posicoes;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Título do período: "outubro de 2026", "12 a 18 de outubro", "terça, 13 de outubro". */
export function tituloDoPeriodo(visao: "mes" | "semana" | "dia", dia: string): string {
  const d = deIso(dia);
  if (visao === "mes") return `${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  if (visao === "dia") return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
  const ini = deIso(inicioDaSemana(dia));
  const fim = deIso(somarDias(inicioDaSemana(dia), 6));
  return ini.getMonth() === fim.getMonth()
    ? `${ini.getDate()} a ${fim.getDate()} de ${MESES[fim.getMonth()]}`
    : `${ini.getDate()} de ${MESES[ini.getMonth()]} a ${fim.getDate()} de ${MESES[fim.getMonth()]}`;
}

/** "toda segunda e quarta", "todo dia útil"... */
export function descreverRepeticao(c: Pick<Compromisso, "repete" | "dias_semana" | "data">): string | null {
  if (c.repete === "nao") return null;
  if (c.repete === "diaria") return "todo dia";
  if (c.repete === "dias_uteis") return "todo dia útil";
  if (c.repete === "mensal") return `todo dia ${deIso(c.data).getDate()}`;
  const dias = (c.dias_semana ? c.dias_semana.split(",").map(Number) : [deIso(c.data).getDay()]).sort(
    (a, b) => ((a + 6) % 7) - ((b + 6) % 7),
  );
  const nomes = dias.map((n) => DIAS[n]);
  const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}` : nomes[0];
  return `${dias[0] === 0 || dias[0] === 6 ? "todo" : "toda"} ${lista}`;
}
