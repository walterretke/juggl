import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tempoParado } from "../captura/datas";
import { gravarConfig } from "../db/config";
import { CHAVE_DETECTOR, detectorLigado } from "../db/detector";
import { listarPrioridades, type Prioridade } from "../db/prioridades";
import {
  CHAVE_NAO_PERTURBE,
  criarRegra,
  listarRegras,
  naoPerturbeLigado,
  opcoesDeRegra,
  removerRegra,
  salvarRegra,
  ultimasNotificacoes,
  type Notificacao,
} from "../db/regras";
import { descreverPersonalizada, type Nomes } from "../regras/descricao";
import type { CondicaoPersonalizada, IdPronta, Regra } from "../regras/motor";
import { notificar } from "../regras/notificar";
import Icone from "./Icone";

interface Props {
  aoAvisar: (texto: string) => void;
}

/** Texto de cada regra pronta, com o lugar do valor ajustável. */
const PRONTAS: Record<IdPronta, { antes: string; depois: string; campo: "horas" | "dias" | "itens" | "hora" }> = {
  prazo_chegando: { antes: "Item vence em menos de", depois: "horas (prazo conta até as 18h) e não está em foco.", campo: "horas" },
  promessa_esquecida: { antes: "Item prometido a alguém está parado há", depois: "dias ou mais.", campo: "dias" },
  inbox_acumulando: { antes: "A caixa de entrada passou de", depois: "itens sem triagem.", campo: "itens" },
  ritual_pendente: { antes: "O ritual da manhã não foi feito até", depois: ".", campo: "hora" },
  foco_esquecido: { antes: "O timer está rodando há mais de", depois: "horas no mesmo item.", campo: "horas" },
  fim_do_dia: { antes: "Resumo do que foi feito e do que vence amanhã, às", depois: "(dias úteis).", campo: "hora" },
};

const NOVA: Regra = {
  id: "",
  nome: "",
  tipo: "personalizada",
  condicao: {},
  acao: { tipo: "notificar" },
  ativa: true,
  urgente: false,
  ordem: 0,
};

