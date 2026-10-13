/**
 * Anexos ficam no banco, então cada arquivo é guardado no menor formato que não estraga:
 * fotos e prints viram WebP (no máximo 1600 px de lado), o resto vai em gzip quando isso
 * economiza espaço. Na hora de abrir, volta ao arquivo de antes (menos as imagens, que
 * ficam no formato novo).
 */

export type Compressao = "nenhuma" | "gzip" | "imagem";

/** Um anexo pronto para gravar. */
export interface AnexoPreparado {
  nome: string;
  /** Tipo do conteúdo guardado depois de abrir (o original, ou image/webp ao converter). */
  tipo: string;
  tamanho_original: number;
  tamanho: number;
  compressao: Compressao;
  /** Conteúdo em base64 (comprimido, se compressao for gzip). */
  dados: string;
}

/** Arquivos maiores que isso ficam de fora: o banco é copiado inteiro em cada backup. */
export const LIMITE_ANEXO = 15 * 1024 * 1024;
/** Lado maior de uma imagem guardada. */
export const LADO_MAXIMO = 1600;
/** Só vale comprimir se economizar pelo menos 10%. */
const GANHO_MINIMO = 0.9;

/** Imagens que dá para converter sem perder nada importante (GIF perderia a animação, SVG é texto). */
const IMAGENS_CONVERSIVEIS = ["image/jpeg", "image/png", "image/webp", "image/bmp"];

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1).replace(".", ",") : Math.round(mb)} MB`;
}

/** Tamanho reduzido para caber em `maximo` px no lado maior, sem aumentar imagens pequenas. */
export function dimensoesReduzidas(largura: number, altura: number, maximo = LADO_MAXIMO): { largura: number; altura: number } {
  const escala = Math.min(1, maximo / Math.max(largura, altura));
  return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)) };
}

/** "print.png" → "print.webp". */
export function trocarExtensao(nome: string, extensao: string): string {
  const ponto = nome.lastIndexOf(".");
  return `${ponto > 0 ? nome.slice(0, ponto) : nome}.${extensao}`;
}

export function ehImagem(tipo: string): boolean {
  return tipo.startsWith("image/");
}

/** Só usa a versão comprimida se ela for de fato menor. */
export function compensa(original: number, comprimido: number): boolean {
  return comprimido < original * GANHO_MINIMO;
}

export function paraBase64(bytes: Uint8Array): string {
  let binario = "";
  const pedaco = 0x8000;
  for (let i = 0; i < bytes.length; i += pedaco) binario += String.fromCharCode(...bytes.subarray(i, i + pedaco));
  return btoa(binario);
}

export function deBase64(texto: string): Uint8Array {
  const binario = atob(texto);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function passarPor(bytes: Uint8Array, transformacao: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const fluxo = new Blob([bytes as BlobPart]).stream().pipeThrough(transformacao);
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

export const gzip = (bytes: Uint8Array) => passarPor(bytes, new CompressionStream("gzip"));
export const gunzip = (bytes: Uint8Array) => passarPor(bytes, new DecompressionStream("gzip"));

function canvasParaBlob(canvas: HTMLCanvasElement, tipo: string, qualidade: number): Promise<Blob | null> {
  return new Promise((pronto) => canvas.toBlob(pronto, tipo, qualidade));
}

/** Se algum pixel é transparente (aí JPEG não serve). */
function temTransparencia(contexto: CanvasRenderingContext2D, largura: number, altura: number): boolean {
  const { data } = contexto.getImageData(0, 0, largura, altura);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

/** Reduz e converte para WebP (ou JPEG, se o sistema não gerar WebP). Null se não deu. */
async function comprimirImagem(arquivo: File): Promise<{ blob: Blob; extensao: string } | null> {
  const imagem = await createImageBitmap(arquivo).catch(() => null);
  if (!imagem) return null;
  const { largura, altura } = dimensoesReduzidas(imagem.width, imagem.height);
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const contexto = canvas.getContext("2d");
  if (!contexto) return null;
  contexto.drawImage(imagem, 0, 0, largura, altura);
  imagem.close();
  const webp = await canvasParaBlob(canvas, "image/webp", 0.75);
  if (webp?.type === "image/webp") return { blob: webp, extensao: "webp" };
  // Alguns WebViews (WebKit no Linux, em versões antigas) não geram WebP.
  if (arquivo.type !== "image/jpeg" && temTransparencia(contexto, largura, altura)) return null;
  const jpeg = await canvasParaBlob(canvas, "image/jpeg", 0.8);
  return jpeg?.type === "image/jpeg" ? { blob: jpeg, extensao: "jpg" } : null;
}

/** Lê o arquivo e escolhe como guardar. Erro se passar do limite. */
export async function prepararAnexo(arquivo: File): Promise<AnexoPreparado> {
  if (arquivo.size > LIMITE_ANEXO) {
    throw new Error(`${arquivo.name} tem ${formatarTamanho(arquivo.size)}; o limite é ${formatarTamanho(LIMITE_ANEXO)}.`);
  }
  const nome = arquivo.name || "anexo";
  const tipo = arquivo.type || "application/octet-stream";
  const original = new Uint8Array(await arquivo.arrayBuffer());

  if (IMAGENS_CONVERSIVEIS.includes(tipo)) {
    const imagem = await comprimirImagem(arquivo);
    if (imagem && compensa(original.length, imagem.blob.size)) {
      const bytes = new Uint8Array(await imagem.blob.arrayBuffer());
      return {
        nome: trocarExtensao(nome, imagem.extensao),
        tipo: imagem.blob.type,
        tamanho_original: original.length,
        tamanho: bytes.length,
        compressao: "imagem",
        dados: paraBase64(bytes),
      };
    }
  } else {
    const comprimido = await gzip(original);
    if (compensa(original.length, comprimido.length)) {
      return { nome, tipo, tamanho_original: original.length, tamanho: comprimido.length, compressao: "gzip", dados: paraBase64(comprimido) };
    }
  }
  return { nome, tipo, tamanho_original: original.length, tamanho: original.length, compressao: "nenhuma", dados: paraBase64(original) };
}

/** O arquivo de volta, pronto para abrir ou salvar. */
export async function bytesDoAnexo(anexo: { compressao: Compressao; dados: string }): Promise<Uint8Array> {
  const bytes = deBase64(anexo.dados);
  return anexo.compressao === "gzip" ? gunzip(bytes) : bytes;
}
