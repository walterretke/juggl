import { dataLocalIso } from "../captura/datas";
import type { Item } from "../db/itens";

export interface GrupoRitual {
  chave: "urgentes" | "cobrados" | "pausados" | "a_fazer" | "inbox";
  titulo: string;
  itens: Item[];
}

/**
 * Separa os candidatos do ritual no que a manhã precisa ver primeiro: o que vence
 * (prazo ou promessa até amanhã), quem cobrou, o que ficou pausado, o resto de
 * A fazer e a caixa de entrada. Cada item aparece num grupo só; grupos vazios saem.
 */
export function gruposDoRitual(itens: Item[], hoje: Date): GrupoRitual[] {
  const amanha = dataLocalIso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1));
  const vence = (i: Item) => (i.prazo !== null && i.prazo <= amanha) || (i.prometido_para !== null && i.prometido_para <= amanha);
  const grupos: GrupoRitual[] = [
    { chave: "urgentes", titulo: "Vencendo ou atrasados", itens: [] },
    { chave: "cobrados", titulo: "Alguém cobrou", itens: [] },
    { chave: "pausados", titulo: "Pausados", itens: [] },
    { chave: "a_fazer", titulo: "Resto de A fazer", itens: [] },
    { chave: "inbox", titulo: "Ainda na caixa de entrada", itens: [] },
  ];
  const [urgentes, cobrados, pausados, aFazer, inbox] = grupos;
  for (const item of itens) {
    if (vence(item)) urgentes.itens.push(item);
    else if (item.cobrancas > 0) cobrados.itens.push(item);
    else if (item.status === "pausado" || item.status === "em_foco") pausados.itens.push(item);
    else if (item.status === "inbox") inbox.itens.push(item);
    else aFazer.itens.push(item);
  }
  // Atrasados primeiro, pela data mais antiga entre prazo e promessa.
  const limite = (i: Item) => [i.prazo, i.prometido_para].filter((d): d is string => d !== null).sort()[0];
  urgentes.itens.sort((a, b) => limite(a).localeCompare(limite(b)));
  cobrados.itens.sort((a, b) => b.cobrancas - a.cobrancas);
  return grupos.filter((g) => g.itens.length > 0);
}
