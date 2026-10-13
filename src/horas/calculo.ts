/** De onde veio a sessão: um foco encerrado, o foco rodando agora ou um lançamento à mão. */
export type TipoSessao = "foco" | "andamento" | "manual";

/** Uma sessão de tempo já com o projeto. Lançamentos à mão podem não ter item. */
export interface Sessao {
  /** Id do evento foco_fim ou do lançamento à mão (o foco rodando usa o id do item). */
  id: string;
  tipo: TipoSessao;
  itemId: string | null;
  /** Título do item ou, sem item, a descrição do lançamento ("Reunião de planejamento"). */
  titulo: string;
  projetoId: string | null;
  projeto: string | null;
  codigo: string | null;
  inicio: Date;
  fim: Date;
}

export interface LinhaItem {
  /** Id do item, ou "manual:<descrição>" para lançamentos sem item. */
  itemId: string;
  titulo: string;
  porDia: number[]; // ms, segunda a domingo
  total: number;
}

export interface LinhaProjeto {
  projetoId: string | null;
  projeto: string | null;
  codigo: string | null;
  porDia: number[];
  total: number;
  itens: LinhaItem[];
}

export interface ResumoSemana {
  dias: Date[];
  linhas: LinhaProjeto[];
  porDia: number[];
  total: number;
}

export const NOMES_DIA_CURTO = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Segunda-feira 00:00 (hora local) da semana de `data`. */
export function inicioDaSemana(data: Date): Date {
  const desdeSegunda = (data.getDay() + 6) % 7;
  return new Date(data.getFullYear(), data.getMonth(), data.getDate() - desdeSegunda);
}

function somarDias(data: Date, dias: number): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate() + dias);
}

/**
 * Soma o tempo das sessões por projeto, por item e por dia da semana que começa em
 * `segunda`. Uma sessão que atravessa a meia-noite é dividida entre os dois dias.
 */
export function resumirSemana(sessoes: Sessao[], segunda: Date): ResumoSemana {
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
  const limites = [...dias, somarDias(segunda, 7)].map((d) => d.getTime());
  const projetos = new Map<string, LinhaProjeto>();

  for (const s of sessoes) {
    const chave = s.projetoId ?? "";
    let linha = projetos.get(chave);
    if (!linha) {
      linha = { projetoId: s.projetoId, projeto: s.projeto, codigo: s.codigo, porDia: Array(7).fill(0), total: 0, itens: [] };
      projetos.set(chave, linha);
    }
    const chaveItem = chaveDoItem(s);
    let item = linha.itens.find((i) => i.itemId === chaveItem);

    for (let d = 0; d < 7; d++) {
      const ms = Math.min(s.fim.getTime(), limites[d + 1]) - Math.max(s.inicio.getTime(), limites[d]);
      if (ms <= 0) continue;
      if (!item) {
        item = { itemId: chaveItem, titulo: s.titulo, porDia: Array(7).fill(0), total: 0 };
        linha.itens.push(item);
      }
      linha.porDia[d] += ms;
      linha.total += ms;
      item.porDia[d] += ms;
      item.total += ms;
    }
  }

  // Mais horas primeiro; "Sem projeto" sempre no fim.
  const linhas = [...projetos.values()]
    .filter((l) => l.total > 0)
    .sort((a, b) => (a.projetoId === null ? 1 : b.projetoId === null ? -1 : b.total - a.total));
  for (const l of linhas) l.itens.sort((a, b) => b.total - a.total);

  const porDia = dias.map((_, d) => linhas.reduce((soma, l) => soma + l.porDia[d], 0));
  return { dias, linhas, porDia, total: porDia.reduce((a, b) => a + b, 0) };
}

/** Linha de item onde a sessão entra: o item, ou a descrição de um lançamento sem item. */
export function chaveDoItem(s: Pick<Sessao, "itemId" | "titulo">): string {
  return s.itemId ?? `manual:${s.titulo.trim().toLowerCase()}`;
}

