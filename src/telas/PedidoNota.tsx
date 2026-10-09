import { useState } from "react";

interface Props {
  titulo: string;
  aoConfirmar: (nota: string | null) => void;
  aoCancelar: () => void;
}

/** Pergunta onde você parou antes de pausar ou trocar de tarefa. A nota é opcional. */
export default function PedidoNota({ titulo, aoConfirmar, aoCancelar }: Props) {
  const [nota, setNota] = useState("");
  return (
    <div
      className="fixed inset-0 z-10 flex items-start justify-center bg-black/30 pt-24"
      onMouseDown={(e) => e.target === e.currentTarget && aoCancelar()}
    >
      <form
        className="w-[min(520px,90vw)] rounded-2xl bg-folha p-6 text-tinta shadow-2xl ring-1 ring-linha"
        onSubmit={(e) => {
          e.preventDefault();
          aoConfirmar(nota.trim() || null);
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-apagado">Pausando</p>
        <p className="mt-1 truncate font-titulo text-xl font-medium">{titulo}</p>
        <label htmlFor="nota-pausa" className="mt-4 block text-sm text-suave">
          Onde você parou? Opcional, mas ajuda a voltar depois.
        </label>
        <input
          id="nota-pausa"
          autoFocus
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              aoCancelar();
            }
          }}
          placeholder="ex.: falta validar o filtro de datas"
          className="mt-2 w-full rounded-lg border border-linha bg-cartao px-3 py-2 text-[15px] outline-none focus:border-destaque"
        />
        <p className="mt-3 text-xs text-apagado">Enter pausa, Esc cancela.</p>
      </form>
    </div>
  );
}
