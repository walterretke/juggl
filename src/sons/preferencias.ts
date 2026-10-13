import { gravarConfig, lerConfig } from "../db/config";

export interface PreferenciasSom {
  /** Som escolhido para o foco (null: sem som). */
  somId: string | null;
  volume: number;
  /** Começa a tocar sozinho quando um foco começa. */
  aoFocar: boolean;
}

export async function lerPreferenciasSom(): Promise<PreferenciasSom> {
  const [som, volume, aoFocar] = await Promise.all([lerConfig("som_foco"), lerConfig("som_volume"), lerConfig("som_ao_focar")]);
  const v = Number(volume);
  return { somId: som || null, volume: volume !== null && Number.isFinite(v) ? v : 0.5, aoFocar: aoFocar !== "nao" };
}

export async function gravarPreferenciasSom(p: PreferenciasSom): Promise<void> {
  await gravarConfig("som_foco", p.somId ?? "");
  await gravarConfig("som_volume", String(p.volume));
  await gravarConfig("som_ao_focar", p.aoFocar ? "sim" : "nao");
}

/** Overlay de foco: abre sozinho no canto da tela quando um foco começa (padrão: sim). */
export async function lerOverlayAoFocar(): Promise<boolean> {
  return (await lerConfig("overlay_ao_focar")) !== "nao";
}

export function gravarOverlayAoFocar(ligado: boolean): Promise<void> {
  return gravarConfig("overlay_ao_focar", ligado ? "sim" : "nao");
}
