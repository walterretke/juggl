import { dataLocalIso } from "../captura/datas";
import type { Captura } from "../captura/parser";

/** Work item como o Rust devolve (`devops_buscar`). */
export interface ItemDevops {
  id: number;
  titulo: string;
  tipo: string;
  estado: string;
  projeto: string;
  criado_por: string | null;
  descricao: string | null;
  prazo: string | null;
  link: string;
}

/**
 * Aceita o nome da organização ou o endereço colado do navegador:
 * "empresa", "https://dev.azure.com/empresa/Projeto/..." ou "empresa.visualstudio.com".
 */
export function normalizarOrganizacao(texto: string): string {
  const limpo = texto.trim().replace(/^https?:\/\//i, "");
  const antigo = /^([^./]+)\.visualstudio\.com/i.exec(limpo);
  if (antigo) return antigo[1];
  const novo = /^dev\.azure\.com\/([^/?#]+)/i.exec(limpo);
  if (novo) return decodeURIComponent(novo[1]);
  return limpo.split("/")[0];
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Descrição do Azure (HTML) em texto, mantendo as quebras de linha. */
export function htmlParaTexto(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<\/\s*(p|div|li|h\d|tr|ul|ol)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (inteira, nome: string) => {
      if (nome[0] === "#") {
        const codigo = nome[1].toLowerCase() === "x" ? parseInt(nome.slice(2), 16) : parseInt(nome.slice(1), 10);
        return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : inteira;
      }
      return ENTIDADES[nome.toLowerCase()] ?? inteira;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Identificador guardado em `item.id_externo`: organização e número do work item. */
export function idExterno(organizacao: string, id: number): string {
  return `${organizacao.toLowerCase()}/${id}`;
}

const LIMITE_DESCRICAO = 4000;

/** Work item → captura da caixa de entrada (quem pediu é quem criou; prazo pela data local). */
export function paraCaptura(item: ItemDevops, organizacao: string): { captura: Captura; descricao: string | null } {
  const texto = item.descricao ? htmlParaTexto(item.descricao) : "";
  const cabecalho = [item.tipo, `#${item.id}`, item.estado].filter(Boolean).join(" · ");
  const descricao = [cabecalho, texto.slice(0, LIMITE_DESCRICAO)].filter(Boolean).join("\n\n");
  return {
    captura: {
      titulo: item.titulo,
      pessoa: item.criado_por,
      projeto: item.projeto || null,
      prioridade: null,
      prazo: item.prazo ? dataLocalIso(new Date(item.prazo)) : null,
      link: item.link,
      origem: "devops",
      idExterno: idExterno(organizacao, item.id),
    },
    descricao: descricao || null,
  };
}

/** Só os work items que ainda não viraram item no Juggl (mesmo que já arquivados ou feitos). */
export function novos(itens: ItemDevops[], organizacao: string, conhecidos: Set<string>): ItemDevops[] {
  return itens.filter((i) => !conhecidos.has(idExterno(organizacao, i.id)));
}
