import { dataLocalIso } from "../captura/datas";

/** O período de uso real do plano: 4 semanas, 20 dias úteis. */
export const DIAS_UTEIS_DO_PERIODO = 20;
export const META_DIAS_USADOS = 18;
export const META_APONTAMENTO_MS = 5 * 60 * 1000;

export interface DiaDeUso {
  dia: string;
  ritual: boolean;
}

function deIso(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

function util(data: Date): boolean {
  return data.getDay() !== 0 && data.getDay() !== 6;
}

/** Os 20 dias úteis do período, a partir do início (o próprio início conta se for útil). */
export function diasUteisDoPeriodo(inicio: string): string[] {
  const dias: string[] = [];
  for (let d = deIso(inicio); dias.length < DIAS_UTEIS_DO_PERIODO; d.setDate(d.getDate() + 1)) {
    if (util(d)) dias.push(dataLocalIso(d));
  }
  return dias;
}

export interface ResumoDoPeriodo {
  /** Dias úteis do período até hoje (inclusive). */
  decorridos: number;
  usados: number;
  rituais: number;
  /** Ainda dá para chegar a 18 de 20? */
  metaPossivel: boolean;
  fim: string;
  terminou: boolean;
}

export function resumirPeriodo(inicio: string, dias: DiaDeUso[], hoje: Date): ResumoDoPeriodo {
  const periodo = diasUteisDoPeriodo(inicio);
  const diaHoje = dataLocalIso(hoje);
  const passados = periodo.filter((d) => d <= diaHoje);
  const porDia = new Map(dias.map((d) => [d.dia, d]));
  const usados = passados.filter((d) => porDia.has(d)).length;
  const rituais = passados.filter((d) => porDia.get(d)?.ritual).length;
  const faltam = periodo.length - passados.length;
  return {
    decorridos: passados.length,
    usados,
    rituais,
    metaPossivel: usados + faltam >= META_DIAS_USADOS,
    fim: periodo[periodo.length - 1],
    terminou: diaHoje >= periodo[periodo.length - 1],
  };
}

/** Lista das anotações abertas, pronta para colar numa mensagem. */
export function listaDeIrritacoes(itens: { texto: string; tela: string | null; criada_em: string }[]): string {
  return itens
    .map((i) => {
      const data = new Date(i.criada_em);
      const dia = `${String(data.getDate()).padStart(2, "0")}/${String(data.getMonth() + 1).padStart(2, "0")}`;
      return `- ${i.texto} (${[dia, i.tela].filter(Boolean).join(", ")})`;
    })
    .join("\n");
}