/** Sessões que caem na linha de projeto (e de item, se dado) em um dia da semana (0 = segunda). */
export function sessoesDaCelula(
  sessoes: Sessao[],
  segunda: Date,
  dia: number,
  projetoId: string | null,
  itemChave: string | null,
): Sessao[] {
  const de = somarDias(segunda, dia).getTime();
  const ate = somarDias(segunda, dia + 1).getTime();
  return sessoes
    .filter((s) => s.inicio.getTime() < ate && s.fim.getTime() > de)
    .filter((s) => s.projetoId === projetoId && (itemChave === null || chaveDoItem(s) === itemChave))
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

/**
 * Duração digitada no lançamento à mão, em ms: "1h30", "1h", "45min", "45m", "1:30",
 * "1,5" ou "1.5" (horas) e "90" (minutos, se for um número inteiro acima de 12).
 * Devolve null se não entendeu ou se dá zero.
 */
export function interpretarDuracao(texto: string): number | null {
  const t = texto.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return null;
  let minutos: number | null = null;
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(\d+)h(?:(\d{1,2})(?:m|min)?)?$/))) minutos = Number(m[1]) * 60 + Number(m[2] ?? 0);
  else if ((m = t.match(/^(\d+)(?:m|min)$/))) minutos = Number(m[1]);
  else if ((m = t.match(/^(\d+):(\d{2})$/))) minutos = Number(m[1]) * 60 + Number(m[2]);
  else if ((m = t.match(/^(\d+)[,.](\d+)h?$/))) minutos = Math.round(Number(`${m[1]}.${m[2]}`) * 60);
  else if ((m = t.match(/^(\d+)$/))) minutos = Number(m[1]) > 12 ? Number(m[1]) : Number(m[1]) * 60;
  if (minutos === null || minutos <= 0 || minutos > 24 * 60) return null;
  return minutos * 60_000;
}

/** Arredonda para o múltiplo mais próximo de `passoMin` minutos (0 não arredonda). */
export function arredondar(ms: number, passoMin: number): number {
  if (passoMin <= 0 || ms === 0) return ms;
  const passo = passoMin * 60_000;
  return Math.max(passo, Math.round(ms / passo) * passo);
}

/** "1:05" (horas:minutos), para a tela. Zero vira "". */
export function horasMinutos(ms: number): string {
  const minutos = Math.round(ms / 60000);
  if (minutos === 0) return "";
  return `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, "0")}`;
}

/** "1,08" (horas decimais com vírgula), para planilhas e sistemas de apontamento. */
export function horasDecimais(ms: number): string {
  return (ms / 3_600_000).toFixed(2).replace(".", ",");
}

function dataCurta(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Tabela da semana em texto: projetos nas linhas, dias nas colunas, horas decimais.
 * Com ";" vira um CSV que o Excel em português abre direto; com tab, cola em planilhas.
 */
function campoDe(separador: ";" | "\t") {
  return (texto: string) =>
    separador === ";" && /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto.replace(/[\t\n]/g, " ");
}

export function tabelaSemana(resumo: ResumoSemana, separador: ";" | "\t", passoMin = 0): string {
  const campo = campoDe(separador);
  const r = (ms: number) => horasDecimais(arredondar(ms, passoMin));
  const cabecalho = ["Projeto", "Código", ...resumo.dias.map((d, i) => `${NOMES_DIA_CURTO[i]} ${dataCurta(d)}`), "Total"];
  const linhas = resumo.linhas.map((l) => [
    campo(l.projeto ?? "Sem projeto"),
    campo(l.codigo ?? ""),
    ...l.porDia.map(r),
    // Com arredondamento, o total é a soma das células arredondadas, como o sistema de horas vai somar.
    horasDecimais(l.porDia.reduce((t, ms) => t + arredondar(ms, passoMin), 0)),
  ]);
  const porDia = resumo.dias.map((_, d) => resumo.linhas.reduce((t, l) => t + arredondar(l.porDia[d], passoMin), 0));
  const total = ["Total", "", ...porDia.map(horasDecimais), horasDecimais(porDia.reduce((a, b) => a + b, 0))];
  return [cabecalho, ...linhas, total].map((l) => l.join(separador)).join("\r\n");
}

/**
 * Uma linha por dia e projeto (Data, Código, Projeto, Horas), o formato que a maioria
 * dos sistemas de apontamento importa. Dias sem tempo ficam de fora.
 */
export function tabelaLinhas(resumo: ResumoSemana, separador: ";" | "\t", passoMin = 0): string {
  const campo = campoDe(separador);
  const linhas: string[][] = [["Data", "Código", "Projeto", "Horas"]];
  resumo.dias.forEach((d, i) => {
    for (const l of resumo.linhas) {
      if (l.porDia[i] === 0) continue;
      const data = `${dataCurta(d)}/${d.getFullYear()}`;
      linhas.push([data, campo(l.codigo ?? ""), campo(l.projeto ?? "Sem projeto"), horasDecimais(arredondar(l.porDia[i], passoMin))]);
    }
  });
  return linhas.map((l) => l.join(separador)).join("\r\n");
}

/** Formato do que Copiar e Exportar CSV geram (fica salvo nas configurações). */
export type FormatoApontamento = "semana" | "linhas";
