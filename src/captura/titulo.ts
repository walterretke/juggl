/** Título sugerido quando o pedido chega só com descrição: "Atividade 1", "Atividade 2"... */
export function tituloPadrao(numero: number): string {
  return `Atividade ${numero}`;
}

/**
 * Decide o título a gravar. Título vazio com descrição vira "Atividade N";
 * sem título nem descrição não há o que salvar (null). `usouPadrao` diz se o
 * contador deve avançar: só quando o título sugerido foi mesmo usado.
 */
export function resolverTitulo(
  titulo: string,
  descricao: string,
  numero: number,
): { titulo: string; usouPadrao: boolean } | null {
  const padrao = tituloPadrao(numero);
  const limpo = titulo.trim();
  if (limpo) return { titulo: limpo, usouPadrao: limpo === padrao };
  if (descricao.trim()) return { titulo: padrao, usouPadrao: true };
  return null;
}
