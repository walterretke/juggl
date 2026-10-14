/** Quanto antes do prazo avisar e de quanto em quanto tempo repetir, para uma prioridade. */
export interface AvisoPrazo {
  /** Começa a avisar quando faltam até tantas horas (0 desliga o aviso). */
  horas: number;
  /** Repete o aviso a cada tantas horas até vencer (0 avisa uma vez só). */
  repetirHoras: number;
}

/** O que foi gravado nas Configurações, por id de prioridade. */
export type AvisosPorPrioridade = Record<string, AvisoPrazo>;

/**
 * Padrão pela posição na lista de prioridades: a mais urgente avisa um dia antes e repete a
 * cada 2 horas; a segunda avisa 8 horas antes e repete a cada 4; as outras avisam uma vez,
 * com a antecedência da regra Prazo chegando.
 */
export function avisoPadrao(posicao: number, horasDaRegra: number): AvisoPrazo {
  if (posicao === 0) return { horas: 24, repetirHoras: 2 };
  if (posicao === 1) return { horas: 8, repetirHoras: 4 };
  return { horas: horasDaRegra, repetirHoras: 0 };
}

function numero(valor: unknown, padrao: number): number {
  const n = Number(valor);
  return valor !== null && valor !== undefined && valor !== "" && Number.isFinite(n) && n >= 0 ? n : padrao;
}

/** O aviso de cada prioridade (na ordem da lista), com o padrão onde nada foi gravado. */
export function avisosDasPrioridades(
  prioridades: { id: string }[],
  salvo: unknown,
  horasDaRegra: number,
): AvisosPorPrioridade {
  const gravado = salvo && typeof salvo === "object" ? (salvo as Record<string, Partial<AvisoPrazo>>) : {};
  return Object.fromEntries(
    prioridades.map((p, i) => {
      const padrao = avisoPadrao(i, horasDaRegra);
      const g = gravado[p.id] ?? {};
      return [p.id, { horas: numero(g.horas, padrao.horas), repetirHoras: numero(g.repetirHoras, padrao.repetirHoras) }];
    }),
  );
}

/** Lê o JSON gravado; texto estragado vale como nada gravado. */
export function lerAvisosGravados(texto: string | null): unknown {
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}
