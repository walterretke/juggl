import { v7 as uuidv7 } from "uuid";

/** UUID v7: não sequencial (seguro para sincronizar na v2) e ordenado por criação. */
export function novoId(): string {
  return uuidv7();
}

/** Momento atual em ISO 8601 UTC, formato usado em todas as colunas *_em e timestamp. */
export function agoraIso(): string {
  return new Date().toISOString();
}
