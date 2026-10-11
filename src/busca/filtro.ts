import { normalizarNome } from "../captura/parser";
import type { ItemBusca } from "../db/itens";

/** Sem acento e em minúsculas, mantendo os espaços (para casar palavra por palavra). */
function dobrar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/**
 * Itens que têm todas as palavras do termo no título, descrição, quem pediu, projeto
 * ou id externo, ignorando acentos. Título que casa vem primeiro; abertos antes de
 * concluídos e arquivados; depois o mais recente.
 */
export function filtrarBusca(itens: ItemBusca[], termo: string, limite = 30): ItemBusca[] {
  const palavras = dobrar(termo).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [];
  const fechado = (i: ItemBusca) => i.status === "feito" || i.status === "arquivado";
  const pontuados = itens.flatMap((i) => {
    const titulo = dobrar(i.titulo);
    const resto = dobrar([i.nota, i.pessoa, i.projeto, i.id_externo].filter(Boolean).join(" "));
    // Pessoa e projeto com _ ("@carla_dias") também casam com "carla dias".
    const extra = normalizarNome([i.pessoa, i.projeto].filter(Boolean).join(" "));
    if (!palavras.every((p) => titulo.includes(p) || resto.includes(p) || extra.includes(p))) return [];
    const noTitulo = palavras.every((p) => titulo.includes(p));
    return [{ i, ordem: (noTitulo ? 0 : 2) + (fechado(i) ? 1 : 0) }];
  });
  return pontuados
    .sort((a, b) => a.ordem - b.ordem || b.i.atualizado_em.localeCompare(a.i.atualizado_em))
    .slice(0, limite)
    .map((p) => p.i);
}
