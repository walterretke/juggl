export const NOME_ORIGEM: Record<string, string> = {
  teams: "Teams",
  jira: "Jira",
  servicenow: "ServiceNow",
  devops: "DevOps",
  manual: "Manual",
};

/** Cor do marcador de origem (bolinha + texto) nas listas e na captura. */
export const COR_ORIGEM: Record<string, string> = {
  teams: "bg-violet-400",
  jira: "bg-sky-500",
  servicenow: "bg-emerald-500",
  devops: "bg-blue-600",
  manual: "bg-stone-400",
};

/** "Ctrl+Shift+Space" → "Ctrl+Shift+Espaço" para mostrar na tela. */
export function rotuloAtalho(atalho: string): string {
  return atalho.replace(/\bSpace\b/i, "Espaço");
}
