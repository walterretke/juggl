import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

let permitido: Promise<boolean> | null = null;

/** Pede a permissão uma vez (no Windows e no Linux já vem liberada; no macOS o sistema pergunta). */
function temPermissao(): Promise<boolean> {
  permitido ??= (async () => (await isPermissionGranted()) || (await requestPermission()) === "granted")().catch(() => false);
  return permitido;
}

/** Notificação nativa do sistema. Devolve false se o sistema não deixou mostrar. */
export async function notificar(titulo: string, corpo: string): Promise<boolean> {
  if (!(await temPermissao())) return false;
  sendNotification({ title: titulo, body: corpo });
  return true;
}
