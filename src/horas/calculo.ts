/** Uma sessão de foco já com o projeto do item. */
export interface Sessao {
  itemId: string;
  titulo: string;
  projetoId: string | null;
  projeto: string | null;
  codigo: string | null;
  inicio: Date;
  fim: Date;
}

export interface LinhaItem {
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
    let item = linha.itens.find((i) => i.itemId === s.itemId);

    for (let d = 0; d < 7; d++) {
      const ms = Math.min(s.fim.getTime(), limites[d + 1]) - Math.max(s.inicio.getTime(), limites[d]);
      if (ms <= 0) continue;
      if (!item) {
        item = { itemId: s.itemId, titulo: s.titulo, porDia: Array(7).fill(0), total: 0 };
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
export function tabelaSemana(resumo: ResumoSemana, separador: ";" | "\t"): string {
  const campo = (texto: string) =>
    separador === ";" && /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto.replace(/[\t\n]/g, " ");
  const cabecalho = ["Projeto", "Código", ...resumo.dias.map((d, i) => `${NOMES_DIA_CURTO[i]} ${dataCurta(d)}`), "Total"];
  const linhas = resumo.linhas.map((l) => [
    campo(l.projeto ?? "Sem projeto"),
    campo(l.codigo ?? ""),
    ...l.porDia.map(horasDecimais),
    horasDecimais(l.total),
  ]);
  const total = ["Total", "", ...resumo.porDia.map(horasDecimais), horasDecimais(resumo.total)];
  return [cabecalho, ...linhas, total].map((l) => l.join(separador)).join("\r\n");
}
