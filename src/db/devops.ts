import { invoke } from "@tauri-apps/api/core";
import { getDb } from ".";
import { novos, paraCaptura, type ItemDevops } from "../integracoes/devops";
import { gravarConfig, lerConfig } from "./config";
import { criarItem } from "./itens";

/** Configuração do Azure DevOps. O token não está aqui: fica no cofre do sistema. */
export interface ConfigDevops {
  ligado: boolean;
  organizacao: string;
  /** Vazio: todos os projetos da organização. */
  projeto: string;
  intervaloMin: number;
}

export const INTERVALO_PADRAO_MIN = 10;

const CHAVES = {
  ligado: "devops_ligado",
  organizacao: "devops_organizacao",
  projeto: "devops_projeto",
  intervaloMin: "devops_intervalo_min",
  ultima: "devops_ultima_sincronizacao",
  erro: "devops_ultimo_erro",
  /** Última tentativa, mesmo com erro: um token vencido não vira uma chamada por minuto. */
  tentativa: "devops_ultima_tentativa",
};

export async function lerConfigDevops(): Promise<ConfigDevops> {
  const [ligado, organizacao, projeto, intervalo] = await Promise.all([
    lerConfig(CHAVES.ligado),
    lerConfig(CHAVES.organizacao),
    lerConfig(CHAVES.projeto),
    lerConfig(CHAVES.intervaloMin),
  ]);
  return {
    ligado: ligado === "sim",
    organizacao: organizacao ?? "",
    projeto: projeto ?? "",
    intervaloMin: Math.max(Number(intervalo) || INTERVALO_PADRAO_MIN, 1),
  };
}

export async function gravarConfigDevops(config: ConfigDevops): Promise<void> {
  await gravarConfig(CHAVES.ligado, config.ligado ? "sim" : "nao");
  await gravarConfig(CHAVES.organizacao, config.organizacao.trim());
  await gravarConfig(CHAVES.projeto, config.projeto.trim());
  await gravarConfig(CHAVES.intervaloMin, String(Math.max(Math.round(config.intervaloMin) || INTERVALO_PADRAO_MIN, 1)));
}

export interface EstadoDevops {
  temToken: boolean;
  /** ISO da última sincronização que deu certo. */
  ultima: string | null;
  erro: string | null;
}

export async function estadoDevops(): Promise<EstadoDevops> {
  const [temToken, ultima, erro] = await Promise.all([
    invoke<boolean>("devops_tem_token").catch(() => false),
    lerConfig(CHAVES.ultima),
    lerConfig(CHAVES.erro),
  ]);
  return { temToken, ultima, erro: erro || null };
}

export function salvarToken(token: string): Promise<void> {
  return invoke("devops_salvar_token", { token });
}

export function apagarToken(): Promise<void> {
  return invoke("devops_apagar_token");
}

/** Busca no Azure sem gravar nada (botão "Testar conexão"). Devolve quantos itens abertos há. */
export async function testarDevops(config: ConfigDevops): Promise<number> {
  const itens = await invoke<ItemDevops[]>("devops_buscar", { organizacao: config.organizacao, projeto: config.projeto || null });
  return itens.length;
}

/**
 * Traz para a caixa de entrada os work items atribuídos a você que ainda não estão
 * no Juggl. Nunca recria um item que você já arquivou ou concluiu, e não mexe nos
 * que já existem. Devolve os títulos novos.
 */
export async function sincronizarDevops(config?: ConfigDevops): Promise<string[]> {
  const cfg = config ?? (await lerConfigDevops());
  if (!cfg.organizacao) throw new Error("Informe a organização do Azure DevOps.");
  await gravarConfig(CHAVES.tentativa, new Date().toISOString());
  try {
    const itens = await invoke<ItemDevops[]>("devops_buscar", { organizacao: cfg.organizacao, projeto: cfg.projeto || null });
    const db = await getDb();
    const linhas = await db.select<{ id_externo: string }[]>(
      "SELECT id_externo FROM item WHERE origem = 'devops' AND id_externo IS NOT NULL",
    );
    const conhecidos = new Set(linhas.map((l) => l.id_externo.toLowerCase()));
    const criados: string[] = [];
    // Mais antigos primeiro, para a caixa de entrada ficar na ordem em que chegaram.
    for (const item of novos(itens, cfg.organizacao, conhecidos).reverse()) {
      const { captura, descricao } = paraCaptura(item, cfg.organizacao);
      await criarItem(captura, null, descricao);
      criados.push(item.titulo);
    }
    await gravarConfig(CHAVES.ultima, new Date().toISOString());
    await gravarConfig(CHAVES.erro, "");
    return criados;
  } catch (e) {
    await gravarConfig(CHAVES.erro, String(e)).catch(() => {});
    throw e;
  }
}

/** Já passou o intervalo desde a última sincronização? */
export async function horaDeSincronizar(config: ConfigDevops, agora = new Date()): Promise<boolean> {
  if (!config.ligado || !config.organizacao) return false;
  // Sem token não tenta: o erro só confundiria até a pessoa terminar de configurar.
  if (!(await invoke<boolean>("devops_tem_token").catch(() => false))) return false;
  const ultima = await lerConfig(CHAVES.tentativa);
  return !ultima || agora.getTime() - new Date(ultima).getTime() >= config.intervaloMin * 60_000;
}
