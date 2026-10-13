import { Fragment } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { analisarMarkdown, type Trecho } from "../texto/markdown";

function Trechos({ trechos }: { trechos: Trecho[] }) {
  return (
    <>
      {trechos.map((t, i) =>
        t.tipo === "texto" ? (
          <Fragment key={i}>{t.texto}</Fragment>
        ) : t.tipo === "codigo" ? (
          <code key={i} className="rounded bg-etiqueta px-1 font-mono text-[0.92em]">
            {t.texto}
          </code>
        ) : t.tipo === "link" ? (
          <a
            key={i}
            href={t.url}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openUrl(t.url).catch(() => {});
            }}
            className="text-destaque-tinta underline"
          >
            <Trechos trechos={t.filhos} />
          </a>
        ) : t.tipo === "negrito" ? (
          <strong key={i} className="font-semibold">
            <Trechos trechos={t.filhos} />
          </strong>
        ) : t.tipo === "italico" ? (
          <em key={i}>
            <Trechos trechos={t.filhos} />
          </em>
        ) : (
          <s key={i}>
            <Trechos trechos={t.filhos} />
          </s>
        ),
      )}
    </>
  );
}

/** A descrição com a formatação do editor (negrito, itálico, listas), sem interpretar HTML. */
export default function TextoFormatado({ texto, className = "" }: { texto: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {analisarMarkdown(texto).map((b, i) =>
        b.tipo === "paragrafo" ? (
          <p key={i}>
            {b.linhas.map((linha, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Trechos trechos={linha} />
              </Fragment>
            ))}
          </p>
        ) : (
          <ul key={i} className="flex flex-col gap-0.5">
            {b.itens.map((item, j) => (
              <li key={j} className="flex gap-1.5" style={{ paddingLeft: `${item.nivel * 1.1}rem` }}>
                <span className="shrink-0 tabular-nums text-apagado">
                  {item.marcado !== null ? (item.marcado ? "☑" : "☐") : b.numerada ? `${b.inicio + j}.` : "•"}
                </span>
                <span className={item.marcado ? "line-through opacity-70" : ""}>
                  <Trechos trechos={item.trechos} />
                </span>
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
