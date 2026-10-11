import { dataLocalIso } from "../captura/datas";

export type Frequencia = "diaria" | "semanal" | "mensal";

const NOMES_DIA = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

/**
 * Próxima data (AAAA-MM-DD) depois de `depoisDe`: diária pula sábado e domingo; semanal
 * cai no dia da semana `dia` (1 = segunda ... 7 = domingo); mensal cai no dia `dia` do mês,
 * ou no último dia nos meses mais curtos (dia 31 em fevereiro vira 28 ou 29).
 */
export function proximaOcorrencia(frequencia: Frequencia, dia: number | null, depoisDe: Date): string {
  const d = new Date(depoisDe.getFullYear(), depoisDe.getMonth(), depoisDe.getDate() + 1);
  if (frequencia === "diaria") {
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return dataLocalIso(d);
  }
  if (frequencia === "semanal") {
    const alvo = (dia ?? 1) % 7; // getDay(): domingo é 0
    while (d.getDay() !== alvo) d.setDate(d.getDate() + 1);
    return dataLocalIso(d);
  }
  const noMes = (ano: number, mes: number) => new Date(ano, mes, Math.min(dia ?? 1, new Date(ano, mes + 1, 0).getDate()));
  const neste = noMes(d.getFullYear(), d.getMonth());
  return dataLocalIso(neste >= d ? neste : noMes(d.getFullYear(), d.getMonth() + 1));
}

/** Primeira data a partir de hoje (inclusive). */
export function primeiraOcorrencia(frequencia: Frequencia, dia: number | null, hoje: Date): string {
  return proximaOcorrencia(frequencia, dia, new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1));
}

/** "todo dia útil", "toda segunda", "todo dia 5". */
export function descreverFrequencia(frequencia: Frequencia, dia: number | null): string {
  if (frequencia === "diaria") return "todo dia útil";
  if (frequencia === "semanal") {
    const n = dia ?? 1;
    return `${n === 6 || n === 7 ? "todo" : "toda"} ${NOMES_DIA[n]}`;
  }
  return `todo dia ${dia ?? 1}`;
}
