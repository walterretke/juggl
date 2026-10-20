import { dataLocalIso } from "../captura/datas";
import type { Item, Quando } from "../db/itens";
import { gruposDoRitual, type GrupoRitual } from "./grupos";

/** Ordem dos momentos do dia, que é também a ordem de Hoje e o ciclo do clique. */
export const QUANDOS: Quando[] = ["manha", "depois_daily", "tarde", "fim_dia"];

export const NOME_QUANDO: Record<Quando, string> = {
  manha: "manhã",
  depois_daily: "depois da daily",
  tarde: "tarde",
  fim_dia: "fim do dia",
};

/** "Quando" de um item que acabou de entrar em Hoje: manhã antes do meio-dia, tarde depois. */
export function quandoPadrao(agora: Date): Quando {
  return agora.getHours() < 12 ? "manha" : agora.getHours() < 17 ? "tarde" : "fim_dia";
}

/** Próximo "quando" no ciclo (o clique na etiqueta). */
export function proximoQuando(atual: Quando | null): Quando {
  return QUANDOS[(QUANDOS.indexOf(atual ?? QUANDOS[QUANDOS.length - 1]) + 1) % QUANDOS.length];
}

export interface Quadro {
  /** Caixa de entrada: o que chegou e ainda não foi triado. */
  chegou: Item[];
  /** As escolhidas para hoje, na ordem do "quando" (inclui o item em foco, se for do dia). */
  hoje: Item[];
  /** O item em foco, seja ou não do dia. */
  fazendo: Item | null;
  /** Em espera (status aguardando): travados por aprovação, terceiros, bloqueio... */
  espera: Item[];
  /** O resto de A fazer, em grupos: o que vence, quem cobrou, pausados e o resto. */
  depois: GrupoRitual[];
}

/** Separa os itens abertos nas colunas de Meu dia. */
export function montarQuadro(itens: Item[], hoje: Date): Quadro {
  const dia = dataLocalIso(hoje);
  const doDia = (i: Item) => i.dia_planejado === dia && i.status !== "inbox" && i.status !== "aguardando";
  const posicao = (i: Item) => (i.quando ? QUANDOS.indexOf(i.quando) : QUANDOS.length);
  return {
    chegou: itens.filter((i) => i.status === "inbox"),
    // Ordenação estável: dentro do mesmo "quando" fica a ordem de prazo e prioridade da consulta.
    hoje: itens.filter(doDia).sort((a, b) => posicao(a) - posicao(b)),
    fazendo: itens.find((i) => i.status === "em_foco") ?? null,
    espera: itens.filter((i) => i.status === "aguardando"),
    depois: gruposDoRitual(
      itens.filter((i) => i.status !== "inbox" && i.status !== "em_foco" && i.status !== "aguardando" && !doDia(i)),
      hoje,
    ),
  };
}
