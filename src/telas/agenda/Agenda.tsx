import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { dataLocalIso } from "../../captura/datas";
import {
  arrumarBlocos,
  DIAS_CURTOS,
  deIso,
  diasDoMes,
  hora,
  inicioDaSemana,
  ocorrenciasDasTarefas,
  ocorrenciasDosCompromissos,
  ordenar,
  somarDias,
  tituloDoPeriodo,
  type Ocorrencia,
} from "../../agenda/agenda";
import { compromissosEntre, tarefasEntre } from "../../db/agenda";
import { gravarConfig, lerConfig } from "../../db/config";
import type { Item, Mudancas } from "../../db/itens";
import { FAIXA_PRIORIDADE } from "../cores";
import FormCompromisso, { type Abertura } from "./FormCompromisso";

type Visao = "mes" | "semana" | "dia";

interface Props {
  /** Muda quando os itens mudam em outra tela, para recarregar. */
  versao: number;
  /** Sem outra janela aberta por cima: as setas e o T valem. */
  teclado: boolean;
  aoAbrirTarefa: (item: Item) => void;
  aoAplicar: (item: Item, mudancas: Mudancas, mensagem?: string) => Promise<void>;
  aoAvisar: (texto: string) => void;
  /** Algo mudou por aqui (compromisso, tarefa criada): recarrega tudo. */
  aoAlterar: () => void;
}

const TIPO_ITEM = "text/juggl-item";
const ALTURA_HORA = 48;
const HORA_INICIAL = 7;
const VISOES: { valor: Visao; nome: string }[] = [
  { valor: "mes", nome: "Mês" },
  { valor: "semana", nome: "Semana" },
  { valor: "dia", nome: "Dia" },
];

function intervalo(visao: Visao, dia: string): [string, string] {
  if (visao === "dia") return [dia, dia];
  if (visao === "semana") {
    const ini = inicioDaSemana(dia);
    return [ini, somarDias(ini, 6)];
  }
  const dias = diasDoMes(dia);
  return [dias[0], dias[dias.length - 1]];
}

function horaDoBloco(o: Ocorrencia): string {
  return o.inicio === null ? "" : `${hora(o.inicio)}–${hora(o.fim ?? o.inicio + 60)}`;
}

/** Cor de cada coisa na agenda: compromissos em azul; tarefas com a faixa da prioridade. */
function classeDoChip(o: Ocorrencia, discreto = false): string {
  if (discreto) return "text-apagado hover:text-tinta-2";
  if (o.tipo === "compromisso") return "bg-destaque-claro text-destaque-tinta";
  const feito = o.item?.status === "feito";
  const faixa = o.item?.prioridade_cor ? `border-l-[3px] ${FAIXA_PRIORIDADE[o.item.prioridade_cor]}` : "border-l-[3px] border-l-linha";
  return `bg-cartao text-tinta shadow-[0_0_0_1px_var(--color-linha)] ${faixa} ${feito ? "line-through opacity-60" : ""}`;
}

/**
 * Agenda no estilo do Google Agenda: mês, semana e dia. Na semana e no dia, uma faixa
 * "sem horário" mostra as tarefas do dia que não têm hora marcada; arraste uma tarefa
 * para a grade para marcar a hora. O botão "24h na tela" encaixa o dia inteiro sem rolar.
 */
