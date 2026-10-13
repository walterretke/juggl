import type { Item, Lista, Status } from "../db/itens";

/**
 * Para onde volta uma tarefa concluída ou arquivada: a lista em que estava antes.
 * Em foco ou pausada volta para A fazer; sem registro (as antigas), também.
 */
export function destinoAoRestaurar(item: Pick<Item, "status_anterior">): Lista {
  const anterior: Status | null = item.status_anterior;
  if (anterior === "inbox" || anterior === "aguardando") return anterior;
  return "a_fazer";
}

export const NOME_LISTA: Record<Lista, string> = {
  inbox: "Caixa de entrada",
  a_fazer: "A fazer",
  aguardando: "Aguardando",
};
