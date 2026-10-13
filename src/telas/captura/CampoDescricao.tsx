import { useLayoutEffect, useRef } from "react";

const MAX_LINHAS = 6;

interface Props {
  valor: string;
  aoMudar: (valor: string) => void;
  /** Texto de ajuda no campo vazio. */
  dica?: string;
  /** Linhas máximas antes de rolar. */
  maxLinhas?: number;
}

/** Descrição do pedido: várias linhas (Shift+Enter quebra a linha, Enter salva). Cresce até 6 linhas. */
export default function CampoDescricao({
  valor,
  aoMudar,
  dica = "Detalhes ou a mensagem recebida (opcional). Shift+Enter quebra a linha.",
  maxLinhas = MAX_LINHAS,
}: Props) {
  const campo = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = campo.current;
    if (!el) return;
    // Vazio fica com uma linha; medir o placeholder quebrado daria uma caixa enorme.
    if (!valor) {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    const linha = parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.style.height = `${Math.min(el.scrollHeight, linha * maxLinhas + 12)}px`;
  }, [valor, maxLinhas]);

  return (
    <div>
      <label htmlFor="captura-nota" className="block text-xs font-semibold text-suave">
        Descrição
      </label>
      <textarea
        id="captura-nota"
        ref={campo}
        rows={1}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={dica}
        className="mt-1 w-full resize-none rounded-lg border border-linha bg-cartao px-3 py-1.5 text-sm leading-5 outline-none placeholder:text-apagado focus:border-destaque"
      />
    </div>
  );
}
