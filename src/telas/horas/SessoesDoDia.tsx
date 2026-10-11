import { useEffect, useState } from "react";
import { formatarDuracao } from "../../captura/datas";
import { ajustarSessao, apagarSessao, itensParaLancar, moverSessao } from "../../db/horas";
import { NOMES_DIA_CURTO, sessoesDaCelula, type Sessao } from "../../horas/calculo";

/** Uma célula da tabela: um dia de um projeto (e, se for linha de item, de um item). */
export interface Celula {
  dia: number;
  projetoId: string | null;
  itemChave: string | null;
}

interface Props {
  celula: Celula;
  segunda: Date;
  sessoes: Sessao[];
  aoFechar: () => void;
  /** Algo mudou: recarrega e mostra o texto. */
  aoMudar: (texto: string) => Promise<void>;
}

const ROTULO: Record<Sessao["tipo"], string> = { foco: "Foco", manual: "À mão", andamento: "Rodando agora" };

function hora(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Mesmo dia de `base`, na hora "HH:MM". */
function naHora(base: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h || 0, m || 0);
}

/**
 * As sessões de um dia, para corrigir: mudar início e fim, passar para outro item ou apagar.
 * A sessão que está rodando só aparece; ela se ajusta pausando o foco.
 */
export default function SessoesDoDia({ celula, segunda, sessoes, aoFechar, aoMudar }: Props) {
  const lista = sessoesDaCelula(sessoes, segunda, celula.dia, celula.projetoId, celula.itemChave);
  const dia = new Date(segunda.getFullYear(), segunda.getMonth(), segunda.getDate() + celula.dia);
  const [itens, setItens] = useState<{ id: string; titulo: string }[]>([]);
  const [movendo, setMovendo] = useState<string | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    itensParaLancar().then(setItens).catch(() => {});
  }, []);

  async function ajustar(s: Sessao, campo: "inicio" | "fim", valor: string) {
    if (!valor) return;
    const inicio = campo === "inicio" ? naHora(s.inicio, valor) : s.inicio;
    // O fim pode ser no dia seguinte (sessão que passou da meia-noite): mantém o dia dele.
    const fim = campo === "fim" ? naHora(s.fim, valor) : s.fim;
    if (inicio.getTime() === s.inicio.getTime() && fim.getTime() === s.fim.getTime()) return;
    if (fim <= inicio) return setErro("O fim precisa ser depois do início.");
    setErro(null);
    await ajustarSessao(s, inicio, fim);
    await aoMudar(`Sessão ajustada: ${formatarDuracao(fim.getTime() - inicio.getTime())}.`);
  }

  async function mover(s: Sessao, titulo: string) {
    const destino = itens.find((i) => i.titulo.trim().toLowerCase() === titulo.trim().toLowerCase());
    if (!destino) return setErro("Escolha um item da lista.");
    setMovendo(null);
    await moverSessao(s, destino.id);
    await aoMudar(`Sessão passou para ${destino.titulo}.`);
  }

  async function apagar(s: Sessao) {
    if (apagando !== s.id) return setApagando(s.id);
    setApagando(null);
    await apagarSessao(s);
    await aoMudar(`Sessão de ${formatarDuracao(s.fim.getTime() - s.inicio.getTime())} apagada.`);
  }

  const horaCampo = "w-[5.5rem] rounded-md border border-linha bg-folha px-1.5 py-0.5 text-sm tabular-nums outline-none focus:border-destaque";

  return (
    <section aria-label="Sessões do dia" className="mt-4 rounded-2xl bg-cartao p-4 shadow-[0_0_0_1.5px_var(--color-destaque)]">
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">
          Sessões de {NOMES_DIA_CURTO[celula.dia]} {String(dia.getDate()).padStart(2, "0")}/{String(dia.getMonth() + 1).padStart(2, "0")}
          {lista[0] && <span className="font-normal text-suave"> · {lista[0].projeto ?? "Sem projeto"}</span>}
        </h2>
        <button type="button" onClick={aoFechar} className="text-sm text-suave hover:text-tinta">
          Fechar <kbd className="ml-1 font-sans text-xs">Esc</kbd>
        </button>
      </header>
      {lista.length === 0 && <p className="text-sm text-suave">Nenhuma sessão neste dia.</p>}
      <ul className="flex flex-col gap-1.5">
        {lista.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-folha px-3 py-2 text-sm">
            <span className="min-w-[14ch] flex-1 truncate font-medium" title={s.titulo}>
              {s.titulo}
            </span>
            <span className="shrink-0 rounded-full bg-etiqueta px-2 text-xs font-semibold text-tinta-2">{ROTULO[s.tipo]}</span>
            {s.tipo === "andamento" ? (
              <span className="tabular-nums text-suave">desde {hora(s.inicio)}</span>
            ) : (
              <span className="flex items-center gap-1">
                <input
                  type="time"
                  aria-label="Início"
                  defaultValue={hora(s.inicio)}
                  onBlur={(e) => ajustar(s, "inicio", e.target.value).catch((x) => setErro(String(x)))}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  className={horaCampo}
                />
                <span className="text-apagado">–</span>
                <input
                  type="time"
                  aria-label="Fim"
                  defaultValue={hora(s.fim)}
                  onBlur={(e) => ajustar(s, "fim", e.target.value).catch((x) => setErro(String(x)))}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  className={horaCampo}
                />
              </span>
            )}
            <span className="w-16 shrink-0 text-right tabular-nums text-suave">{formatarDuracao(s.fim.getTime() - s.inicio.getTime())}</span>
            {s.tipo !== "andamento" && (
              <span className="flex shrink-0 items-center gap-1">
                {movendo === s.id ? (
                  <input
                    autoFocus
                    list="sessao-itens"
                    placeholder="Passar para o item…"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") mover(s, e.currentTarget.value).catch((x) => setErro(String(x)));
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setMovendo(null);
                      }
                    }}
                    onBlur={() => setMovendo(null)}
                    className="w-56 rounded-md border border-destaque bg-folha px-2 py-0.5 text-sm outline-none"
                  />
                ) : (
                  <button type="button" onClick={() => setMovendo(s.id)} className="rounded-md px-2 py-0.5 text-[13px] text-suave hover:bg-etiqueta hover:text-tinta">
                    Mover
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => apagar(s).catch((x) => setErro(String(x)))}
                  onBlur={() => setApagando((a) => (a === s.id ? null : a))}
                  className={`rounded-md px-2 py-0.5 text-[13px] ${
                    apagando === s.id ? "bg-atraso-claro font-semibold text-atraso" : "text-suave hover:bg-etiqueta hover:text-tinta"
                  }`}
                >
                  {apagando === s.id ? "Apagar mesmo?" : "Apagar"}
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <datalist id="sessao-itens">
        {itens.slice(0, 200).map((i) => (
          <option key={i.id} value={i.titulo} />
        ))}
      </datalist>
      {erro && <p className="mt-2 text-sm text-atraso">{erro}</p>}
      <p className="mt-2 text-xs text-apagado">Mudar a hora salva ao sair do campo. A sessão que está rodando se ajusta pausando o foco.</p>
    </section>
  );
}
