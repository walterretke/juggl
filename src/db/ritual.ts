import { getDb } from ".";
import { dataLocalIso } from "../captura/datas";
import { gravarConfig, lerConfig } from "./config";
import { diaUtilAnterior, type DadosDaily } from "../dia/daily";
import { alterarItem, concluidosEntre, gravarCampos, listarItens, SELECT_ITEM, type Item } from "./itens";

/** Hora a partir da qual o app lembra que o dia não foi planejado. */
export const HORA_LEMBRETE_RITUAL = 10;

/** Último dia (AAAA-MM-DD) em que o dia foi planejado (a chave mantém o nome antigo). */
const CHAVE_FEITO = "ritual_feito";
/** Último dia em que Meu dia abriu sozinho, para não abrir de novo no mesmo dia. */
const CHAVE_ABERTO = "ritual_aberto";
/** Último dia em que o app lembrou do plano pendente (lembra uma vez só). */
const CHAVE_LEMBRADO = "ritual_lembrado";

/** Tudo que aparece no quadro Meu dia: caixa de entrada, A fazer, pausados e o item em foco. */
export async function itensDoQuadro(): Promise<Item[]> {
  const db = await getDb();
  return db.select<Item[]>(
    `${SELECT_ITEM} WHERE item.status IN ('inbox', 'a_fazer', 'pausado', 'em_foco')
      ORDER BY item.prazo IS NULL, item.prazo, prioridade.ordem IS NULL, prioridade.ordem, item.criado_em`,
  );
}

/** Itens concluídos hoje, o mais recente primeiro. */
export async function concluidosDoDia(hoje = new Date()): Promise<Item[]> {
  const db = await getDb();
  const meiaNoite = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString();
  return db.select<Item[]>(
    `${SELECT_ITEM} WHERE item.status = 'feito'
       AND EXISTS (SELECT 1 FROM evento e WHERE e.item_id = item.id AND e.tipo = 'concluido' AND e.timestamp >= $1)
     ORDER BY (SELECT MAX(e.timestamp) FROM evento e WHERE e.item_id = item.id AND e.tipo = 'concluido') DESC`,
    [meiaNoite],
  );
}

/**
 * O dia foi planejado: conta para o lembrete das 10h, para a regra "Dia não planejado"
 * e para o critério da tela Uso. Chamado ao pôr um item em Hoje ou ao confirmar o plano.
 */
export async function marcarDiaPlanejado(hoje = new Date()): Promise<void> {
  const db = await getDb();
  const dia = dataLocalIso(hoje);
  await gravarConfig(CHAVE_FEITO, dia);
  await db.execute(
    `INSERT INTO dia_de_uso (dia, aberto_em, ritual) VALUES ($1, $2, 1)
     ON CONFLICT (dia) DO UPDATE SET ritual = 1`,
    [dia, hoje.toISOString()],
  );
}

/** Último dia (AAAA-MM-DD) em que o dia foi fechado. */
const CHAVE_FECHADO = "dia_fechado";

export async function diaFechadoHoje(hoje = new Date()): Promise<boolean> {
  return (await lerConfig(CHAVE_FECHADO)) === dataLocalIso(hoje);
}

/** Destino de um item que sobrou em Hoje ao fechar o dia. */
export type Destino = "amanha" | "depois" | "feito";

/**
 * Fecha o dia: o que vai para amanhã já fica escolhido para amanhã (mantendo o "quando"),
 * o que vai para depois sai do plano e o que foi concluído vira feito.
 */
export async function fecharDia(destinos: { item: Item; destino: Destino }[], hoje = new Date()): Promise<void> {
  const amanha = dataLocalIso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1));
  for (const { item, destino } of destinos) {
    if (destino === "amanha") await gravarCampos(item.id, { dia_planejado: amanha });
    else if (destino === "depois") await gravarCampos(item.id, { dia_planejado: null, quando: null });
    else await alterarItem(item, { status: "feito" });
  }
  await gravarConfig(CHAVE_FECHADO, dataLocalIso(hoje));
}

export async function ritualFeitoHoje(hoje = new Date()): Promise<boolean> {
  return (await lerConfig(CHAVE_FEITO)) === dataLocalIso(hoje);
}

/** Primeira abertura do dia sem plano: abre Meu dia (uma vez por dia). */
export async function deveAbrirRitual(hoje = new Date()): Promise<boolean> {
  const dia = dataLocalIso(hoje);
  if ((await lerConfig(CHAVE_FEITO)) === dia || (await lerConfig(CHAVE_ABERTO)) === dia) return false;
  await gravarConfig(CHAVE_ABERTO, dia);
  return true;
}

/**
 * Passou da hora da regra "Dia não planejado" (10h por padrão) e o dia não foi planejado:
 * mostra o aviso no topo uma vez só no dia. Desligar a regra desliga o aviso.
 */
export async function deveLembrarRitual(agora = new Date()): Promise<boolean> {
  const db = await getDb();
  const [regra] = await db.select<{ ativa: number; condicao: string }[]>(
    "SELECT ativa, condicao FROM regra WHERE id = 'ritual_pendente'",
  );
  if (regra && regra.ativa !== 1) return false;
  const [h, m] = ((JSON.parse(regra?.condicao ?? "{}").hora as string | undefined) ?? `${HORA_LEMBRETE_RITUAL}:00`)
    .split(":")
    .map(Number);
  if (agora.getHours() * 60 + agora.getMinutes() < h * 60 + (m || 0)) return false;
  const dia = dataLocalIso(agora);
  if ((await lerConfig(CHAVE_FEITO)) === dia || (await lerConfig(CHAVE_LEMBRADO)) === dia) return false;
  await gravarConfig(CHAVE_LEMBRADO, dia);
  return true;
}

/** O que a daily precisa: concluídos no dia útil anterior, os abertos e os aguardando. */
export async function dadosDaDaily(hoje = new Date()): Promise<DadosDaily> {
  const anterior = diaUtilAnterior(hoje);
  const fim = new Date(anterior.getFullYear(), anterior.getMonth(), anterior.getDate() + 1);
  const [ontem, abertos, aguardando] = await Promise.all([concluidosEntre(anterior, fim), itensDoQuadro(), listarItens("aguardando")]);
  return { ontem, abertos, aguardando };
}
