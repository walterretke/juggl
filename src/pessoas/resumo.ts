import { descreverPrazo } from "../captura/datas";
import type { Item, Status } from "../db/itens";

export const NOME_STATUS: Record<Status, string> = {
  inbox: "Caixa de entrada",
  a_fazer: "A fazer",
  em_foco: "Fazendo agora",
  pausado: "Pausado",
  aguardando: "Aguardando",
  feito: "Concluído",
  arquivado: "Arquivado",
};

/** Status como frase para a pessoa que pediu. */
const FRASE_STATUS: Record<Status, string> = {
  inbox: "anotado, ainda não comecei",
  a_fazer: "na fila",
  em_foco: "fazendo agora",
  pausado: "comecei, está pausado",
  aguardando: "aguardando retorno",
  feito: "concluído",
  arquivado: "arquivado",
};

function dataCurta(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/**
 * Texto pronto para responder "como estão minhas coisas?": uma linha por pedido,
 * com o status e a data prometida. Os concluídos vêm por último.
 */
export function resumoParaPessoa(nome: string, itens: Item[], hoje: Date): string {
  const linhas = itens.map((item) => {
    let linha = `- ${item.titulo}: ${FRASE_STATUS[item.status]}`;
    if (item.status === "feito") linha += ` em ${dataCurta(item.atualizado_em)}`;
    else if (item.prometido_para) {
      const quando = descreverPrazo(item.prometido_para, hoje);
      linha += `, previsto para ${quando.startsWith("atrasado") ? dataCurta(item.prometido_para) : quando}`;
    }
    return linha;
  });
  return [`${nome}, segue como estão seus pedidos:`, ...linhas].join("\n");
}
