/** O que já se sabe de quem abriu o app, para decidir se mostra as boas-vindas. */
export interface SinaisDeUso {
  /** As boas-vindas já foram vistas (ou puladas) neste computador. */
  vistas: boolean;
  /** Itens no banco, de qualquer lista. */
  itens: number;
  /** Dias em que o app foi aberto antes de hoje. */
  diasAntesDeHoje: number;
}

/**
 * Mostra só na primeira abertura de verdade. Quem já usava o Juggl antes das boas-vindas
 * existirem (tem itens ou abriu o app em outro dia) não vê de novo: a tela é revista em
 * Configurações ou pela busca.
 */
export function deveMostrarBoasVindas({ vistas, itens, diasAntesDeHoje }: SinaisDeUso): boolean {
  return !vistas && itens === 0 && diasAntesDeHoje === 0;
}

/** Sistema da máquina, para os detalhes que mudam (Cmd no macOS, permissão de Acessibilidade). */
export function ehMac(plataforma = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  return /Mac/i.test(plataforma);
}
