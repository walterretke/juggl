/**
 * Amostras de ruído para tocar em loop. Branco: todas as frequências iguais. Rosa: cai
 * 3 dB por oitava (filtro de Paul Kellet). Marrom: cai 6 dB por oitava (passeio aleatório).
 * `aleatorio` entra como parâmetro para os testes serem previsíveis.
 */
export function gerarRuido(tipo: "branco" | "rosa" | "marrom", tamanho: number, aleatorio = Math.random): Float32Array {
  const saida = new Float32Array(tamanho);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let ultimo = 0;
  for (let i = 0; i < tamanho; i++) {
    const branco = aleatorio() * 2 - 1;
    if (tipo === "branco") {
      saida[i] = branco * 0.5;
    } else if (tipo === "rosa") {
      b0 = 0.99886 * b0 + branco * 0.0555179;
      b1 = 0.99332 * b1 + branco * 0.0750759;
      b2 = 0.969 * b2 + branco * 0.153852;
      b3 = 0.8665 * b3 + branco * 0.3104856;
      b4 = 0.55 * b4 + branco * 0.5329522;
      b5 = -0.7616 * b5 - branco * 0.016898;
      saida[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + branco * 0.5362) * 0.11;
      b6 = branco * 0.115926;
    } else {
      ultimo = (ultimo + 0.02 * branco) / 1.02;
      saida[i] = ultimo * 3.5;
    }
  }
  return saida;
}
