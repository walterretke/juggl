import type { CondicaoPersonalizada, Regra } from "./motor";

export interface Nomes {
  pessoas: Map<string, string>;
  projetos: Map<string, string>;
  prioridades: Map<string, string>;
}

const PRAZO: Record<NonNullable<CondicaoPersonalizada["prazo"]>, string> = {
  hoje: "o prazo for hoje",
  atrasado: "estiver atrasado",
  ate_amanha: "vencer até amanhã",
};

/** "Se quem pediu for Carlos e estiver parado há mais de 1 dia, notificar." */
export function descreverPersonalizada(regra: Regra, nomes: Nomes): string {
  const c = regra.condicao;
  const partes: string[] = [];
  if (c.pessoa_id) partes.push(`quem pediu for ${nomes.pessoas.get(c.pessoa_id) ?? "(pessoa removida)"}`);
  if (c.projeto_id) partes.push(`o projeto for ${nomes.projetos.get(c.projeto_id) ?? "(projeto removido)"}`);
  if (c.prioridade_id) partes.push(`a prioridade for ${nomes.prioridades.get(c.prioridade_id) ?? "(removida)"}`);
  if (c.parado_dias) partes.push(`estiver parado há ${c.parado_dias === 1 ? "1 dia" : `${c.parado_dias} dias`} ou mais`);
  if (c.prazo) partes.push(PRAZO[c.prazo]);
  if (c.cobrado) partes.push("alguém já tiver cobrado");
  if (partes.length === 0) return "Sem condição: não dispara.";
  const juntas = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
  const acao = regra.acao.tipo === "do_dia" ? "colocar entre as do dia" : "notificar";
  return `Se ${juntas}, ${acao}.`;
}
