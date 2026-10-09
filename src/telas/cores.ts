import type { CorPrioridade } from "../db/prioridades";

/** Etiqueta da prioridade (fundo + texto), legível no tema claro e no escuro. */
export const ETIQUETA_PRIORIDADE: Record<CorPrioridade, string> = {
  vermelho: "bg-red-500/15 text-red-700 dark:text-red-300",
  ambar: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  azul: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  verde: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  roxo: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  cinza: "bg-etiqueta text-tinta-2",
};

/** Bolinha da cor, usada no seletor de cor das configurações. */
export const BOLINHA_PRIORIDADE: Record<CorPrioridade, string> = {
  vermelho: "bg-red-500",
  ambar: "bg-amber-500",
  azul: "bg-blue-500",
  verde: "bg-emerald-500",
  roxo: "bg-violet-500",
  cinza: "bg-stone-400",
};

export const NOME_COR: Record<CorPrioridade, string> = {
  vermelho: "Vermelho",
  ambar: "Âmbar",
  azul: "Azul",
  verde: "Verde",
  roxo: "Roxo",
  cinza: "Cinza",
};
