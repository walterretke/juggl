import { useState } from "react";

interface Props {
  /** Tela em que você estava, para lembrar o contexto depois. */
  tela: string;
  aoSalvar: (texto: string) => void;
  aoCancelar: () => void;
}

/** "O que irritou?": uma linha, Enter salva. Vira a lista de correções do período de uso real. */
export default function AnotarIrritacao({ tela, aoSalvar, aoCancelar }: Props) {
  const [texto, setTexto] = useState("");
  return (
    <div
      className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:pt-24"
      onMouseDown={(e) => e.target === e.currentTarget && aoCancelar()}
    >
      <form
        className="w-[min(520px,100%)] rounded-2xl bg-folha p-6 text-tinta shadow-2xl ring-1 ring-linha"
        onSubmit={(e) => {
          e.preventDefault();
          if (texto.trim()) aoSalvar(texto.trim());
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-apagado">Anotar · {tela}</p>
        <label htmlFor="irritacao" className="mt-1 block font-titulo text-xl font-medium">
          O que irritou?
        </label>
        <input
          id="irritacao"
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              aoCancelar();
            }
          }}
          placeholder="ex.: tive que clicar 3 vezes para mudar o prazo"
          className="mt-3 w-full rounded-lg border border-linha bg-cartao px-3 py-2 text-[15px] outline-none focus:border-destaque"
        />
        <p className="mt-3 text-xs text-apagado">Enter salva, Esc cancela. A lista fica na tela Uso.</p>
      </form>
    </div>
  );
}
