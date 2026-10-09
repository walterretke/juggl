import { useMemo, useState } from "react";
import { normalizarNome } from "../../captura/parser";

const MAX_OPCOES = 5;

interface Props {
  id: string;
  rotulo: string;
  valor: string;
  opcoes: string[];
  placeholder?: string;
  aoMudar: (valor: string) => void;
}

/**
 * Campo de texto que sugere nomes já usados enquanto você digita.
 * ↑↓ escolhem, Tab ou Enter aceitam. Um nome novo é criado ao salvar.
 */
export default function Autocompletar({ id, rotulo, valor, opcoes, placeholder, aoMudar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(0);

  const busca = normalizarNome(valor);
  const filtradas = useMemo(() => {
    if (!busca) return [];
    return opcoes.filter((o) => normalizarNome(o).includes(busca) && normalizarNome(o) !== busca).slice(0, MAX_OPCOES);
  }, [opcoes, busca]);
  const existe = opcoes.some((o) => normalizarNome(o) === busca);
  const mostrarLista = aberto && filtradas.length > 0;

  function aceitar(opcao: string) {
    aoMudar(opcao);
    setAberto(false);
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!mostrarLista) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const passo = e.key === "ArrowDown" ? 1 : -1;
      setDestaque((destaque + passo + filtradas.length) % filtradas.length);
    } else if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      aceitar(filtradas[destaque]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setAberto(false);
    }
  }

  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="block text-xs font-semibold text-suave">
        {rotulo}
      </label>
      <input
        id={id}
        value={valor}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        onChange={(e) => {
          aoMudar(e.target.value);
          setAberto(true);
          setDestaque(0);
        }}
        onKeyDown={aoTeclar}
        onBlur={() => setAberto(false)}
        role="combobox"
        aria-expanded={mostrarLista}
        aria-controls={`${id}-opcoes`}
        className="mt-1 w-full rounded-lg border border-linha bg-cartao px-3 py-1.5 text-[15px] outline-none placeholder:text-apagado focus:border-destaque"
      />
      {mostrarLista && (
        <ul id={`${id}-opcoes`} role="listbox" className="mt-1 overflow-hidden rounded-lg border border-linha bg-cartao">
          {filtradas.map((opcao, i) => (
            <li
              key={opcao}
              role="option"
              aria-selected={i === destaque}
              onMouseDown={(e) => {
                e.preventDefault();
                aceitar(opcao);
              }}
              className={`cursor-pointer px-3 py-1 text-sm ${i === destaque ? "bg-destaque-claro text-destaque-tinta" : ""}`}
            >
              {opcao}
            </li>
          ))}
        </ul>
      )}
      {valor.trim() && !existe && !mostrarLista && (
        <p className="mt-1 text-xs text-apagado">Novo: fica salvo para as próximas vezes.</p>
      )}
    </div>
  );
}
