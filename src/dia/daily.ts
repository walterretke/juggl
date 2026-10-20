import { dataLocalIso } from "../captura/datas";
import type { Item } from "../db/itens";

/** O dia útil anterior: na segunda, a sexta; nos outros dias, ontem (sábado e domingo pulam). */
export function diaUtilAnterior(hoje: Date): Date {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

export interface DadosDaily {
  /** Concluídos no dia útil anterior. */
  ontem: Item[];
  /** Abertos: os do dia (escolhidos para hoje) aparecem em "Hoje"; o em foco também. */
  abertos: Item[];
  /** Itens em Aguardando, para os bloqueios. */
  aguardando: Item[];
}

/**
 * Texto para a daily: o que foi feito no dia útil anterior, o que é para hoje e o que está
 * travado esperando alguém. Sem plano para hoje, usa o que está em foco e o que vence hoje.
 */
export function resumoDaDaily({ ontem, abertos, aguardando }: DadosDaily, hoje: Date): string {
  const dia = dataLocalIso(hoje);
  const anterior = diaUtilAnterior(hoje);
  const ontemMesmo = dataLocalIso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1));
  const rotuloOntem = dataLocalIso(anterior) === ontemMesmo ? "Ontem" : "Sexta";
  const doDia = abertos.filter((i) => i.status === "em_foco" || (i.dia_planejado === dia && i.status !== "inbox"));
  const paraHoje =
    doDia.length > 0 ? doDia : abertos.filter((i) => i.status !== "inbox" && (i.prazo === dia || i.prometido_para === dia));
  const lista = (itens: string[], vazio: string) => (itens.length === 0 ? [`- ${vazio}`] : itens.map((t) => `- ${t}`));
  return [
    `${rotuloOntem}:`,
    ...lista(
      ontem.map((i) => i.titulo),
      "nada concluído",
    ),
    "Hoje:",
    ...lista(
      paraHoje.map((i) => (i.status === "em_foco" ? `${i.titulo} (em andamento)` : i.titulo)),
      "ainda planejando",
    ),
    "Bloqueios:",
    ...lista(
      aguardando.map((i) =>
        i.espera
          ? `${i.titulo}: ${i.espera}${i.aguardando_quem ? ` (${i.aguardando_quem})` : ""}`
          : `${i.titulo}${i.aguardando_quem ? `: aguardando ${i.aguardando_quem}` : ": aguardando retorno"}`,
      ),
      "nenhum",
    ),
  ].join("\n");
}
