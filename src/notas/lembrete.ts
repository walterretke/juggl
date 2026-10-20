/** Intervalos rápidos da nota, em minutos. */
export const INTERVALOS_RAPIDOS = [15, 30, 60, 120] as const;

export const INTERVALO_PADRAO = 30;

/** Limite do intervalo personalizado: uma semana. */
export const INTERVALO_MAXIMO = 7 * 24 * 60;

export type Unidade = "min" | "h";

const MINUTO_MS = 60 * 1000;

/** "15 min", "1 h", "1 h 30 min", "2 h". */
export function descreverIntervalo(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto} min`;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

/** Intervalo personalizado em minutos, ou null se não for um número válido (inteiro, até uma semana). */
export function interpretarIntervalo(valor: string, unidade: Unidade): number | null {
  const numero = Number(valor.trim().replace(",", "."));
  if (!valor.trim() || !Number.isFinite(numero) || numero <= 0) return null;
  const minutos = Math.round(unidade === "h" ? numero * 60 : numero);
  return minutos >= 1 && minutos <= INTERVALO_MAXIMO ? minutos : null;
}

/** Quando avisar de novo: `intervalo` minutos depois de agora. */
export function proximoAviso(agora: Date, intervaloMin: number): string {
  return new Date(agora.getTime() + intervaloMin * MINUTO_MS).toISOString();
}

/** "às 14:30", ou "amanhã às 09:00", ou "em 16/10 às 09:00" para o próximo aviso. */
export function descreverProximo(iso: string, agora: Date): string {
  const d = new Date(iso);
  const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((dia(d) - dia(agora)) / 86_400_000);
  if (dias <= 0) return `às ${hora}`;
  if (dias === 1) return `amanhã às ${hora}`;
  return `em ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} às ${hora}`;
}

/** O mínimo de uma nota para montar o aviso. */
export interface NotaParaAviso {
  titulo: string;
  descricao: string | null;
  intervalo_min: number;
}

/** Título e corpo da notificação: uma nota sozinha, ou um resumo quando várias vencem juntas. */
export function textoDoAviso(notas: NotaParaAviso[]): { titulo: string; corpo: string } | null {
  if (notas.length === 0) return null;
  if (notas.length === 1) {
    const [nota] = notas;
    const primeiraLinha = nota.descricao?.split("\n").find((l) => l.trim())?.trim();
    const lembra = `Lembro de novo em ${descreverIntervalo(nota.intervalo_min)} se ainda não estiver resolvido.`;
    return { titulo: `Não esqueça: ${nota.titulo}`, corpo: primeiraLinha ? `${primeiraLinha}\n${lembra}` : lembra };
  }
  const linhas = notas.slice(0, 4).map((n) => `• ${n.titulo}`);
  if (notas.length > 4) linhas.push(`e mais ${notas.length - 4}.`);
  return { titulo: `${notas.length} lembretes para não esquecer`, corpo: linhas.join("\n") };
}

/** O intervalo como fica na tela: um dos rápidos, ou "Outro" com o valor digitado. */
export type EscolhaIntervalo = { tipo: "rapido"; minutos: number } | { tipo: "outro"; valor: string; unidade: Unidade };

/** Escolha que mostra `minutos`: o rápido igual, ou "Outro" em horas (se der conta exata) ou minutos. */
export function escolhaDoIntervalo(minutos: number): EscolhaIntervalo {
  if ((INTERVALOS_RAPIDOS as readonly number[]).includes(minutos)) return { tipo: "rapido", minutos };
  return minutos % 60 === 0 ? { tipo: "outro", valor: String(minutos / 60), unidade: "h" } : { tipo: "outro", valor: String(minutos), unidade: "min" };
}

/** Minutos da escolha, ou null se o "Outro" digitado não vale. */
export function minutosDaEscolha(escolha: EscolhaIntervalo): number | null {
  return escolha.tipo === "rapido" ? escolha.minutos : interpretarIntervalo(escolha.valor, escolha.unidade);
}
