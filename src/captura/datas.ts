/** Data local no formato AAAA-MM-DD, usado na coluna `prazo`. */
export function dataLocalIso(data: Date): string {
  const a = data.getFullYear();
  const m = String(data.getMonth() + 1).padStart(2, "0");
  const d = String(data.getDate()).padStart(2, "0");
  return `${a}-${m}-${d}`;
}

function inicioDoDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

function deIso(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

const DIA_MS = 24 * 60 * 60 * 1000;

function diasEntre(de: Date, ate: Date): number {
  return Math.round((inicioDoDia(ate).getTime() - inicioDoDia(de).getTime()) / DIA_MS);
}

const NOMES_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "hoje", "amanhã", "sexta", "atrasado 2 d" ou "15/10" para mostrar o prazo. */
export function descreverPrazo(prazo: string, hoje: Date): string {
  const data = deIso(prazo);
  const dias = diasEntre(hoje, data);
  if (dias < 0) return `atrasado ${-dias} d`;
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  if (dias < 7) return NOMES_DIA[data.getDay()];
  return `${String(data.getDate()).padStart(2, "0")}/${String(data.getMonth() + 1).padStart(2, "0")}`;
}

/** Há quanto tempo o item está parado: "agora", "15 min", "3 h", "2 d". */
export function tempoParado(desdeIso: string, agora: Date): string {
  const minutos = Math.floor((agora.getTime() - new Date(desdeIso).getTime()) / 60000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} h`;
  return `${Math.floor(horas / 24)} d`;
}

export { inicioDoDia, DIA_MS };

/** Cronômetro "1:05:09" (ou "5:09" abaixo de uma hora). */
export function formatarCronometro(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Duração resumida: "menos de 1 min", "25 min", "2 h", "2 h 10 min". */
export function formatarDuracao(ms: number): string {
  const minutos = Math.floor(Math.max(0, ms) / 60000);
  if (minutos < 1) return "menos de 1 min";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
