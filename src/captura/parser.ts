import { dataLocalIso, DIA_MS, inicioDoDia } from "./datas";
import { ehUrl, reconhecerLink, type Origem } from "./links";

export type Prioridade = "alta" | "media" | "baixa";

export interface Captura {
  titulo: string;
  pessoa: string | null;
  projeto: string | null;
  prioridade: Prioridade | null;
  prazo: string | null; // AAAA-MM-DD
  link: string | null;
  origem: Origem;
  idExterno: string | null;
}

const PRIORIDADES: Record<string, Prioridade> = {
  alta: "alta",
  media: "media",
  média: "media",
  baixa: "baixa",
};

// getDay(): 0 = domingo. Nomes curtos e longos, com e sem acento.
const DIAS_SEMANA: Record<string, number> = {
  dom: 0, domingo: 0,
  seg: 1, segunda: 1,
  ter: 2, terca: 2, terça: 2,
  qua: 3, quarta: 3,
  qui: 4, quinta: 4,
  sex: 5, sexta: 5,
  sab: 6, sabado: 6, sábado: 6,
};

const NOME = /^[\p{L}\p{N}_.-]+$/u;
const PONTUACAO_FINAL = /[,;:.!?]+$/;

function somarDias(data: Date, dias: number): Date {
  return new Date(inicioDoDia(data).getTime() + dias * DIA_MS + 12 * 60 * 60 * 1000);
}

/**
 * Interpreta o prazo depois do ">": hoje, amanha, dia da semana ou dd/mm[/aa[aa]].
 * Dia da semana é a próxima ocorrência, contando hoje (">sexta" numa sexta é hoje).
 * dd/mm sem ano que já passou vai para o ano seguinte.
 */
export function interpretarPrazo(texto: string, hoje: Date): string | null {
  const t = texto.toLowerCase();
  if (t === "hoje") return dataLocalIso(hoje);
  if (t === "amanha" || t === "amanhã") return dataLocalIso(somarDias(hoje, 1));

  if (t in DIAS_SEMANA) {
    const alvo = DIAS_SEMANA[t];
    return dataLocalIso(somarDias(hoje, (alvo - hoje.getDay() + 7) % 7));
  }

  const m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  let ano = m[3] ? Number(m[3]) : hoje.getFullYear();
  if (m[3]?.length === 2) ano += 2000;
  const data = new Date(ano, mes - 1, dia);
  if (data.getMonth() !== mes - 1 || data.getDate() !== dia) return null; // 31/02 etc.
  if (!m[3] && data < inicioDoDia(hoje)) data.setFullYear(ano + 1);
  return dataLocalIso(data);
}

/**
 * Lê uma linha da captura. Marcações reconhecidas saem do título:
 * @pessoa, #projeto, !alta/!media/!baixa, >prazo e uma URL colada no texto.
 * Vale a primeira de cada tipo; repetidas ou inválidas ficam no título como texto.
 * `linkDaAreaDeTransferencia` só é usado se o texto não tiver URL própria.
 */
export function parseCaptura(texto: string, hoje: Date, linkDaAreaDeTransferencia: string | null = null): Captura {
  const resultado: Captura = {
    titulo: "",
    pessoa: null,
    projeto: null,
    prioridade: null,
    prazo: null,
    link: null,
    origem: "manual",
    idExterno: null,
  };
  const titulo: string[] = [];

  for (const token of texto.split(/\s+/).filter(Boolean)) {
    if (!resultado.link && ehUrl(token)) {
      definirLink(resultado, token);
      continue;
    }

    const marca = token[0];
    const valor = token.slice(1).replace(PONTUACAO_FINAL, "");

    if (marca === "@" && !resultado.pessoa && NOME.test(valor)) {
      resultado.pessoa = valor;
      continue;
    }
    if (marca === "#" && !resultado.projeto && NOME.test(valor)) {
      resultado.projeto = valor;
      continue;
    }
    if (marca === "!" && !resultado.prioridade && valor.toLowerCase() in PRIORIDADES) {
      resultado.prioridade = PRIORIDADES[valor.toLowerCase()];
      continue;
    }
    if (marca === ">" && !resultado.prazo) {
      const prazo = interpretarPrazo(valor, hoje);
      if (prazo) {
        resultado.prazo = prazo;
        continue;
      }
    }
    titulo.push(token);
  }

  if (!resultado.link && linkDaAreaDeTransferencia) definirLink(resultado, linkDaAreaDeTransferencia);
  resultado.titulo = titulo.join(" ");
  return resultado;
}

function definirLink(resultado: Captura, url: string) {
  const reconhecido = reconhecerLink(url);
  resultado.link = reconhecido?.url ?? url.trim();
  resultado.origem = reconhecido?.origem ?? "manual";
  resultado.idExterno = reconhecido?.idExterno ?? null;
}