function Interruptor({ ligado, rotulo, aoMudar }: { ligado: boolean; rotulo: string; aoMudar: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      title={`${ligado ? "Desligar" : "Ligar"} (Espaço)`}
      onClick={(e) => {
        e.stopPropagation();
        aoMudar(!ligado);
      }}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${ligado ? "bg-destaque" : "bg-linha"}`}
    >
      <span className={`absolute top-0.5 size-4 rounded-full bg-folha shadow transition-all ${ligado ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

function Urgente({ ligado, aoMudar }: { ligado: boolean; aoMudar: (v: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={ligado}
      title="Urgente passa pelo não perturbe durante o foco (U)"
      onClick={(e) => {
        e.stopPropagation();
        aoMudar(!ligado);
      }}
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        ligado ? "bg-atraso-claro text-atraso" : "bg-etiqueta text-apagado hover:text-tinta"
      }`}
    >
      {ligado ? "Urgente" : "Normal"}
    </button>
  );
}

/** Tela de regras: as seis prontas com ajustes, as personalizadas e os últimos avisos. */
export default function Regras({ aoAvisar }: Props) {
  const [regras, setRegras] = useState<Regra[] | null>(null);
  const [naoPerturbe, setNaoPerturbe] = useState(true);
  const [detector, setDetector] = useState(true);
  const [avisos, setAvisos] = useState<Notificacao[]>([]);
  const [opcoes, setOpcoes] = useState<{ pessoas: { id: string; nome: string }[]; projetos: { id: string; nome: string }[] }>({
    pessoas: [],
    projetos: [],
  });
  const [prioridades, setPrioridades] = useState<Prioridade[]>([]);
  const [selecionada, setSelecionada] = useState(0);
  const [editando, setEditando] = useState<Regra | null>(null);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [lidas, np, det, ultimos, ops, prios] = await Promise.all([
        listarRegras(),
        naoPerturbeLigado(),
        detectorLigado(),
        ultimasNotificacoes(),
        opcoesDeRegra(),
        listarPrioridades(),
      ]);
      setRegras(lidas);
      setNaoPerturbe(np);
      setDetector(det);
      setAvisos(ultimos);
      setOpcoes(ops);
      setPrioridades(prios);
    } catch (e) {
      setErro(String(e));
    }
  }, []);

  useEffect(() => {
    carregar();
    const relogio = setInterval(carregar, 60_000);
    return () => clearInterval(relogio);
  }, [carregar]);

  const nomes: Nomes = useMemo(
    () => ({
      pessoas: new Map(opcoes.pessoas.map((p) => [p.id, p.nome])),
      projetos: new Map(opcoes.projetos.map((p) => [p.id, p.nome])),
      prioridades: new Map(prioridades.map((p) => [p.id, p.nome])),
    }),
    [opcoes, prioridades],
  );

  const alterar = useCallback(
    async (regra: Regra) => {
      setRegras((atuais) => atuais?.map((r) => (r.id === regra.id ? regra : r)) ?? null);
      await salvarRegra(regra).catch((e) => setErro(String(e)));
    },
    [],
  );

  async function trocarNaoPerturbe(ligado: boolean) {
    setNaoPerturbe(ligado);
    await gravarConfig(CHAVE_NAO_PERTURBE, ligado ? "sim" : "nao");
  }

  const trocarDetector = useCallback(async (ligado: boolean) => {
    setDetector(ligado);
    await gravarConfig(CHAVE_DETECTOR, ligado ? "sim" : "nao");
  }, []);

  const testar = useCallback(async () => {
    const ok = await notificar("Teste do Juggl", "Se você está vendo isto, as notificações funcionam.");
    aoAvisar(ok ? "Notificação de teste enviada." : "O sistema não deixou mostrar notificações. Veja as permissões do Juggl.");
  }, [aoAvisar]);

  async function salvarEdicao() {
    if (!editando) return;
    const nome = editando.nome.trim() || "Regra sem nome";
    const condicao = Object.fromEntries(
      Object.entries(editando.condicao).filter(([, v]) => v !== undefined && v !== "" && v !== false && v !== 0),
    ) as CondicaoPersonalizada;
    if (Object.keys(condicao).length === 0) {
      setErro("Escolha pelo menos uma condição.");
      return;
    }
    const regra = { ...editando, nome, condicao };
    try {
      if (regra.id) await salvarRegra(regra);
      else await criarRegra(regra);
      setEditando(null);
      setErro(null);
      aoAvisar(regra.id ? "Regra salva." : "Regra criada.");
      await carregar();
    } catch (e) {
      setErro(String(e));
    }
  }

  async function confirmarRemocao(id: string) {
    setRemovendo(null);
    await removerRegra(id);
    aoAvisar("Regra removida.");
    await carregar();
  }

  // Teclado: ↑ ↓ escolhem, Espaço liga/desliga, U urgente, N nova, Enter edita, Delete remove, T testa,
  // P liga/desliga o alerta de prioridade errada.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (!regras || editando || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      const regra = regras[selecionada];
      const tecla = e.key.toLowerCase();
      if (removendo) {
        if (e.key === "Enter") confirmarRemocao(removendo);
        else if (e.key === "Escape") setRemovendo(null);
        else return;
      } else if (e.key === "ArrowDown" || tecla === "j") setSelecionada((s) => Math.min(s + 1, regras.length - 1));
      else if (e.key === "ArrowUp" || tecla === "k") setSelecionada((s) => Math.max(s - 1, 0));
      else if (e.key === " " && regra) alterar({ ...regra, ativa: !regra.ativa });
      else if (tecla === "u" && regra) alterar({ ...regra, urgente: !regra.urgente });
      else if (tecla === "n") setEditando({ ...NOVA });
      else if (e.key === "Enter" && regra?.tipo === "personalizada") setEditando(regra);
      else if (e.key === "Delete" && regra?.tipo === "personalizada") setRemovendo(regra.id);
      else if (tecla === "t") testar();
      else if (tecla === "p") trocarDetector(!detector);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [regras, selecionada, editando, removendo, alterar, testar, detector, trocarDetector]);

  if (!regras) return erro ? <p className="rounded-xl bg-atraso-claro px-4 py-3 text-sm text-atraso">{erro}</p> : null;

  const prontas = regras.filter((r) => r.tipo === "pronta");
  const personalizadas = regras.filter((r) => r.tipo === "personalizada");
  const linha = (indice: number) =>
    `flex items-center gap-3 rounded-xl px-4 py-3 ${
      indice === selecionada ? "bg-cartao shadow-[0_0_0_1.5px_var(--color-destaque)]" : "hover:bg-cartao/60"
    }`;
  const campoNumero = "w-14 rounded-md border border-linha bg-folha px-1.5 py-0.5 text-center text-sm tabular-nums outline-none focus:border-destaque";

  return (
    <div className="pb-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-cartao px-4 py-3 shadow-[0_0_0_1px_var(--color-linha)]">
        <Interruptor ligado={naoPerturbe} rotulo="Não perturbe durante o foco" aoMudar={trocarNaoPerturbe} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">Não perturbe durante o foco</p>
          <p className="text-[13px] text-suave">Com algo em foco, só os avisos urgentes aparecem. Os outros chegam juntos quando você pausa.</p>
        </div>
        <button
          type="button"
          onClick={testar}
          title="Mandar uma notificação de teste (T)"
          className="rounded-lg border border-linha px-3 py-1.5 text-sm hover:bg-etiqueta"
        >
          Testar notificação
        </button>
      </div>
      <div className="mt-2 flex items-center gap-3 rounded-xl bg-cartao px-4 py-3 shadow-[0_0_0_1px_var(--color-linha)]">
        <Interruptor ligado={detector} rotulo="Alerta de prioridade errada" aoMudar={trocarDetector} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">
            Alerta de prioridade errada <kbd className="ml-1 font-sans text-xs font-normal text-apagado">P</kbd>
          </p>
          <p className="text-[13px] text-suave">
            Avisa quando outro item fica bem mais urgente que o foco. Pontos: prazo (atrasado 50, hoje 40, amanhã 25, esta semana
            10), 15 por cobrança até 45, 2 por dia parado até 20, prioridade (a última 0, a penúltima 10, as de cima 20) e 15 se é uma das 3 do dia. Avisa com
            30 pontos de diferença, ou quando uma cobrança ou prazo novo faz outro passar à frente.
          </p>
        </div>
      </div>

      {erro && <p className="mt-4 rounded-xl bg-atraso-claro px-4 py-3 text-sm text-atraso">{erro}</p>}

      <h2 className="mt-8 mb-2 text-xs font-semibold uppercase tracking-wider text-apagado">Regras prontas</h2>
      <ul className="flex flex-col gap-1">
        {prontas.map((regra) => {
          const indice = regras.indexOf(regra);
          const texto = PRONTAS[regra.id as IdPronta];
          if (!texto) return null;
          const valor = regra.condicao[texto.campo];
          return (
            <li key={regra.id} className={linha(indice)} onClick={() => setSelecionada(indice)}>
              <Interruptor ligado={regra.ativa} rotulo={regra.nome} aoMudar={(ativa) => alterar({ ...regra, ativa })} />
              <div className={`min-w-0 flex-1 ${regra.ativa ? "" : "opacity-50"}`}>
                <p className="text-[15px] font-medium">{regra.nome}</p>
                <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-suave">
                  {texto.antes}
                  {texto.campo === "hora" ? (
                    <input
                      type="time"
                      aria-label={`Hora: ${regra.nome}`}
                      defaultValue={String(valor ?? "")}
                      onBlur={(e) => e.target.value && alterar({ ...regra, condicao: { ...regra.condicao, hora: e.target.value } })}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      className="rounded-md border border-linha bg-folha px-1.5 py-0.5 text-sm tabular-nums outline-none focus:border-destaque"
                    />
                  ) : (
                    <input
                      type="number"
                      min={1}
                      aria-label={`Valor: ${regra.nome}`}
                      defaultValue={Number(valor ?? 1)}
                      onBlur={(e) => {
                        const n = Math.max(1, Math.round(Number(e.target.value) || 1));
                        e.target.value = String(n);
                        alterar({ ...regra, condicao: { ...regra.condicao, [texto.campo]: n } });
                      }}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      className={campoNumero}
                    />
                  )}
                  {texto.depois}
                </p>
              </div>
              <Urgente ligado={regra.urgente} aoMudar={(urgente) => alterar({ ...regra, urgente })} />
            </li>
          );
        })}
      </ul>

      <div className="mt-8 mb-2 flex items-center">
        <h2 className="flex-1 text-xs font-semibold uppercase tracking-wider text-apagado">Regras personalizadas</h2>
        {!editando && (
          <button
            type="button"
            onClick={() => setEditando({ ...NOVA })}
            className="rounded-lg px-2.5 py-1 text-sm font-semibold text-destaque hover:bg-etiqueta"
          >
            + Nova regra <kbd className="font-sans font-normal text-apagado">N</kbd>
          </button>
        )}
      </div>

      {editando && (
        <EditorRegra
          regra={editando}
          opcoes={opcoes}
          prioridades={prioridades}
          aoMudar={setEditando}
          aoSalvar={salvarEdicao}
          aoCancelar={() => {
            setEditando(null);
            setErro(null);
          }}
        />
      )}

      {personalizadas.length === 0 && !editando && (
        <p className="px-4 text-[13px] text-apagado">
          Nenhuma ainda. Exemplo: se quem pediu for o chefe e estiver parado há 1 dia, notificar.
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {personalizadas.map((regra) => {
          const indice = regras.indexOf(regra);
          return (
            <li key={regra.id} className={`group ${linha(indice)}`} onClick={() => setSelecionada(indice)}>
              <Interruptor ligado={regra.ativa} rotulo={regra.nome} aoMudar={(ativa) => alterar({ ...regra, ativa })} />
              <div
                className={`min-w-0 flex-1 ${regra.ativa ? "" : "opacity-50"}`}
                onDoubleClick={() => setEditando(regra)}
                title="Dois cliques para editar (Enter)"
              >
                <p className="truncate text-[15px] font-medium">{regra.nome}</p>
                <p className="text-[13px] text-suave">{descreverPersonalizada(regra, nomes)}</p>
              </div>
              {removendo === regra.id ? (
                <span className="flex shrink-0 items-center gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => confirmarRemocao(regra.id)}
                    className="rounded-md bg-atraso px-2.5 py-0.5 font-semibold text-folha"
                  >
                    Remover
                  </button>
                  <button type="button" onClick={() => setRemovendo(null)} className="text-suave hover:text-tinta">
                    Cancelar
                  </button>
                </span>
              ) : (
                <>
                  {regra.acao.tipo === "notificar" && (
                    <Urgente ligado={regra.urgente} aoMudar={(urgente) => alterar({ ...regra, urgente })} />
                  )}
                  <div className="flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      title="Editar (Enter)"
                      aria-label="Editar"
                      onClick={() => setEditando(regra)}
                      className="rounded-md p-1.5 text-apagado hover:bg-etiqueta hover:text-tinta"
                    >
                      <Icone nome="lapis" />
                    </button>
                    <button
                      type="button"
                      title="Remover (Delete)"
                      aria-label="Remover"
                      onClick={() => setRemovendo(regra.id)}
                      className="rounded-md p-1.5 text-apagado hover:bg-etiqueta hover:text-tinta"
                    >
                      <Icone nome="lixeira" />
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <h2 className="mt-8 mb-2 text-xs font-semibold uppercase tracking-wider text-apagado">Últimos avisos</h2>
      {avisos.length === 0 ? (
        <p className="px-4 text-[13px] text-apagado">Nenhum aviso ainda.</p>
      ) : (
        <ul className="flex flex-col">
          {avisos.map((n) => (
            <li key={n.id} className="flex items-baseline gap-3 border-b border-linha px-4 py-2 text-[13px] last:border-0">
              <span className="w-12 shrink-0 text-xs tabular-nums text-apagado">{tempoParado(n.criada_em, new Date())}</span>
              <span className="min-w-0 flex-1">
                <b className="font-semibold">{n.titulo}</b> <span className="text-suave">{n.corpo}</span>
              </span>
              {!n.entregue_em && (
                <span className="shrink-0 rounded-full bg-etiqueta px-2 text-xs text-tinta-2" title="Sai quando você pausar o foco">
                  Esperando o foco
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface PropsEditor {
  regra: Regra;
  opcoes: { pessoas: { id: string; nome: string }[]; projetos: { id: string; nome: string }[] };
  prioridades: Prioridade[];
  aoMudar: (regra: Regra) => void;
  aoSalvar: () => void;
  aoCancelar: () => void;
}

/** Montar a regra sem código: "Se" com as condições, "Então" com a ação. */
function EditorRegra({ regra, opcoes, prioridades, aoMudar, aoSalvar, aoCancelar }: PropsEditor) {
  const caixa = useRef<HTMLFormElement>(null);
  useEffect(() => caixa.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), []);
  const c = regra.condicao;
  const condicao = (mudancas: Partial<CondicaoPersonalizada>) => aoMudar({ ...regra, condicao: { ...c, ...mudancas } });
  const select = "rounded-md border border-linha bg-folha px-2 py-1 text-sm outline-none focus:border-destaque";
  const rotulo = "w-28 shrink-0 text-[13px] text-suave";

  return (
    <form
      ref={caixa}
      className="mb-3 rounded-xl bg-cartao px-5 py-4 shadow-[0_0_0_1.5px_var(--color-destaque)]"
      onSubmit={(e) => {
        e.preventDefault();
        aoSalvar();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          aoCancelar();
        }
      }}
    >
      <input
        autoFocus
        value={regra.nome}
        onChange={(e) => aoMudar({ ...regra, nome: e.target.value })}
        placeholder="Nome da regra (ex.: Chefe esperando)"
        aria-label="Nome da regra"
        className="w-full bg-transparent text-[17px] font-medium outline-none placeholder:text-apagado"
      />

      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-apagado">Se</p>
      <div className="mt-2 flex flex-col gap-2">
        <label className="flex items-center gap-3">
          <span className={rotulo}>Quem pediu</span>
          <select value={c.pessoa_id ?? ""} onChange={(e) => condicao({ pessoa_id: e.target.value || undefined })} className={select}>
            <option value="">Qualquer pessoa</option>
            {opcoes.pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-3">
          <span className={rotulo}>Projeto</span>
          <select value={c.projeto_id ?? ""} onChange={(e) => condicao({ projeto_id: e.target.value || undefined })} className={select}>
            <option value="">Qualquer projeto</option>
            {opcoes.projetos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-3">
          <span className={rotulo}>Prioridade</span>
          <select
            value={c.prioridade_id ?? ""}
            onChange={(e) => condicao({ prioridade_id: e.target.value || undefined })}
            className={select}
          >
            <option value="">Qualquer prioridade</option>
            {prioridades.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-3">
          <span className={rotulo}>Prazo</span>
          <select
            value={c.prazo ?? ""}
            onChange={(e) => condicao({ prazo: (e.target.value || undefined) as CondicaoPersonalizada["prazo"] })}
            className={select}
          >
            <option value="">Qualquer prazo</option>
            <option value="hoje">Vence hoje</option>
            <option value="ate_amanha">Vence até amanhã</option>
            <option value="atrasado">Atrasado</option>
          </select>
        </label>
        <label className="flex items-center gap-3">
          <span className={rotulo}>Parado há</span>
          <input
            type="number"
            min={0}
            value={c.parado_dias ?? ""}
            onChange={(e) => condicao({ parado_dias: Number(e.target.value) || undefined })}
            placeholder="0"
            className="w-16 rounded-md border border-linha bg-folha px-2 py-1 text-sm tabular-nums outline-none focus:border-destaque"
          />
          <span className="text-[13px] text-suave">dias ou mais</span>
        </label>
        <label className="flex items-center gap-3">
          <span className={rotulo}>Cobrança</span>
          <input type="checkbox" checked={!!c.cobrado} onChange={(e) => condicao({ cobrado: e.target.checked || undefined })} />
          <span className="text-[13px] text-suave">alguém já cobrou</span>
        </label>
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-apagado">Então</p>
      <div role="radiogroup" className="mt-2 flex flex-wrap gap-1.5">
        {(
          [
            { tipo: "notificar", nome: "Notificar" },
            { tipo: "do_dia", nome: "Colocar entre as do dia" },
          ] as const
        ).map((o) => (
          <button
            key={o.tipo}
            type="button"
            role="radio"
            aria-checked={regra.acao.tipo === o.tipo}
            onClick={() => aoMudar({ ...regra, acao: { tipo: o.tipo } })}
            className={`rounded-full px-3 py-1 text-[13px] ${
              regra.acao.tipo === o.tipo ? "bg-destaque font-semibold text-folha" : "bg-etiqueta text-tinta-2 hover:text-tinta"
            }`}
          >
            {o.nome}
          </button>
        ))}
        {regra.acao.tipo === "notificar" && (
          <label className="ml-3 flex items-center gap-2 text-[13px] text-suave">
            <input type="checkbox" checked={regra.urgente} onChange={(e) => aoMudar({ ...regra, urgente: e.target.checked })} />
            Urgente (passa pelo não perturbe)
          </label>
        )}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button type="submit" className="rounded-lg bg-destaque px-4 py-1.5 text-sm font-semibold text-folha hover:opacity-90">
          {regra.id ? "Salvar" : "Criar regra"} <kbd className="ml-1 font-sans font-normal opacity-70">Enter</kbd>
        </button>
        <button type="button" onClick={aoCancelar} className="rounded-lg px-3 py-1.5 text-sm text-suave hover:bg-etiqueta">
          Cancelar <kbd className="ml-1 font-sans font-normal text-apagado">Esc</kbd>
        </button>
      </div>
    </form>
  );
}
