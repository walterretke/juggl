/**
 * Leitura do Markdown simples que o editor da descrição grava: parágrafos, listas com
 * marcador ou numeradas (com recuo), **negrito**, *itálico*, ~~tachado~~, `código` e links.
 * Não interpreta HTML: o texto sempre aparece como texto.
 */

export type Trecho =
  | { tipo: "texto"; texto: string }
  | { tipo: "negrito" | "italico" | "tachado"; filhos: Trecho[] }
  | { tipo: "codigo"; texto: string }
  | { tipo: "link"; url: string; filhos: Trecho[] };

export type Bloco =
  | { tipo: "paragrafo"; linhas: Trecho[][] }
  | { tipo: "lista"; numerada: boolean; inicio: number; itens: { nivel: number; trechos: Trecho[]; marcado: boolean | null }[] };

const MARCADOR = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TAREFA = /^\[([ xX])\]\s+(.*)$/;

/** Separa o texto em parágrafos e listas. */
export function analisarMarkdown(texto: string): Bloco[] {
  const blocos: Bloco[] = [];
  let paragrafo: Trecho[][] | null = null;
  for (const bruta of texto.replace(/\r\n?/g, "\n").split("\n")) {
    // Quebra de linha forçada do Markdown: "\" ou dois espaços no fim.
    const linha = bruta.replace(/\\$/, "").replace(/ {2,}$/, "");
    const lista = MARCADOR.exec(linha);
    if (lista) {
      paragrafo = null;
      const numerada = /\d/.test(lista[2]);
      const nivel = Math.floor(lista[1].replace(/\t/g, "  ").length / 2);
      const tarefa = TAREFA.exec(lista[3]);
      const item = {
        nivel,
        trechos: analisarTrechos(tarefa ? tarefa[2] : lista[3]),
        marcado: tarefa ? tarefa[1] !== " " : null,
      };
      const ultimo = blocos[blocos.length - 1];
      if (ultimo?.tipo === "lista" && (ultimo.numerada === numerada || nivel > 0)) ultimo.itens.push(item);
      else blocos.push({ tipo: "lista", numerada, inicio: numerada ? parseInt(lista[2], 10) : 1, itens: [item] });
      continue;
    }
    if (!linha.trim()) {
      paragrafo = null;
      continue;
    }
    // Linha recuada logo depois de um item continua o item.
    const ultimo = blocos[blocos.length - 1];
    if (!paragrafo && ultimo?.tipo === "lista" && /^\s+\S/.test(linha)) {
      const item = ultimo.itens[ultimo.itens.length - 1];
      item.trechos.push({ tipo: "texto", texto: " " }, ...analisarTrechos(linha.trim()));
      continue;
    }
    if (!paragrafo) {
      paragrafo = [];
      blocos.push({ tipo: "paragrafo", linhas: paragrafo });
    }
    paragrafo.push(analisarTrechos(linha));
  }
  return blocos;
}

const DELIMITADORES: { abre: string; tipo: "negrito" | "italico" | "tachado" }[] = [
  { abre: "**", tipo: "negrito" },
  { abre: "__", tipo: "negrito" },
  { abre: "~~", tipo: "tachado" },
  { abre: "*", tipo: "italico" },
  { abre: "_", tipo: "italico" },
];

/** Negrito, itálico, tachado, código e links dentro de uma linha. */
export function analisarTrechos(linha: string): Trecho[] {
  const trechos: Trecho[] = [];
  let texto = "";
  const soltar = () => {
    if (texto) trechos.push({ tipo: "texto", texto });
    texto = "";
  };
  let i = 0;
  while (i < linha.length) {
    const c = linha[i];
    if (c === "\\" && i + 1 < linha.length && /[\\`*_{}[\]()#+\-.!~>|]/.test(linha[i + 1])) {
      texto += linha[i + 1];
      i += 2;
      continue;
    }
    if (c === "`") {
      const fim = linha.indexOf("`", i + 1);
      if (fim > i + 1) {
        soltar();
        trechos.push({ tipo: "codigo", texto: linha.slice(i + 1, fim) });
        i = fim + 1;
        continue;
      }
    }
    if (c === "[") {
      const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/.exec(linha.slice(i));
      if (link) {
        soltar();
        trechos.push({ tipo: "link", url: link[2], filhos: analisarTrechos(link[1]) });
        i += link[0].length;
        continue;
      }
    }
    const delim = DELIMITADORES.find((d) => linha.startsWith(d.abre, i));
    if (delim) {
      const inicio = i + delim.abre.length;
      // Abre só colado no texto ("**x**", não "2 * 3"), e o "_" não vale no meio de palavra.
      const meioDePalavra = delim.abre[0] === "_" && i > 0 && /\w/.test(linha[i - 1]);
      const fim = linha.indexOf(delim.abre, inicio + 1);
      if (!meioDePalavra && fim > inicio && linha[inicio] !== " " && linha[fim - 1] !== " ") {
        soltar();
        trechos.push({ tipo: delim.tipo, filhos: analisarTrechos(linha.slice(inicio, fim)) });
        i = fim + delim.abre.length;
        continue;
      }
    }
    texto += c;
    i++;
  }
  soltar();
  return trechos;
}

/** O texto sem as marcações, para uma linha só (busca, títulos, avisos). */
export function textoSemMarcacao(texto: string): string {
  const plano = (t: Trecho[]): string =>
    t.map((x) => (x.tipo === "texto" || x.tipo === "codigo" ? x.texto : plano(x.filhos))).join("");
  return analisarMarkdown(texto)
    .map((b) => (b.tipo === "paragrafo" ? b.linhas.map(plano).join(" ") : b.itens.map((i) => plano(i.trechos)).join("; ")))
    .join(" ");
}
