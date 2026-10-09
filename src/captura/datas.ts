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
