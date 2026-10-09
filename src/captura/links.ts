export type Origem = "teams" | "jira" | "servicenow" | "devops" | "manual";

export interface LinkReconhecido {
  url: string;
  origem: Exclude<Origem, "manual">;
  idExterno: string | null;
}

const CHAMADO_SERVICENOW = /\b(INC|RITM|REQ|CHG|PRB|SCTASK|TASK)\d{5,}\b/i;
const CHAVE_JIRA = /\b([A-Z][A-Z0-9]+-\d+)\b/;

function paraUrl(texto: string): URL | null {
  const limpo = texto.trim();
  if (!/^https?:\/\/\S+$/i.test(limpo)) return null;
  try {
    return new URL(limpo);
  } catch {
    return null;
  }
}

/**
 * Reconhece links do Teams, Jira, ServiceNow e Azure DevOps.
 * Devolve null para qualquer outro texto, inclusive URLs de outros sites.
 */
export function reconhecerLink(texto: string): LinkReconhecido | null {
  const url = paraUrl(texto);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const caminho = decodeURIComponent(url.pathname);
  const completo = decodeURIComponent(url.href);

  if (host === "teams.microsoft.com" || host === "teams.live.com" || host === "teams.cloud.microsoft") {
    // Link de mensagem: /l/message/<conversa>/<id da mensagem>
    const msg = caminho.match(/\/l\/message\/[^/]+\/(\d+)/);
    return { url: url.href, origem: "teams", idExterno: msg?.[1] ?? null };
  }

  if (host === "dev.azure.com" || host.endsWith(".visualstudio.com")) {
    const wi = caminho.match(/\/_workitems\/edit\/(\d+)/) ?? completo.match(/[?&]workitem=(\d+)/i);
    return { url: url.href, origem: "devops", idExterno: wi?.[1] ?? null };
  }

  if (host.endsWith(".service-now.com")) {
    const numero = completo.match(CHAMADO_SERVICENOW);
    const sysId = url.searchParams.get("sys_id") ?? completo.match(/sys_id[=%]3?D?([0-9a-f]{32})/i)?.[1];
    return {
      url: url.href,
      origem: "servicenow",
      idExterno: numero ? numero[0].toUpperCase() : (sysId ?? null),
    };
  }

  // Jira Cloud (*.atlassian.net) ou Jira próprio da empresa (/browse/CHAVE-123).
  const browse = caminho.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/);
  if (host.endsWith(".atlassian.net") || browse) {
    const chave = browse?.[1] ?? url.searchParams.get("selectedIssue") ?? completo.match(CHAVE_JIRA)?.[1];
    return { url: url.href, origem: "jira", idExterno: chave ?? null };
  }

  return null;
}

/** Diz se o texto é uma URL http(s), reconhecida ou não. */
export function ehUrl(texto: string): boolean {
  return paraUrl(texto) !== null;
}
