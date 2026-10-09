import type { Item } from "../db/itens";

/** Item de teste com valores neutros; `extra` sobrescreve o que o teste precisa. */
export function item(id: string, extra: Partial<Item> = {}): Item {
  return {
    id,
    titulo: id,
    status: "a_fazer",
    prioridade_id: null,
    prioridade: null,
    prioridade_cor: null,
    prazo: null,
    prometido_para: null,
    dia_planejado: null,
    link: null,
    origem: "manual",
    id_externo: null,
    criado_em: "2026-10-01T10:00:00.000Z",
    atualizado_em: "2026-10-01T10:00:00.000Z",
    pessoa_id: null,
    projeto_id: null,
    pessoa: null,
    projeto: null,
    nota_pausa: null,
    tempo_ms: 0,
    cobrancas: 0,
    ultima_cobranca: null,
    ...extra,
  };
}
