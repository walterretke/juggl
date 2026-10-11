import { useEffect, useState } from "react";
import { dataLocalIso, formatarDuracao } from "../../captura/datas";
import { itensParaLancar, lancarTempo } from "../../db/horas";
import { buscarOuCriarProjeto, listarSugestoes } from "../../db/itens";
import { interpretarDuracao, NOMES_DIA_CURTO } from "../../horas/calculo";

interface Props {
  segunda: Date;
  aoCancelar: () => void;
  /** Lançou: recarrega e mostra o texto. */
  aoLancar: (texto: string) => Promise<void>;
}

type ItemOpcao = { id: string; titulo: string; projeto: string | null };

const campo = "rounded-lg border border-linha bg-folha px-3 py-1.5 text-[15px] outline-none focus:border-destaque";

/**
 * Lançar tempo à mão: o que foi (um item ou só uma descrição, como "Reunião"), o projeto,
 * o dia da semana e a duração. Serve para reuniões e para o foco que ficou esquecido.
 */
export default function LancarTempo({ segunda, aoCancelar, aoLancar }: Props) {
  const dias = Array.from({ length: 7 }, (_, i) => new Date(segunda.getFullYear(), segunda.getMonth(), segunda.getDate() + i));
  const hoje = dataLocalIso(new Date());
  const [dia, setDia] = useState(() => Math.max(0, dias.findIndex((d) => dataLocalIso(d) === hoje)));
  const [oQue, setOQue] = useState("");
  const [projeto, setProjeto] = useState("");
  const [duracao, setDuracao] = useState("");
  const [inicio, setInicio] = useState("09:00");
  const [itens, setItens] = useState<ItemOpcao[]>([]);
  const [projetos, setProjetos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    itensParaLancar().then(setItens).catch(() => {});
    listarSugestoes()
      .then((s) => setProjetos(s.projetos))
      .catch(() => {});
  }, []);

  // O que foi digitado é um item existente? Então o tempo vai para ele (e para o projeto dele).
  const item = itens.find((i) => i.titulo.trim().toLowerCase() === oQue.trim().toLowerCase()) ?? null;
  const ms = interpretarDuracao(duracao);

  async function salvar() {
    if (!oQue.trim()) return setErro("Diga o que foi: um item ou uma descrição, como Reunião.");
    if (!ms) return setErro("Não entendi a duração. Use 1h30, 45min, 1:30 ou 1,5.");
    const [h, m] = inicio.split(":").map(Number);
    const d = dias[dia];
    const comeco = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 0, m || 0);
    try {
      const projetoId = !item && projeto.trim() ? await buscarOuCriarProjeto(projeto) : null;
      await lancarTempo({ itemId: item?.id ?? null, projetoId, descricao: item ? null : oQue, inicio: comeco, fim: new Date(comeco.getTime() + ms) });
      await aoLancar(`${formatarDuracao(ms)} lançados em ${item?.titulo ?? oQue.trim()} (${NOMES_DIA_CURTO[dia]}).`);
    } catch (e) {
      setErro(String(e));
    }
  }

  return (
    <form
      className="mt-5 flex flex-col gap-3 rounded-2xl bg-cartao p-5 shadow-[0_0_0_1.5px_var(--color-destaque)]"
      onSubmit={(e) => {
        e.preventDefault();
        salvar();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          aoCancelar();
        }
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-titulo text-xl font-medium">Lançar tempo</h2>
        <p className="text-[13px] text-suave">Reunião, suporte por telefone, o foco que ficou desligado.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-apagado">
          O que foi
          <input
            autoFocus
            list="lancar-itens"
            value={oQue}
            onChange={(e) => {
              setOQue(e.target.value);
              setErro(null);
            }}
            placeholder="Um item ou uma descrição (Reunião de planejamento)"
            className={`${campo} font-normal normal-case tracking-normal text-tinta`}
          />
          <datalist id="lancar-itens">
            {itens.slice(0, 200).map((i) => (
              <option key={i.id} value={i.titulo}>
                {i.projeto ?? ""}
              </option>
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-apagado">
          Projeto
          <input
            list="lancar-projetos"
            value={item ? (item.projeto ?? "") : projeto}
            disabled={!!item}
            onChange={(e) => setProjeto(e.target.value)}
            placeholder={item ? "Sem projeto" : "Opcional"}
            title={item ? "O tempo vai para o projeto do item" : undefined}
            className={`${campo} font-normal normal-case tracking-normal text-tinta disabled:opacity-60`}
          />
          <datalist id="lancar-projetos">
            {projetos.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div role="radiogroup" aria-label="Dia" className="flex flex-wrap gap-1">
          {dias.map((d, i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={dia === i}
              onClick={() => setDia(i)}
              className={`rounded-full px-3 py-1 text-[13px] ${
                dia === i ? "bg-destaque font-semibold text-folha" : "bg-etiqueta text-tinta-2 hover:text-tinta"
              }`}
            >
              {NOMES_DIA_CURTO[i]} {d.getDate()}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-apagado">
          Duração
          <input
            value={duracao}
            onChange={(e) => {
              setDuracao(e.target.value);
              setErro(null);
            }}
            placeholder="1h30"
            className={`${campo} w-24 font-normal normal-case tracking-normal text-tinta`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-apagado">
          A partir de
          <input
            type="time"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            className={`${campo} font-normal normal-case tracking-normal text-tinta tabular-nums`}
          />
        </label>
        <span className="pb-2 text-[13px] text-suave">{ms ? formatarDuracao(ms) : ""}</span>
      </div>
      {erro && <p className="text-sm text-atraso">{erro}</p>}
      <div className="flex gap-2">
        <button type="submit" className="rounded-lg bg-destaque px-4 py-2 text-sm font-semibold text-folha hover:opacity-90">
          Lançar <kbd className="ml-1 font-sans font-normal opacity-70">Enter</kbd>
        </button>
        <button type="button" onClick={aoCancelar} className="rounded-lg px-3 py-2 text-sm text-suave hover:bg-etiqueta">
          Cancelar <kbd className="ml-1 font-sans font-normal text-apagado">Esc</kbd>
        </button>
      </div>
    </form>
  );
}
