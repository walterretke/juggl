import { useEffect, useRef, useState } from "react";
import { dataLocalIso } from "../../captura/datas";

const NOMES_MES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const INICIAIS_DIA = ["D", "S", "T", "Q", "Q", "S", "S"];

interface Props {
  /** Data escolhida (AAAA-MM-DD) ou null. */
  valor: string | null;
  aoEscolher: (data: string) => void;
  aoFechar: () => void;
}

function deIso(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

function somarDias(data: Date, dias: number): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate() + dias);
}

/** Calendário do mês pelo teclado: setas mudam o dia, PageUp/PageDown o mês, Enter escolhe, Esc fecha. */
export default function Calendario({ valor, aoEscolher, aoFechar }: Props) {
  const hoje = dataLocalIso(new Date());
  const [cursor, setCursor] = useState(() => (valor ? deIso(valor) : new Date()));
  const grade = useRef<HTMLDivElement>(null);

  useEffect(() => {
    grade.current?.focus();
  }, []);

  const primeiro = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const inicio = somarDias(primeiro, -primeiro.getDay());
  const dias = Array.from({ length: 42 }, (_, i) => somarDias(inicio, i));
  const semanas = dias[35].getMonth() === cursor.getMonth() ? 6 : 5;

  function aoTeclar(e: React.KeyboardEvent) {
    const passos: Record<string, () => Date> = {
      ArrowLeft: () => somarDias(cursor, -1),
      ArrowRight: () => somarDias(cursor, 1),
      ArrowUp: () => somarDias(cursor, -7),
      ArrowDown: () => somarDias(cursor, 7),
      PageUp: () => new Date(cursor.getFullYear(), cursor.getMonth() - 1, Math.min(cursor.getDate(), 28)),
      PageDown: () => new Date(cursor.getFullYear(), cursor.getMonth() + 1, Math.min(cursor.getDate(), 28)),
    };
    if (e.key in passos) {
      e.preventDefault();
      setCursor(passos[e.key]());
    } else if (e.key === "Enter") {
      e.preventDefault();
      aoEscolher(dataLocalIso(cursor));
    } else if (e.key === "Escape") {
      e.preventDefault();
      aoFechar();
    }
  }

  function mudarMes(delta: number) {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    grade.current?.focus();
  }

  const botaoMes = "rounded-md px-2 py-0.5 text-suave hover:bg-etiqueta hover:text-tinta";

  return (
    <div className="mt-2 w-72 rounded-xl border border-linha bg-cartao p-3">
      <div className="flex items-center justify-between">
        <button type="button" tabIndex={-1} aria-label="Mês anterior" onClick={() => mudarMes(-1)} className={botaoMes}>
          ‹
        </button>
        <span className="text-sm font-semibold capitalize">
          {NOMES_MES[cursor.getMonth()]} {cursor.getFullYear()}
        </span>
        <button type="button" tabIndex={-1} aria-label="Próximo mês" onClick={() => mudarMes(1)} className={botaoMes}>
          ›
        </button>
      </div>
      <div
        ref={grade}
        tabIndex={0}
        role="grid"
        aria-label="Escolha o prazo"
        onKeyDown={aoTeclar}
        className="mt-2 grid grid-cols-7 gap-0.5 rounded-md text-center text-sm outline-none focus-visible:ring-2 focus-visible:ring-destaque/40"
      >
        {INICIAIS_DIA.map((d, i) => (
          <span key={i} className="py-1 text-xs font-semibold text-apagado">
            {d}
          </span>
        ))}
        {dias.slice(0, semanas * 7).map((dia) => {
          const iso = dataLocalIso(dia);
          const doMes = dia.getMonth() === cursor.getMonth();
          const noCursor = iso === dataLocalIso(cursor);
          const escolhido = iso === valor;
          return (
            <button
              key={iso}
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => aoEscolher(iso)}
              className={`rounded-md py-1 tabular-nums ${
                escolhido
                  ? "bg-destaque font-semibold text-folha"
                  : noCursor
                    ? "bg-destaque-claro text-destaque-tinta"
                    : doMes
                      ? "hover:bg-etiqueta"
                      : "text-apagado hover:bg-etiqueta"
              } ${iso === hoje && !escolhido ? "font-bold underline underline-offset-4" : ""}`}
            >
              {dia.getDate()}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-apagado">Setas mudam o dia, Enter escolhe, Esc fecha.</p>
    </div>
  );
}