export default function Agenda({ versao, teclado, aoAbrirTarefa, aoAplicar, aoAvisar, aoAlterar }: Props) {
  const hoje = dataLocalIso(new Date());
  const [visao, setVisao] = useState<Visao>("semana");
  const [dia, setDia] = useState(hoje);
  const [tela24h, setTela24h] = useState(false);
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [tarefas, setTarefas] = useState<Item[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<Abertura | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    lerConfig("agenda_visao").then((v) => (v === "mes" || v === "semana" || v === "dia") && setVisao(v)).catch(() => {});
    lerConfig("agenda_24h").then((v) => setTela24h(v === "sim")).catch(() => {});
    const relogio = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(relogio);
  }, []);

  const [de, ate] = intervalo(visao, dia);
  const carregar = useCallback(async () => {
    try {
      const [compromissos, lidas] = await Promise.all([compromissosEntre(de, ate), tarefasEntre(de, ate)]);
      setTarefas(lidas);
      setOcorrencias(ordenar([...ocorrenciasDosCompromissos(compromissos, de, ate), ...ocorrenciasDasTarefas(lidas, de, ate)]));
      setErro(null);
    } catch (e) {
      setErro(String(e));
    }
  }, [de, ate]);

  useEffect(() => {
    carregar();
  }, [carregar, versao]);

  function trocarVisao(v: Visao) {
    setVisao(v);
    gravarConfig("agenda_visao", v).catch(() => {});
  }

  function trocar24h() {
    const novo = !tela24h;
    setTela24h(novo);
    gravarConfig("agenda_24h", novo ? "sim" : "nao").catch(() => {});
  }

  function andar(passo: number) {
    if (visao === "dia") setDia((d) => somarDias(d, passo));
    else if (visao === "semana") setDia((d) => somarDias(d, 7 * passo));
    else
      setDia((d) => {
        const x = deIso(d);
        return dataLocalIso(new Date(x.getFullYear(), x.getMonth() + passo, 1));
      });
  }

  // ← → trocam de período e T volta para hoje.
  useEffect(() => {
    if (!teclado || form) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") andar(-1);
      else if (e.key === "ArrowRight") andar(1);
      else if (e.key.toLowerCase() === "t") setDia(dataLocalIso(new Date()));
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  });

  function abrir(o: Ocorrencia) {
    if (o.item) aoAbrirTarefa(o.item);
    else if (o.compromisso) setForm({ tipo: "editar", compromisso: o.compromisso, dia: o.dia });
  }

  /** Soltar uma tarefa: na grade marca o horário; na faixa "sem horário" tira o horário. */
  async function soltar(id: string, destinoDia: string, minuto: number | null) {
    setAlvo(null);
    const item = tarefas.find((t) => t.id === id);
    if (!item) return;
    if (minuto === null) {
      const mudancas: Mudancas = { agenda_inicio: null, agenda_fim: null };
      if (destinoDia !== (item.dia_planejado ?? item.prazo)) {
        mudancas.prazo = destinoDia;
        if (item.dia_planejado) Object.assign(mudancas, { dia_planejado: null, quando: null });
      }
      await aoAplicar(item, mudancas, "Sem horário");
      return;
    }
    const duracao =
      item.agenda_inicio && item.agenda_fim
        ? Math.max(15, (new Date(item.agenda_fim).getTime() - new Date(item.agenda_inicio).getTime()) / 60000)
        : 60;
    const inicio = Math.min(minuto, 24 * 60 - 15);
    const fim = Math.min(inicio + duracao, 24 * 60 - 1);
    await aoAplicar(
      item,
      { agenda_inicio: `${destinoDia}T${hora(inicio)}`, agenda_fim: `${destinoDia}T${hora(fim)}` },
      `Marcado ${hora(inicio)}`,
    );
  }

  const porDia = useMemo(() => {
    const mapa = new Map<string, Ocorrencia[]>();
    for (const o of ocorrencias) mapa.set(o.dia, [...(mapa.get(o.dia) ?? []), o]);
    return mapa;
  }, [ocorrencias]);

  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="-mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setDia(hoje)}
          title="Voltar para hoje (T)"
          className="rounded-lg border border-linha px-3 py-1 text-sm font-semibold hover:bg-etiqueta"
        >
          Hoje
        </button>
        <button type="button" aria-label="Anterior" title="Anterior (←)" onClick={() => andar(-1)} className="rounded-md px-2 py-1 text-lg leading-none text-suave hover:bg-etiqueta">
          ‹
        </button>
        <button type="button" aria-label="Próximo" title="Próximo (→)" onClick={() => andar(1)} className="rounded-md px-2 py-1 text-lg leading-none text-suave hover:bg-etiqueta">
          ›
        </button>
        <h2 className="font-titulo text-xl font-medium first-letter:uppercase">{tituloDoPeriodo(visao, dia)}</h2>
        <span className="flex-1" />
        {visao !== "mes" && (
          <button
            type="button"
            aria-pressed={tela24h}
            onClick={trocar24h}
            title="Encaixa as 24 horas na tela, sem rolar. Fica lembrado."
            className={`rounded-lg px-3 py-1 text-[13px] font-semibold ${tela24h ? "bg-destaque text-folha" : "text-suave hover:bg-etiqueta"}`}
          >
            24h na tela
          </button>
        )}
        <div role="radiogroup" aria-label="Visão" className="flex rounded-lg bg-etiqueta p-0.5">
          {VISOES.map((v) => (
            <button
              key={v.valor}
              type="button"
              role="radio"
              aria-checked={visao === v.valor}
              onClick={() => trocarVisao(v.valor)}
              className={`rounded-md px-3 py-0.5 text-[13px] ${visao === v.valor ? "bg-folha font-semibold shadow-sm" : "text-suave"}`}
            >
              {v.nome}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setForm({ tipo: "novo", dia: visao === "mes" ? hoje : dia < de || dia > ate ? de : dia, inicio: null })}
          className="rounded-lg bg-destaque px-3 py-1 text-sm font-semibold text-folha hover:opacity-90"
        >
          + Novo
        </button>
      </div>

      {erro && <p className="rounded-xl bg-atraso-claro px-4 py-3 text-sm text-atraso">{erro}</p>}

      {visao === "mes" ? (
        <Mes
          dia={dia}
          hoje={hoje}
          porDia={porDia}
          aoAbrir={abrir}
          aoAbrirDia={(d) => {
            setDia(d);
            trocarVisao("dia");
          }}
        />
      ) : (
        <Grade
          dias={visao === "dia" ? [dia] : Array.from({ length: 7 }, (_, i) => somarDias(de, i))}
          hoje={hoje}
          agora={agora}
          tela24h={tela24h}
          porDia={porDia}
          alvo={alvo}
          aoAlvo={setAlvo}
          aoAbrir={abrir}
          aoNovo={(d, minuto) => setForm({ tipo: "novo", dia: d, inicio: minuto })}
          aoSoltar={(id, d, minuto) => soltar(id, d, minuto).catch((e) => setErro(String(e)))}
        />
      )}

      {form && (
        <FormCompromisso
          abertura={form}
          aoFechar={() => setForm(null)}
          aoGravar={(aviso) => {
            setForm(null);
            aoAvisar(aviso);
            carregar();
            aoAlterar();
          }}
        />
      )}
    </div>
  );
}

