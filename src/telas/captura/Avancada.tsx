import { useCallback, useEffect, useMemo, useState } from "react";
import { descreverPrazo } from "../../captura/datas";
import { nomeParaMarcacao, normalizarNome, type Captura } from "../../captura/parser";
import type { Prioridade } from "../../db/prioridades";
import { ETIQUETA_PRIORIDADE } from "../cores";

const MAX_SUGESTOES = 5;

interface Props {
  texto: string;
  aoMudar: (texto: string) => void;
  captura: Captura;
  sugestoes: { pessoas: string[]; projetos: string[] };
  prioridades: Prioridade[];
  refEntrada: React.RefObject<HTMLInputElement | null>;
}

/** Captura avançada: uma linha com @pessoa, #projeto, !prioridade e >prazo. */
export default function Avancada({ texto, aoMudar, captura, sugestoes, prioridades, refEntrada }: Props) {
  const [selecionada, setSelecionada] = useState(0);

  // Autocompletar da palavra que está sendo digitada no fim da linha.
  const ultima = texto.match(/(^|\s)([@#])([^\s]*)$/);
  const opcoes = useMemo(() => {
    if (!ultima) return [];
    const lista = ultima[2] === "@" ? sugestoes.pessoas : sugestoes.projetos;
    const inicio = normalizarNome(ultima[3]);
    return lista
      .filter((s) => normalizarNome(s).startsWith(inicio) && normalizarNome(s) !== inicio)
      .slice(0, MAX_SUGESTOES);
  }, [ultima?.[2], ultima?.[3], sugestoes]);

  useEffect(() => setSelecionada(0), [opcoes.length]);

  const completar = useCallback(
    (opcao: string) => {
      if (!ultima) return;
      aoMudar(texto.slice(0, texto.length - ultima[3].length) + nomeParaMarcacao(opcao) + " ");
      refEntrada.current?.focus();
    },
    [texto, ultima, aoMudar, refEntrada],
  );

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (opcoes.length === 0) return;
    if (e.key === "Tab") {
      e.preventDefault();
      completar(opcoes[selecionada]);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const passo = e.key === "ArrowDown" ? 1 : -1;
      setSelecionada((selecionada + passo + opcoes.length) % opcoes.length);
    }
  }

  const prioridade = prioridades.find((p) => p.id === captura.prioridade);
  const etiquetas: { texto: string; classe: string }[] = [];
  if (captura.pessoa) etiquetas.push({ texto: captura.pessoa, classe: "bg-destaque-claro text-destaque-tinta" });
  if (captura.projeto) etiquetas.push({ texto: captura.projeto, classe: "bg-etiqueta text-tinta-2" });
  if (prioridade) etiquetas.push({ texto: prioridade.nome, classe: ETIQUETA_PRIORIDADE[prioridade.cor] });
  if (captura.prazo) etiquetas.push({ texto: descreverPrazo(captura.prazo, new Date()), classe: "bg-etiqueta text-tinta-2" });

  return (
    <div>
      <label htmlFor="captura-texto" className="block text-xs font-semibold uppercase tracking-wider text-apagado">
        O que chegou?
      </label>
      <input
        id="captura-texto"
        ref={refEntrada}
        autoFocus
        value={texto}
        onChange={(e) => aoMudar(e.target.value)}
        onKeyDown={aoTeclar}
        placeholder="Pedido @pessoa #projeto !prioridade >prazo"
        spellCheck={false}
        className="mt-1 h-10 w-full bg-transparent text-xl caret-destaque outline-none placeholder:text-apagado"
      />

      {opcoes.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {opcoes.map((opcao, i) => (
            <li
              key={opcao}
              onMouseDown={(e) => {
                e.preventDefault();
                completar(opcao);
              }}
              className={`cursor-pointer rounded-lg px-2.5 py-1 text-sm ${i === selecionada ? "bg-destaque text-folha" : "bg-etiqueta text-tinta-2"}`}
            >
              {ultima?.[2]}
              {opcao}
            </li>
          ))}
          <li className="self-center px-1 text-xs text-apagado">Tab aceita</li>
        </ul>
      )}

      {etiquetas.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {etiquetas.map((et) => (
            <span key={et.texto + et.classe} className={`rounded-full px-2.5 py-0.5 text-[13px] ${et.classe}`}>
              {et.texto}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
