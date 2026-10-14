import { describe, expect, it } from "vitest";
import { bytesDoAnexo, compensa, deBase64, dimensoesReduzidas, formatarTamanho, gzip, paraBase64, prepararAnexo, trocarExtensao } from "./compressao";

describe("compressão de anexos", () => {
  it("formata tamanhos", () => {
    expect(formatarTamanho(512)).toBe("512 B");
    expect(formatarTamanho(2048)).toBe("2 KB");
    expect(formatarTamanho(1.5 * 1024 * 1024)).toBe("1,5 MB");
    expect(formatarTamanho(15 * 1024 * 1024)).toBe("15 MB");
  });

  it("reduz só imagens grandes, mantendo a proporção", () => {
    expect(dimensoesReduzidas(4000, 3000)).toEqual({ largura: 1600, altura: 1200 });
    expect(dimensoesReduzidas(1080, 1920)).toEqual({ largura: 900, altura: 1600 });
    expect(dimensoesReduzidas(800, 600)).toEqual({ largura: 800, altura: 600 });
  });

  it("troca a extensão", () => {
    expect(trocarExtensao("print da tela.png", "webp")).toBe("print da tela.webp");
    expect(trocarExtensao("sem-extensao", "webp")).toBe("sem-extensao.webp");
    expect(trocarExtensao(".oculto", "webp")).toBe(".oculto.webp");
  });

  it("só comprime quando economiza", () => {
    expect(compensa(1000, 500)).toBe(true);
    expect(compensa(1000, 950)).toBe(false);
  });

  it("base64 vai e volta, inclusive com arquivos grandes", () => {
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 7) % 256);
    expect(deBase64(paraBase64(bytes))).toEqual(bytes);
  });

  it("texto vai em gzip e volta igual", async () => {
    const texto = "linha de log repetida\n".repeat(500);
    const anexo = await prepararAnexo(new File([texto], "log.txt", { type: "text/plain" }));
    expect(anexo.compressao).toBe("gzip");
    expect(anexo.tamanho).toBeLessThan(anexo.tamanho_original / 10);
    expect(new TextDecoder().decode(await bytesDoAnexo(anexo))).toBe(texto);
  });

  it("arquivo que não comprime fica como está", async () => {
    const aleatorio = crypto.getRandomValues(new Uint8Array(4096));
    const zipado = await gzip(aleatorio);
    const anexo = await prepararAnexo(new File([zipado as BlobPart], "pacote.zip", { type: "application/zip" }));
    expect(anexo.compressao).toBe("nenhuma");
    expect(await bytesDoAnexo(anexo)).toEqual(zipado);
  });

  it("recusa arquivos acima do limite", async () => {
    const grande = new File([new Uint8Array(16 * 1024 * 1024)], "video.mp4", { type: "video/mp4" });
    await expect(prepararAnexo(grande)).rejects.toThrow(/limite/);
  });
});
