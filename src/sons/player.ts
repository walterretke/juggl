import type { Som } from "./catalogo";
import { gerarRuido } from "./ruido";

/**
 * Toca um som do catálogo na janela principal (que continua viva escondida na bandeja).
 * Um som por vez; trocar de som para o anterior. Entra e sai com um fade curto.
 */

const FADE_S = 1.2;
const SEGUNDOS_DE_RUIDO = 12;

let contexto: AudioContext | null = null;
let mestre: GainNode | null = null;
let nos: AudioNode[] = [];
let fontes: AudioScheduledSourceNode[] = [];
let radio: HTMLAudioElement | null = null;
let atual: string | null = null;
let volume = 0.5;

function ctx(): AudioContext {
  contexto ??= new AudioContext();
  return contexto;
}

/** Id do som tocando agora (null: nada). */
export function somAtual(): string | null {
  return atual;
}

export function definirVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  if (radio) radio.volume = volume;
  if (mestre && contexto) mestre.gain.setTargetAtTime(volume, contexto.currentTime, 0.1);
}

export async function tocar(som: Som, v = volume): Promise<void> {
  pararJa();
  volume = v;
  atual = som.id;
  if (som.fonte.tipo === "radio") {
    const audio = new Audio(som.fonte.url);
    audio.volume = volume;
    radio = audio;
    try {
      await audio.play();
    } catch {
      if (radio === audio) pararJa();
      throw new Error(`Não consegui tocar ${som.nome}. A rádio precisa de internet.`);
    }
    return;
  }

  const c = ctx();
  if (c.state === "suspended") await c.resume();
  const buffer = c.createBuffer(2, c.sampleRate * SEGUNDOS_DE_RUIDO, c.sampleRate);
  // Os dois canais com ruído diferente: soa mais aberto, menos "dentro da cabeça".
  for (let canal = 0; canal < 2; canal++) buffer.copyToChannel(gerarRuido(som.fonte.ruido, buffer.length) as Float32Array<ArrayBuffer>, canal);
  const fonte = c.createBufferSource();
  fonte.buffer = buffer;
  fonte.loop = true;

  const ganho = c.createGain();
  ganho.gain.value = 0;
  ganho.gain.setTargetAtTime(volume, c.currentTime, FADE_S / 3);
  mestre = ganho;
  let saida: AudioNode = fonte;

  if (som.fonte.efeito === "chuva") {
    // Chuva: o chiado agudo do ruído rosa, sem os graves.
    const passaAlta = c.createBiquadFilter();
    passaAlta.type = "highpass";
    passaAlta.frequency.value = 600;
    const passaBaixa = c.createBiquadFilter();
    passaBaixa.type = "lowpass";
    passaBaixa.frequency.value = 9000;
    saida.connect(passaAlta).connect(passaBaixa);
    saida = passaBaixa;
    nos.push(passaAlta, passaBaixa);
  } else if (som.fonte.efeito === "ondas") {
    // Ondas: ruído grave que sobe e desce devagar (uma onda a cada ~11 s).
    const passaBaixa = c.createBiquadFilter();
    passaBaixa.type = "lowpass";
    passaBaixa.frequency.value = 1000;
    const mar = c.createGain();
    mar.gain.value = 0.55;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.09;
    const profundidade = c.createGain();
    profundidade.gain.value = 0.45;
    lfo.connect(profundidade).connect(mar.gain);
    lfo.start();
    saida.connect(passaBaixa).connect(mar);
    saida = mar;
    nos.push(passaBaixa, mar, profundidade);
    fontes.push(lfo);
  }

  saida.connect(ganho).connect(c.destination);
  nos.push(ganho);
  fonte.start();
  fontes.push(fonte);
}

function pararJa(): void {
  for (const f of fontes) {
    try {
      f.stop();
    } catch {
      // já parada
    }
  }
  for (const n of nos) n.disconnect();
  fontes = [];
  nos = [];
  mestre = null;
  if (radio) {
    radio.pause();
    radio.removeAttribute("src");
    radio.load();
    radio = null;
  }
  atual = null;
}

/** Para com um fade curto. */
export function parar(): void {
  if (!atual) return;
  if (mestre && contexto) {
    const [f, n, m] = [fontes, nos, mestre];
    m.gain.setTargetAtTime(0, contexto.currentTime, FADE_S / 4);
    fontes = [];
    nos = [];
    mestre = null;
    atual = null;
    setTimeout(() => {
      for (const x of f) {
        try {
          x.stop();
        } catch {
          // já parada
        }
      }
      for (const x of n) x.disconnect();
    }, FADE_S * 1000);
    return;
  }
  pararJa();
}
