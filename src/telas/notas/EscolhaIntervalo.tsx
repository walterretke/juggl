import { useEffect, useRef, useState } from "react";
import { descreverIntervalo, INTERVALOS_RAPIDOS, type EscolhaIntervalo as Escolha, type Unidade } from "../../notas/lembrete";

interface Props {
  escolha: Escolha;
  aoMudar: (escolha: Escolha) => void;
}

const chip = (ativo: boolean) =>
  `rounded-full px-3 py-1 text-[13px] ${ativo ? "bg-destaque font-semibold text-folha" : "bg-etiqueta text-tinta-2 hover:text-tinta"}`;

/** "Lembrar a cada": 15 min, 30 min, 1 h, 2 h ou outro valor em minutos ou horas. */
export default function EscolhaIntervalo({ escolha, aoMudar }: Props) {
  const campo = useRef<HTMLInputElement>(null);
  // Foca o valor só quando "Outro" é clicado, não quando já vem marcado (o título fica com o foco).
  const [focarOutro, setFocarOutro] = useState(false);
  useEffect(() => {
    if (focarOutro && escolha.tipo === "outro") {
      campo.current?.focus();
      setFocarOutro(false);
    }
  }, [focarOutro, escolha.tipo]);

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="mr-1 text-suave">Lembrar a cada</span>
      <div role="radiogroup" aria-label="Lembrar a cada" className="flex flex-wrap gap-1.5">
        {INTERVALOS_RAPIDOS.map((m) => {
          const ativo = escolha.tipo === "rapido" && escolha.minutos === m;
          return (
            <button key={m} type="button" role="radio" aria-checked={ativo} onClick={() => aoMudar({ tipo: "rapido", minutos: m })} className={chip(ativo)}>
              {descreverIntervalo(m)}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={escolha.tipo === "outro"}
          onClick={() => {
            if (escolha.tipo !== "outro") aoMudar({ tipo: "outro", valor: "", unidade: "min" });
            setFocarOutro(true);
          }}
          className={chip(escolha.tipo === "outro")}
        >
          Outro
        </button>
      </div>
      {escolha.tipo === "outro" && (
        <span className="flex items-center gap-1">
          <input
            ref={campo}
            inputMode="decimal"
            aria-label="Intervalo"
            value={escolha.valor}
            onChange={(e) => aoMudar({ ...escolha, valor: e.target.value })}
            className="w-14 rounded-lg border border-linha bg-cartao px-2 py-0.5 text-right outline-none focus:border-destaque"
          />
          <select
            aria-label="Unidade"
            value={escolha.unidade}
            onChange={(e) => aoMudar({ ...escolha, unidade: e.target.value as Unidade })}
            className="rounded-lg border border-linha bg-cartao px-1.5 py-0.5 outline-none focus:border-destaque"
          >
            <option value="min">min</option>
            <option value="h">h</option>
          </select>
        </span>
      )}
    </div>
  );
}