function Chip({ o, aoAbrir, discreto = false, comHora = false }: { o: Ocorrencia; aoAbrir: (o: Ocorrencia) => void; discreto?: boolean; comHora?: boolean }) {
  return (
    <button
      type="button"
      draggable={o.tipo === "tarefa"}
      onDragStart={(e) => {
        e.dataTransfer.setData(TIPO_ITEM, o.chave);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={(e) => {
        e.stopPropagation();
        aoAbrir(o);
      }}
      title={`${o.titulo}${o.recorrente ? " (repete)" : ""}${o.tipo === "tarefa" ? ". Arraste para a grade para marcar a hora." : ""}`}
      className={`block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[12px] leading-snug ${classeDoChip(o, discreto)}`}
    >
      {comHora && o.inicio !== null && <span className="mr-1 tabular-nums opacity-75">{hora(o.inicio)}</span>}
      {o.recorrente && discreto && <span aria-hidden="true">↻ </span>}
      {o.titulo}
    </button>
  );
}

const MAX_NO_DIA_DO_MES = 4;

/**
 * Visão do mês: o que é diferente em cada dia aparece em destaque; o que repete (academia
 * toda semana) fica discreto, em texto apagado e por último.
 */
function Mes({
  dia,
  hoje,
  porDia,
  aoAbrir,
  aoAbrirDia,
}: {
  dia: string;
  hoje: string;
  porDia: Map<string, Ocorrencia[]>;
  aoAbrir: (o: Ocorrencia) => void;
  aoAbrirDia: (dia: string) => void;
}) {
  const mes = deIso(dia).getMonth();
  const dias = diasDoMes(dia);
  return (
    <div className="overflow-hidden rounded-2xl shadow-[0_0_0_1px_var(--color-linha)]">
      <div className="grid grid-cols-7 bg-lateral">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <div key={d} className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-apagado">
            {DIAS_CURTOS[d]}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((d) => {
          const lista = porDia.get(d) ?? [];
          const destaque = lista.filter((o) => !o.recorrente);
          const repetidos = lista.filter((o) => o.recorrente);
          const visiveis = [...destaque, ...repetidos].slice(0, MAX_NO_DIA_DO_MES);
          const sobra = lista.length - visiveis.length;
          const doMes = deIso(d).getMonth() === mes;
          return (
            <div
              key={d}
              onClick={() => aoAbrirDia(d)}
              className={`flex min-h-[104px] cursor-pointer flex-col gap-0.5 border-t border-l border-linha p-1 first:border-l-0 [&:nth-child(7n+1)]:border-l-0 hover:bg-cartao/60 ${
                doMes ? "" : "bg-lateral opacity-60"
              }`}
            >
              <span
                className={`mb-0.5 flex size-6 items-center justify-center self-center rounded-full text-[12px] font-semibold ${
                  d === hoje ? "bg-destaque text-folha" : doMes ? "text-tinta-2" : "text-apagado"
                }`}
              >
                {deIso(d).getDate()}
              </span>
              {visiveis.map((o) => (
                <Chip key={o.chave} o={o} aoAbrir={aoAbrir} discreto={o.recorrente} comHora />
              ))}
              {sobra > 0 && <span className="px-1.5 text-[11px] text-apagado">+{sobra} mais</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface PropsGrade {
  dias: string[];
  hoje: string;
  agora: Date;
  tela24h: boolean;
  porDia: Map<string, Ocorrencia[]>;
  alvo: string | null;
  aoAlvo: (alvo: string | null) => void;
  aoAbrir: (o: Ocorrencia) => void;
  aoNovo: (dia: string, minuto: number) => void;
  aoSoltar: (id: string, dia: string, minuto: number | null) => void;
}

/** Semana ou dia: a faixa "sem horário" em cima e a grade de horas embaixo. */
function Grade({ dias, hoje, agora, tela24h, porDia, alvo, aoAlvo, aoAbrir, aoNovo, aoSoltar }: PropsGrade) {
  const rolagem = useRef<HTMLDivElement>(null);
  const [disponivel, setDisponivel] = useState(600);
  // Inteiro, para as linhas das horas ficarem nítidas e sem acumular erro.
  const alturaHora = tela24h ? Math.max(14, Math.floor(disponivel / 24)) : ALTURA_HORA;

  // A grade ocupa o resto da janela; no modo 24h, as horas encolhem para caber.
  useLayoutEffect(() => {
    function medir() {
      const el = rolagem.current;
      if (!el) return;
      const topo = el.getBoundingClientRect().top + (el.closest("main")?.scrollTop ?? 0);
      // 72: rodapé com as dicas e uma folga embaixo.
      setDisponivel(Math.max(240, window.innerHeight - topo - 72));
    }
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [dias.length, tela24h]);

  // Como no Google Agenda: abre rolado para o começo do dia de trabalho.
  useEffect(() => {
    if (!tela24h && rolagem.current) rolagem.current.scrollTop = HORA_INICIAL * ALTURA_HORA;
  }, [tela24h, dias[0]]);

  const colunas = `52px repeat(${dias.length}, minmax(0, 1fr))`;
  const minutoDoClique = (e: React.MouseEvent | React.DragEvent, passo: number) => {
    const caixa = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const minuto = ((e.clientY - caixa.top) / alturaHora) * 60;
    return Math.max(0, Math.min(24 * 60 - passo, Math.floor(minuto / passo) * passo));
  };
  const agoraMin = agora.getHours() * 60 + agora.getMinutes();

  return (
    <div className="overflow-hidden rounded-2xl bg-cartao shadow-[0_0_0_1px_var(--color-linha)]">
      <div className="grid border-b border-linha" style={{ gridTemplateColumns: colunas }}>
        <div />
        {dias.map((d) => (
          <div key={d} className="flex items-baseline justify-center gap-1.5 border-l border-linha py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-apagado">{DIAS_CURTOS[deIso(d).getDay()]}</span>
            <span
              className={`flex size-7 items-center justify-center rounded-full text-[15px] font-semibold ${
                d === hoje ? "bg-destaque text-folha" : "text-tinta-2"
              }`}
            >
              {deIso(d).getDate()}
            </span>
          </div>
        ))}
      </div>

      {/* Sem horário: tarefas do dia (como "fazer a barba") e compromissos sem hora. */}
      <div className="grid border-b border-linha bg-lateral/40" style={{ gridTemplateColumns: colunas }}>
        <div className="px-1 py-1.5 text-right text-[10px] font-semibold uppercase leading-tight tracking-wider text-apagado">Sem horário</div>
        {dias.map((d) => {
          const chave = `${d}-sem`;
          const lista = (porDia.get(d) ?? []).filter((o) => o.inicio === null);
          return (
            <div
              key={d}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(TIPO_ITEM)) return;
                e.preventDefault();
                aoAlvo(chave);
              }}
              onDragLeave={() => aoAlvo(null)}
              onDrop={(e) => {
                e.preventDefault();
                aoSoltar(e.dataTransfer.getData(TIPO_ITEM), d, null);
              }}
              className={`flex max-h-28 min-h-9 flex-col gap-0.5 overflow-y-auto border-l border-linha p-1 ${alvo === chave ? "bg-destaque-claro" : ""}`}
            >
              {lista.map((o) => (
                <Chip key={o.chave} o={o} aoAbrir={aoAbrir} />
              ))}
            </div>
          );
        })}
      </div>

      <div ref={rolagem} className={tela24h ? "overflow-hidden" : "overflow-y-auto"} style={{ height: tela24h ? alturaHora * 24 : disponivel }}>
        <div className="relative grid" style={{ gridTemplateColumns: colunas, height: alturaHora * 24 }}>
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <span
                key={h}
                className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-apagado"
                style={{ top: h * alturaHora, display: h === 0 || (tela24h && alturaHora < 20 && h % 2) ? "none" : undefined }}
              >
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {dias.map((d) => {
            const chave = `${d}-grade`;
            const posicoes = arrumarBlocos(porDia.get(d) ?? []);
            return (
              <div
                key={d}
                onClick={(e) => aoNovo(d, minutoDoClique(e, 30))}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(TIPO_ITEM)) return;
                  e.preventDefault();
                  aoAlvo(chave);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) aoAlvo(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  aoSoltar(e.dataTransfer.getData(TIPO_ITEM), d, minutoDoClique(e, 15));
                }}
                title="Clique para criar um compromisso ou uma tarefa"
                className={`relative cursor-cell border-l border-linha ${alvo === chave ? "bg-destaque-claro/50" : ""}`}
              >
                {Array.from({ length: 23 }, (_, h) => (
                  <div key={h} className="pointer-events-none absolute right-0 left-0 border-t border-linha" style={{ top: (h + 1) * alturaHora }} />
                ))}
                {posicoes.map(({ ocorrencia: o, coluna, colunas: total }) => {
                  const altura = Math.max(((o.fim! - o.inicio!) / 60) * alturaHora, 16);
                  return (
                    <button
                      key={o.chave}
                      type="button"
                      draggable={o.tipo === "tarefa"}
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.setData(TIPO_ITEM, o.chave);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        aoAbrir(o);
                      }}
                      title={`${horaDoBloco(o)} ${o.titulo}${o.recorrente ? " (repete)" : ""}`}
                      className={`absolute overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[12px] leading-tight ${classeDoChip(o)} ${
                        o.recorrente ? "opacity-80" : ""
                      }`}
                      style={{
                        top: (o.inicio! / 60) * alturaHora + 1,
                        height: altura - 2,
                        left: `calc(${(coluna / total) * 100}% + 2px)`,
                        width: `calc(${100 / total}% - 4px)`,
                      }}
                    >
                      <span className="block truncate font-semibold">{o.titulo}</span>
                      {altura > 30 && <span className="block truncate tabular-nums opacity-75">{horaDoBloco(o)}</span>}
                    </button>
                  );
                })}
                {d === hoje && (
                  <div className="pointer-events-none absolute right-0 left-0 z-10 h-0.5 bg-atraso" style={{ top: (agoraMin / 60) * alturaHora }}>
                    <span className="absolute -top-1 -left-1 size-2.5 rounded-full bg-atraso" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
