export const NOME_ORIGEM: Record<string, string> = {
  teams: "Teams",
  jira: "Jira",
  servicenow: "ServiceNow",
  devops: "DevOps",
  manual: "Manual",
};

export const COR_ORIGEM: Record<string, string> = {
  teams: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200",
  jira: "bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200",
  servicenow: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200",
  devops: "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200",
  manual: "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200",
};

/** "Ctrl+Shift+Space" → "Ctrl+Shift+Espaço" para mostrar na tela. */
export function rotuloAtalho(atalho: string): string {
  return atalho.replace(/\bSpace\b/i, "Espaço");
}
