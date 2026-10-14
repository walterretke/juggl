import { useState } from "react";
import { DIAS_CURTOS, deIso, descreverRepeticao, hora, minutos, type Compromisso, type Repeticao } from "../../agenda/agenda";
import { alterarCompromisso, apagarCompromisso, criarCompromisso, pularDia, type DadosCompromisso } from "../../db/agenda";
import { criarItem, gravarCampos } from "../../db/itens";

/** Abrir para criar (um horário clicado na agenda) ou para editar um compromisso. */
export type Abertura =
  | { tipo: "novo"; dia: string; inicio: number | null }
  | { tipo: "editar"; compromisso: Compromisso; dia: string };

interface Props {
  abertura: Abertura;
  aoFechar: () => void;
  /** Gravou algo: recarrega e mostra o aviso. */
  aoGravar: (aviso: string) => void;
}

const REPETICOES: { valor: Repeticao; nome: string }[] = [
  { valor: "nao", nome: "Não repete" },
  { valor: "diaria", nome: "Todo dia" },
  { valor: "dias_uteis", nome: "Dias úteis" },
  { valor: "semanal", nome: "Toda semana" },
  { valor: "mensal", nome: "Todo mês" },
];

/** Segunda a domingo, nos números do getDay() (0 = domingo). */
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];

const campo = "rounded-lg border border-linha bg-cartao px-3 py-1.5 text-sm outline-none focus:border-destaque";

