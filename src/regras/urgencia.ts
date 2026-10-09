import { dataLocalIso, DIA_MS, inicioDoDia } from "../captura/datas";
import type { Item } from "../db/itens";

/** Pesos da pontuação de urgência (valores iniciais do plano). */
export const PESOS = {
  prazo: { atrasado: 50, hoje: 40, amanha: 25, semana: 10 },
  cobranca: 15,
  cobrancaMax: 45,
  esperaPorDia: 2,
  esperaMax: 20,
  /** De baixo para cima nas prioridades: a última vale 0, a penúltima 10, as outras 20. */
  prioridadePorDegrau: 10,
  prioridadeMax: 20,
  doDia: 15,
};

/** Diferença mínima para avisar ao começar um foco. */
export const DIFERENCA_ALERTA = 30;

export type Componente = "prazo" | "cobranca" | "espera" | "prioridade" | "dia";

export interface Parte {
  componente: Componente;
  pontos: number;
  /** Motivo em português, para a explicação ("vence hoje"). */
  motivo: string;
}

export interface Urgencia {
  total: number;
  partes: Parte[];
}

function deIso(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

function diasAte(iso: string, agora: Date): number {
  return Math.round((deIso(iso).getTime() - inicioDoDia(agora).getTime()) / DIA_MS);
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/** Pontos de uma data limite (prazo ou promessa) e o motivo. */
function pontosDeData(iso: string, agora: Date, promessa: boolean): Omit<Parte, "componente"> | null {
  const dias = diasAte(iso, agora);
  // Até domingo desta semana (getDay: domingo = 0).
  const ateDomingo = (7 - agora.getDay()) % 7;
  const verbo = promessa ? "você prometeu para" : "vence";
  if (dias < 0) return { pontos: PESOS.prazo.atrasado, motivo: promessa ? "a promessa já passou" : "está atrasado" };
  if (dias === 0) return { pontos: PESOS.prazo.hoje, motivo: `${verbo} hoje` };
  if (dias === 1) return { pontos: PESOS.prazo.amanha, motivo: `${verbo} amanhã` };
  if (dias <= ateDomingo) return { pontos: PESOS.prazo.semana, motivo: `${verbo} esta semana` };
  return null;
}

/**
 * Pontuação de urgência, com regras transparentes:
 * prazo (ou promessa, o que pesar mais) + cobranças + dias parado + prioridade + escolhido no ritual.
 * `pontosPrioridade` vem de `pontosDasPrioridades`.
 */
export function pontuar(item: Item, agora: Date, pontosPrioridade: Map<string, number>): Urgencia {
  const partes: Parte[] = [];

  const datas = [
    item.prazo && pontosDeData(item.prazo, agora, false),
    item.prometido_para && pontosDeData(item.prometido_para, agora, true),
  ].filter((p): p is Omit<Parte, "componente"> => !!p);
  if (datas.length > 0) {
    const maior = datas.reduce((a, b) => (b.pontos > a.pontos ? b : a));
    partes.push({ componente: "prazo", ...maior });
  }

  if (item.cobrancas > 0) {
    partes.push({
      componente: "cobranca",
      pontos: Math.min(item.cobrancas * PESOS.cobranca, PESOS.cobrancaMax),
      motivo: `${item.pessoa ?? "quem pediu"} já cobrou ${plural(item.cobrancas, "vez", "vezes")}`,
    });
  }

  const parado = Math.floor((agora.getTime() - new Date(item.atualizado_em).getTime()) / DIA_MS);
  if (parado > 0) {
    partes.push({
      componente: "espera",
      pontos: Math.min(parado * PESOS.esperaPorDia, PESOS.esperaMax),
      motivo: `está parado há ${plural(parado, "dia", "dias")}`,
    });
  }

  const daPrioridade = item.prioridade_id ? (pontosPrioridade.get(item.prioridade_id) ?? 0) : 0;
  if (daPrioridade > 0) {
    partes.push({ componente: "prioridade", pontos: daPrioridade, motivo: `a prioridade é ${item.prioridade}` });
  }

  if (item.dia_planejado === dataLocalIso(agora)) {
    partes.push({ componente: "dia", pontos: PESOS.doDia, motivo: "é uma das 3 do dia" });
  }

  partes.sort((a, b) => b.pontos - a.pontos);
  return { total: partes.reduce((soma, p) => soma + p.pontos, 0), partes };
}

/**
 * Pontos de cada prioridade, contando de baixo: com Alta, Média e Baixa dá 20, 10 e 0;
 * com Urgente, Alta, Média e Baixa dá 20, 20, 10 e 0. `ids` vem na ordem das configurações.
 */
export function pontosDasPrioridades(ids: string[]): Map<string, number> {
  return new Map(
    ids.map((id, i) => [id, Math.min((ids.length - 1 - i) * PESOS.prioridadePorDegrau, PESOS.prioridadeMax)]),
  );
}

/** "vence hoje e Carlos já cobrou 2 vezes": os dois motivos que mais pesam. */
export function explicar(urgencia: Urgencia): string {
  return urgencia.partes
    .slice(0, 2)
    .map((p) => p.motivo)
    .join(" e ");
}

/** Pontos que só mudam por um evento novo (prazo chegou, nova cobrança). */
export function pontosDeEvento(u: Urgencia): number {
  return u.partes.filter((p) => p.componente === "prazo" || p.componente === "cobranca").reduce((s, p) => s + p.pontos, 0);
}

export interface Alerta {
  focoId: string;
  outro: Item;
  pontosFoco: number;
  pontosOutro: number;
  explicacao: string;
}

/** Quando cada par (foco, outro) foi avisado ou dispensado. */
export interface Historico {
  /** ISO do último aviso, por par `foco:outro`. */
  avisados: Record<string, string>;
  /** "Continuar": pontos do outro na hora; só avisa de novo se ele subir. */
  ignorados: Record<string, number>;
  /** "Adiar 30 min": nada até esta hora (ISO). */
  adiadoAte: string | null;
}

export const HISTORICO_VAZIO: Historico = { avisados: {}, ignorados: {}, adiadoAte: null };

export const UMA_HORA_MS = 60 * 60 * 1000;

export function chavePar(focoId: string, outroId: string): string {
  return `${focoId}:${outroId}`;
}

/**
 * Detector de prioridade errada. Avisa quando outro item aberto:
 * - está pelo menos 30 pontos à frente do foco; ou
 * - passou à frente durante o foco por um evento novo (prazo ou cobrança), comparando
 *   com a pontuação do começo do foco (`inicio`).
 * Nunca mais de uma vez por hora para o mesmo par; respeita "continuar" e "adiar".
 */
export function detectarPrioridadeErrada(
  foco: Item,
  itens: Item[],
  agora: Date,
  pontosPrioridade: Map<string, number>,
  historico: Historico,
  inicio: Map<string, Urgencia> | null = null,
): Alerta | null {
  if (historico.adiadoAte && new Date(historico.adiadoAte) > agora) return null;
  const doFoco = pontuar(foco, agora, pontosPrioridade);
  const focoNoInicio = inicio?.get(foco.id);

  let melhor: Alerta | null = null;
  for (const outro of itens) {
    if (outro.id === foco.id || (outro.status !== "a_fazer" && outro.status !== "pausado")) continue;
    const u = pontuar(outro, agora, pontosPrioridade);
    const diferenca = u.total - doFoco.total;
    if (diferenca <= 0) continue;

    const antes = inicio?.get(outro.id);
    const ultrapassou =
      !!antes && !!focoNoInicio && antes.total <= focoNoInicio.total && pontosDeEvento(u) > pontosDeEvento(antes);
    if (diferenca < DIFERENCA_ALERTA && !ultrapassou) continue;

    const par = chavePar(foco.id, outro.id);
    const ultimo = historico.avisados[par];
    if (ultimo && agora.getTime() - new Date(ultimo).getTime() < UMA_HORA_MS) continue;
    const ignorado = historico.ignorados[par];
    if (ignorado !== undefined && u.total <= ignorado) continue;

    if (!melhor || u.total > melhor.pontosOutro) {
      melhor = { focoId: foco.id, outro, pontosFoco: doFoco.total, pontosOutro: u.total, explicacao: explicar(u) };
    }
  }
  return melhor;
}
