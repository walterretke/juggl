/** Um som para tocar durante o foco. */
export interface Som {
  id: string;
  nome: string;
  grupo: "Ruídos e natureza" | "Músicas (rádios on-line)";
  /** Por que ajuda a concentrar, em uma linha. */
  descricao: string;
  /** Gerado aqui mesmo (funciona sem internet) ou uma rádio on-line. */
  fonte: { tipo: "gerado"; ruido: "marrom" | "rosa" | "branco"; efeito?: "chuva" | "ondas" } | { tipo: "radio"; url: string };
}

/**
 * Catálogo de sons do foco. Os ruídos e a natureza são gerados no próprio app (sem internet
 * e sem arquivos). As músicas são rádios abertas e sem anúncios: precisam de internet.
 */
export const CATALOGO: Som[] = [
  {
    id: "ruido_marrom",
    nome: "Ruído marrom",
    grupo: "Ruídos e natureza",
    descricao: "Grave e constante. Abafa conversas em volta, bom para escritório aberto.",
    fonte: { tipo: "gerado", ruido: "marrom" },
  },
  {
    id: "ruido_rosa",
    nome: "Ruído rosa",
    grupo: "Ruídos e natureza",
    descricao: "Mais suave que o ruído branco; estudos associam a mais concentração e memória.",
    fonte: { tipo: "gerado", ruido: "rosa" },
  },
  {
    id: "chuva",
    nome: "Chuva",
    grupo: "Ruídos e natureza",
    descricao: "Chuva fina e contínua. Som de natureza que acalma sem chamar atenção.",
    fonte: { tipo: "gerado", ruido: "rosa", efeito: "chuva" },
  },
  {
    id: "ondas",
    nome: "Ondas do mar",
    grupo: "Ruídos e natureza",
    descricao: "Ondas lentas, num ritmo parecido com a respiração calma.",
    fonte: { tipo: "gerado", ruido: "marrom", efeito: "ondas" },
  },
  {
    id: "lofi",
    nome: "Lo-fi e beats instrumentais",
    grupo: "Músicas (rádios on-line)",
    descricao: "SomaFM Fluid: batidas instrumentais, sem letra para disputar a atenção.",
    fonte: { tipo: "radio", url: "https://ice1.somafm.com/fluid-128-mp3" },
  },
  {
    id: "ambiente",
    nome: "Ambiente e downtempo",
    grupo: "Músicas (rádios on-line)",
    descricao: "SomaFM Groove Salad: eletrônica calma, a rádio clássica para trabalhar.",
    fonte: { tipo: "radio", url: "https://ice1.somafm.com/groovesalad-128-mp3" },
  },
  {
    id: "drone",
    nome: "Atmosférica",
    grupo: "Músicas (rádios on-line)",
    descricao: "SomaFM Drone Zone: texturas longas, quase sem ritmo. Para foco profundo.",
    fonte: { tipo: "radio", url: "https://ice1.somafm.com/dronezone-128-mp3" },
  },
  {
    id: "classica",
    nome: "Clássica",
    grupo: "Músicas (rádios on-line)",
    descricao: "Radio Swiss Classic: música clássica sem locução entre as faixas.",
    fonte: { tipo: "radio", url: "https://stream.srg-ssr.ch/m/rsc_de/mp3_128" },
  },
  {
    id: "jazz",
    nome: "Jazz",
    grupo: "Músicas (rádios on-line)",
    descricao: "Radio Swiss Jazz: jazz tranquilo e contínuo.",
    fonte: { tipo: "radio", url: "https://stream.srg-ssr.ch/m/rsj/mp3_128" },
  },
];

export function acharSom(id: string | null): Som | null {
  return CATALOGO.find((s) => s.id === id) ?? null;
}
