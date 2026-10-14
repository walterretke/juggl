import { dataLocalIso, DIA_MS, descreverPrazo } from "../captura/datas";
import type { Item } from "../db/itens";
import type { AvisoPrazo, AvisosPorPrioridade } from "./avisoPrazo";

export type IdPronta =
  | "prazo_chegando"
  | "promessa_esquecida"
  | "inbox_acumulando"
  | "ritual_pendente"
  | "foco_esquecido"
  | "fim_do_dia"
  | "retorno_aguardando";

/** Condição de regra personalizada: todos os campos preenchidos precisam valer. */
export interface CondicaoPersonalizada {
  pessoa_id?: string;
  projeto_id?: string;
  prioridade_id?: string;
  /** Parado (sem mudança) há pelo menos N dias. */
  parado_dias?: number;
  prazo?: "hoje" | "atrasado" | "ate_amanha";
  /** Alguém já cobrou pelo menos uma vez. */
  cobrado?: boolean;
}

/** Parâmetros das regras prontas (o "X" de cada uma). */
export interface CondicaoPronta {
  horas?: number;
  dias?: number;
  itens?: number;
  /** "HH:MM" */
  hora?: string;
}

export type Acao = { tipo: "notificar" } | { tipo: "do_dia" };

export interface Regra {
  id: string;
  nome: string;
  tipo: "pronta" | "personalizada";
  condicao: CondicaoPronta & CondicaoPersonalizada;
  acao: Acao;
  ativa: boolean;
  urgente: boolean;
  ordem: number;
}

export interface Contexto {
  agora: Date;
  /** Itens abertos: caixa de entrada, A fazer, pausados e o em foco. */
  itens: Item[];
  foco: { itemId: string; titulo: string; inicio: string } | null;
  ritualFeito: boolean;
  /** Títulos concluídos hoje, para o resumo do fim do dia. */
  concluidosHoje: string[];
  /** Antecedência e repetição do Prazo chegando por prioridade; sem prioridade vale a da regra. */
  avisoPrazo?: AvisosPorPrioridade;
}

/** Um aviso que uma regra quer dar (ou uma ação que quer tomar), uma vez por `chave`. */
export interface Disparo {
  regraId: string;
  itemId: string | null;
  chave: string;
  titulo: string;
  corpo: string;
  urgente: boolean;
  acao: Acao;
}

/** Um prazo só tem data: conta como vencendo às 18h do dia. */
export const HORA_VENCIMENTO = 18;
const HORA_MS = 60 * 60 * 1000;

function deIso(iso: string, hora = 0): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d, hora);
}

/** "17:30" hoje, como data. */
function horario(agora: Date, hhmm: string | undefined, padrao: string): Date {
  const [h, m] = (hhmm ?? padrao).split(":").map(Number);
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), h || 0, m || 0);
}