/** Criar ou editar um compromisso da agenda; ao criar, dá para fazer uma tarefa no lugar. */
export default function FormCompromisso({ abertura, aoFechar, aoGravar }: Props) {
  const existente = abertura.tipo === "editar" ? abertura.compromisso : null;
  const inicioPadrao = abertura.tipo === "novo" ? abertura.inicio : null;
  const [tipo, setTipo] = useState<"compromisso" | "tarefa">("compromisso");
  const [titulo, setTitulo] = useState(existente?.titulo ?? "");
  const [nota, setNota] = useState(existente?.nota ?? "");
  const [data, setData] = useState(existente?.data ?? abertura.dia);
  const [semHorario, setSemHorario] = useState(existente ? !existente.hora_inicio : inicioPadrao === null);
  const [inicio, setInicio] = useState(existente?.hora_inicio ?? hora(inicioPadrao ?? 9 * 60));
  const [fim, setFim] = useState(existente?.hora_fim ?? hora((inicioPadrao ?? 9 * 60) + 60));
  const [repete, setRepete] = useState<Repeticao>(existente?.repete ?? "nao");
  const [dias, setDias] = useState<number[]>(
    existente?.dias_semana ? existente.dias_semana.split(",").map(Number) : [deIso(existente?.data ?? abertura.dia).getDay()],
  );
  const [ate, setAte] = useState(existente?.ate ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);

  function trocarInicio(novo: string) {
    // Mudar o início leva o fim junto, mantendo a duração.
    if (novo && inicio && fim) setFim(hora(minutos(novo) + Math.max(15, minutos(fim) - minutos(inicio))));
    setInicio(novo);
  }

  async function salvar() {
    if (!titulo.trim()) {
      setErro("Escreva um título.");
      return;
    }
    if (!data) {
      setErro("Escolha o dia.");
      return;
    }
    if (!semHorario && fim && inicio && minutos(fim) <= minutos(inicio)) {
      setErro("O fim precisa ser depois do início.");
      return;
    }
    try {
      if (tipo === "tarefa") {
        const id = await criarItem(
          { titulo: titulo.trim(), pessoa: null, projeto: null, prioridade: null, prazo: semHorario ? data : null, link: null, origem: "manual", idExterno: null },
          null,
          nota,
          "a_fazer",
        );
        if (!semHorario) await gravarCampos(id, { agenda_inicio: `${data}T${inicio}`, agenda_fim: `${data}T${fim}` });
        aoGravar("Tarefa criada em A fazer.");
        return;
      }
      const dados: DadosCompromisso = {
        titulo,
        nota: nota.trim() || null,
        data,
        hora_inicio: semHorario ? null : inicio,
        hora_fim: semHorario ? null : fim,
        repete,
        dias_semana: repete === "semanal" ? (dias.length ? dias : [deIso(data).getDay()]).join(",") : null,
        ate: repete !== "nao" && ate ? ate : null,
      };
      if (existente) await alterarCompromisso(existente.id, dados);
      else await criarCompromisso(dados);
      aoGravar(existente ? "Compromisso salvo." : "Compromisso criado.");
    } catch (e) {
      setErro(String(e));
    }
  }

  async function apagar(soEsteDia: boolean) {
    if (!existente || abertura.tipo !== "editar") return;
    try {
      if (soEsteDia) await pularDia(existente.id, abertura.dia);
      else await apagarCompromisso(existente.id);
      aoGravar(soEsteDia ? "Tirei só este dia." : "Compromisso apagado.");
    } catch (e) {
      setErro(String(e));
    }
  }

  const repeticao = descreverRepeticao({ repete, dias_semana: dias.join(","), data });

  return (
    <div
      className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:pt-20"
      onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            aoFechar();
          }
        }}
        className="flex w-[min(520px,100%)] flex-col gap-3.5 rounded-2xl bg-folha p-6 text-tinta shadow-2xl ring-1 ring-linha select-text"
      >
        {!existente && (
          <div role="radiogroup" aria-label="O que criar" className="flex gap-1.5">
            {(
              [
                ["compromisso", "Compromisso"],
                ["tarefa", "Tarefa"],
              ] as const
            ).map(([valor, nome]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={tipo === valor}
                onClick={() => setTipo(valor)}
                className={`rounded-full px-3 py-1 text-[13px] ${tipo === valor ? "bg-destaque font-semibold text-folha" : "bg-etiqueta text-tinta-2"}`}
              >
                {nome}
              </button>
            ))}
          </div>
        )}
        <input
          autoFocus
          value={titulo}
          onChange={(e) => {
            setTitulo(e.target.value);
            setErro(null);
          }}
          placeholder={tipo === "tarefa" ? "O que fazer (ex.: fazer a barba)" : "Compromisso (ex.: academia)"}
          className="h-10 w-full bg-transparent text-xl caret-destaque outline-none placeholder:text-apagado"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} aria-label="Dia" />
          {!semHorario && (
            <>
              <input type="time" value={inicio} onChange={(e) => trocarInicio(e.target.value)} className={campo} aria-label="Início" />
              <span className="text-suave">até</span>
              <input type="time" value={fim} onChange={(e) => setFim(e.target.value)} className={campo} aria-label="Fim" />
            </>
          )}
          <label className="flex items-center gap-1.5 text-sm text-suave">
            <input type="checkbox" checked={semHorario} onChange={(e) => setSemHorario(e.target.checked)} />
            Sem horário
          </label>
        </div>

        {tipo === "compromisso" && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              {REPETICOES.map((r) => (
                <button
                  key={r.valor}
                  type="button"
                  aria-pressed={repete === r.valor}
                  onClick={() => setRepete(r.valor)}
                  className={`rounded-full px-3 py-1 text-[13px] ${repete === r.valor ? "bg-destaque font-semibold text-folha" : "bg-etiqueta text-tinta-2"}`}
                >
                  {r.nome}
                </button>
              ))}
            </div>
            {repete === "semanal" && (
              <div className="flex gap-1">
                {ORDEM_SEMANA.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={dias.includes(d)}
                    onClick={() => setDias(dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d])}
                    className={`size-9 rounded-full text-[12px] font-semibold ${dias.includes(d) ? "bg-destaque text-folha" : "bg-etiqueta text-suave"}`}
                  >
                    {DIAS_CURTOS[d]}
                  </button>
                ))}
              </div>
            )}
            {repete !== "nao" && (
              <label className="flex items-center gap-2 text-sm text-suave">
                {repeticao}, até
                <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={campo} aria-label="Repete até" />
                {!ate && <span className="text-apagado">(sem fim)</span>}
              </label>
            )}
          </div>
        )}

        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={2}
          placeholder="Observação (opcional)"
          className={`${campo} resize-y`}
        />
        {erro && <p className="text-sm text-atraso">{erro}</p>}

        <div className="flex flex-wrap items-center gap-2 border-t border-linha pt-3">
          {existente &&
            (apagando ? (
              <>
                {existente.repete !== "nao" && (
                  <button type="button" onClick={() => apagar(true)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-atraso hover:bg-atraso-claro">
                    Só este dia
                  </button>
                )}
                <button type="button" onClick={() => apagar(false)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-atraso hover:bg-atraso-claro">
                  {existente.repete !== "nao" ? "Todos os dias" : "Apagar mesmo"}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setApagando(true)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-atraso hover:bg-atraso-claro">
                Apagar
              </button>
            ))}
          <span className="flex-1" />
          <button type="button" onClick={aoFechar} className="rounded-lg px-3 py-1.5 text-sm text-suave hover:bg-etiqueta">
            Cancelar
          </button>
          <button type="submit" className="rounded-lg bg-destaque px-4 py-1.5 text-sm font-semibold text-folha hover:opacity-90">
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}
