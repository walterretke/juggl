import { itemEmFoco } from "../db/foco";
import {
  concluidosHoje,
  itensAbertos,
  liberarPendentes,
  listarRegras,
  marcarDoDia,
  naoPerturbeLigado,
  registrarDisparos,
  type Notificacao,
} from "../db/regras";
import { ritualFeitoHoje } from "../db/ritual";
import { avaliarRegras } from "./motor";
import { notificar } from "./notificar";

/** Mostra uma notificação, ou um resumo quando várias chegam juntas (ao sair do foco). */
async function mostrar(notificacoes: Notificacao[], cabecalho: string | null = null): Promise<void> {
  if (notificacoes.length === 0) return;
  if (notificacoes.length === 1 && !cabecalho) {
    await notificar(notificacoes[0].titulo, notificacoes[0].corpo);
    return;
  }
  const linhas = notificacoes.slice(0, 4).map((n) => `• ${n.titulo}: ${n.corpo}`);
  if (notificacoes.length > 4) linhas.push(`e mais ${notificacoes.length - 4}.`);
  await notificar(cabecalho ?? `${notificacoes.length} avisos do Juggl`, linhas.join("\n"));
}

/**
 * Roda as regras: grava o que é novo, notifica na hora o que pode passar e segura o
 * resto enquanto há foco (não perturbe). Sem foco, solta o que estava segurado.
 * Devolve quantos itens viraram "do dia" por regra, para a tela recarregar.
 */
export async function verificarRegras(agora = new Date()): Promise<number> {
  const [regras, itens, foco, ritualFeito, concluidos, naoPerturbe] = await Promise.all([
    listarRegras(),
    itensAbertos(),
    itemEmFoco(),
    ritualFeitoHoje(agora),
    concluidosHoje(agora),
    naoPerturbeLigado(),
  ]);
  const disparos = avaliarRegras(regras, {
    agora,
    itens,
    foco: foco && { itemId: foco.item.id, titulo: foco.item.titulo, inicio: foco.inicio },
    ritualFeito,
    concluidosHoje: concluidos,
  });

  // Ações que não são aviso: marcar como do dia. Gravam a chave para não repetir.
  const doDia = disparos.filter((d) => d.acao.tipo === "do_dia");
  const marcados = await registrarDisparos(doDia, () => true);
  for (const n of marcados) if (n.item_id) await marcarDoDia(n.item_id, agora);

  const segurar = foco !== null && naoPerturbe;
  const avisos = disparos.filter((d) => d.acao.tipo === "notificar");
  const novos = await registrarDisparos(avisos, (d) => !segurar || d.urgente);
  await mostrar(novos.filter((n) => n.entregue_em));

  if (!foco) await mostrar(await liberarPendentes(), null);
  return marcados.length;
}

/** Ao pausar ou trocar de foco: solta de uma vez o que o não perturbe segurou. */
export async function liberarAvisosDoFoco(): Promise<void> {
  const pendentes = await liberarPendentes();
  await mostrar(pendentes, pendentes.length > 1 ? `${pendentes.length} avisos enquanto você focava` : null);
}