function diasParado(item: Item, agora: Date): number {
  return Math.floor((agora.getTime() - new Date(item.atualizado_em).getTime()) / DIA_MS);
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

function fimDeSemana(data: Date): boolean {
  return data.getDay() === 0 || data.getDay() === 6;
}

type Avaliador = (regra: Regra, ctx: Contexto) => Omit<Disparo, "regraId" | "urgente" | "acao">[];

const PRONTAS: Record<IdPronta, Avaliador> = {
  prazo_chegando: (regra, { agora, itens, avisoPrazo }) =>
    itens
      .filter((i) => i.prazo && i.status !== "em_foco")
      .flatMap((i) => {
        const aviso: AvisoPrazo = (i.prioridade_id && avisoPrazo?.[i.prioridade_id]) || {
          horas: regra.condicao.horas ?? 4,
          repetirHoras: 0,
        };
        const falta = deIso(i.prazo!, HORA_VENCIMENTO).getTime() - agora.getTime();
        if (aviso.horas <= 0 || falta <= 0 || falta > aviso.horas * HORA_MS) return [];
        // Repetindo, cada intervalo até o vencimento ganha uma chave própria (e um aviso).
        const vez = aviso.repetirHoras > 0 ? `:${Math.floor(falta / (aviso.repetirHoras * HORA_MS))}` : "";
        const horasFaltando = Math.ceil(falta / HORA_MS);
        return [
          {
            itemId: i.id,
            chave: `prazo_chegando:${i.id}:${i.prazo}${vez}`,
            titulo: i.prioridade ? `Prazo chegando · ${i.prioridade}` : "Prazo chegando",
            corpo: `${i.titulo} vence ${descreverPrazo(i.prazo!, agora)} às ${HORA_VENCIMENTO}h${
              horasFaltando > 4 ? ` (faltam ${plural(horasFaltando, "hora", "horas")})` : ""
            }${i.pessoa ? ` (pedido de ${i.pessoa})` : ""}.`,
          },
        ];
      }),

  promessa_esquecida: (regra, { agora, itens }) =>
    itens
      .filter((i) => i.prometido_para && i.status !== "em_foco" && diasParado(i, agora) >= (regra.condicao.dias ?? 2))
      .map((i) => ({
        itemId: i.id,
        chave: `promessa_esquecida:${i.id}:${dataLocalIso(agora)}`,
        titulo: "Promessa esquecida",
        corpo: `Você prometeu ${i.titulo}${i.pessoa ? ` para ${i.pessoa}` : ""} (${descreverPrazo(i.prometido_para!, agora)}) e está parado há ${plural(diasParado(i, agora), "dia", "dias")}.`,
      })),

  inbox_acumulando: (regra, { agora, itens }) => {
    const quantos = itens.filter((i) => i.status === "inbox").length;
    if (quantos <= (regra.condicao.itens ?? 10)) return [];
    return [
      {
        itemId: null,
        chave: `inbox_acumulando:${dataLocalIso(agora)}`,
        titulo: "Caixa de entrada acumulando",
        corpo: `${plural(quantos, "item espera", "itens esperam")} triagem.`,
      },
    ];
  },

  ritual_pendente: (regra, { agora, ritualFeito, itens }) => {
    if (ritualFeito || itens.length === 0 || agora < horario(agora, regra.condicao.hora, "10:00")) return [];
    return [
      {
        itemId: null,
        chave: `ritual_pendente:${dataLocalIso(agora)}`,
        titulo: "Dia ainda não planejado",
        corpo: "Abra Meu dia e escolha o que fazer hoje. Leva uns 5 minutos.",
      },
    ];
  },

  foco_esquecido: (regra, { agora, foco }) => {
    if (!foco) return [];
    const duracao = agora.getTime() - new Date(foco.inicio).getTime();
    if (duracao < (regra.condicao.horas ?? 2) * HORA_MS) return [];
    return [
      {
        itemId: foco.itemId,
        chave: `foco_esquecido:${foco.itemId}:${foco.inicio}`,
        titulo: "Foco esquecido?",
        corpo: `O timer de ${foco.titulo} está rodando há ${plural(Math.floor(duracao / HORA_MS), "hora", "horas")}. Pause se já parou.`,
      },
    ];
  },

  fim_do_dia: (regra, { agora, itens, concluidosHoje }) => {
    if (fimDeSemana(agora) || agora < horario(agora, regra.condicao.hora, "17:30")) return [];
    const amanha = dataLocalIso(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1));
    const urgentes = itens.filter(
      (i) => (i.prazo && i.prazo <= amanha) || (i.prometido_para && i.prometido_para <= amanha),
    );
    const feito = concluidosHoje.length === 0 ? "Nada concluído hoje." : `Feito hoje: ${plural(concluidosHoje.length, "item", "itens")}.`;
    const fica =
      urgentes.length === 0
        ? "Nada vence amanhã."
        : `Vencem até amanhã: ${urgentes
            .slice(0, 3)
            .map((i) => i.titulo)
            .join(", ")}${urgentes.length > 3 ? ` e mais ${urgentes.length - 3}` : ""}.`;
    return [{ itemId: null, chave: `fim_do_dia:${dataLocalIso(agora)}`, titulo: "Fim do dia", corpo: `${feito} ${fica}` }];
  },

  // O item já voltou de Aguardando para A fazer (ou ainda está lá): avisa uma vez no dia do retorno.
  retorno_aguardando: (_regra, { agora, itens }) => {
    const hoje = dataLocalIso(agora);
    return itens
      .filter((i) => i.aguardando_ate && i.aguardando_ate <= hoje && i.status !== "em_foco")
      .map((i) => ({
        itemId: i.id,
        chave: `retorno_aguardando:${i.id}:${i.aguardando_ate}`,
        titulo: "Cobrar retorno",
        corpo: `${i.titulo}: ${i.aguardando_quem ? `você está esperando ${i.aguardando_quem}` : "você estava esperando um retorno"} desde ${dataCurta(i.atualizado_em)}.`,
      }));
  },
};

function dataCurta(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** O item atende a todas as condições preenchidas? Sem nenhuma condição, não atende. */
export function atendeCondicao(item: Item, c: CondicaoPersonalizada, agora: Date): boolean {
  const hoje = dataLocalIso(agora);
  const amanha = dataLocalIso(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1));
  const testes: boolean[] = [];
  if (c.pessoa_id) testes.push(item.pessoa_id === c.pessoa_id);
  if (c.projeto_id) testes.push(item.projeto_id === c.projeto_id);
  if (c.prioridade_id) testes.push(item.prioridade_id === c.prioridade_id);
  if (c.parado_dias) testes.push(diasParado(item, agora) >= c.parado_dias);
  if (c.prazo === "hoje") testes.push(item.prazo === hoje);
  if (c.prazo === "atrasado") testes.push(item.prazo !== null && item.prazo < hoje);
  if (c.prazo === "ate_amanha") testes.push(item.prazo !== null && item.prazo <= amanha);
  if (c.cobrado) testes.push(item.cobrancas > 0);
  return testes.length > 0 && testes.every(Boolean);
}

function avaliarPersonalizada(regra: Regra, { agora, itens }: Contexto): Omit<Disparo, "regraId" | "urgente" | "acao">[] {
  const hoje = dataLocalIso(agora);
  return itens
    .filter((i) => atendeCondicao(i, regra.condicao, agora))
    .filter((i) => regra.acao.tipo !== "do_dia" || i.dia_planejado !== hoje)
    .map((i) => ({
      itemId: i.id,
      chave: `regra:${regra.id}:${i.id}:${hoje}`,
      titulo: regra.nome,
      corpo: `${i.titulo}${i.pessoa ? ` (pedido de ${i.pessoa})` : ""}`,
    }));
}

/** Tudo que as regras ativas querem disparar agora. Quem chama descarta as chaves já usadas. */
export function avaliarRegras(regras: Regra[], ctx: Contexto): Disparo[] {
  return regras
    .filter((r) => r.ativa)
    .flatMap((regra) => {
      const avaliar = regra.tipo === "pronta" ? PRONTAS[regra.id as IdPronta] : avaliarPersonalizada;
      if (!avaliar) return [];
      return avaliar(regra, ctx).map((d) => ({ ...d, regraId: regra.id, urgente: regra.urgente, acao: regra.acao }));
    });
}
