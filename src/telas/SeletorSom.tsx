import { useState } from "react";
import { CATALOGO, acharSom } from "../sons/catalogo";
import type { PreferenciasSom } from "../sons/preferencias";

interface Props {
  preferencias: PreferenciasSom;
  /** Id do som tocando agora. */
  tocando: string | null;
  aoMudar: (p: PreferenciasSom) => void;
  /** Liga ou desliga o som agora (sem mudar a escolha). */
  aoAlternar: () => void;
  compacto?: boolean;
}

const GRUPOS = [...new Set(CATALOGO.map((s) => s.grupo))];

/** Escolha do som do foco: ruídos e natureza (sem internet) ou rádios de música. */
export default function SeletorSom({ preferencias, tocando, aoMudar, aoAlternar, compacto = false }: Props) {
  const [aberto, setAberto] = useState(false);
  const escolhido = acharSom(preferencias.somId);

  return (
    <div className="relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={escolhido ? aoAlternar : () => setAberto(true)}
        title={escolhido ? (tocando ? "Parar o som" : "Tocar o som") : "Escolher um som para o foco"}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-semibold ${
          tocando ? "bg-destaque-claro text-destaque-tinta" : "text-suave hover:bg-etiqueta hover:text-tinta"
        }`}
      >
        <span aria-hidden="true">{tocando ? "♪" : "♫"}</span>
        {escolhido ? (compacto ? escolhido.nome.split(" ")[0] : escolhido.nome) : "Som"}
        {escolhido && <span className="font-normal opacity-70">{tocando ? "· tocando" : "· parado"}</span>}
      </button>
      <button
        type="button"
        aria-label="Escolher o som"
        title="Escolher o som"
        onClick={() => setAberto(!aberto)}
        className="rounded-md px-1.5 py-1 text-[11px] text-apagado hover:bg-etiqueta hover:text-tinta"
      >
        ▾
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute top-full left-0 z-20 mt-1 max-h-[60vh] w-[min(340px,80vw)] overflow-y-auto rounded-xl bg-folha p-2 text-left shadow-xl ring-1 ring-linha">
            <button
              type="button"
              onClick={() => {
                aoMudar({ ...preferencias, somId: null });
                setAberto(false);
              }}
              className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-etiqueta ${!escolhido ? "font-semibold" : ""}`}
            >
              Sem som
            </button>
            {GRUPOS.map((g) => (
              <div key={g} className="mt-1.5">
                <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-apagado">{g}</p>
                {CATALOGO.filter((s) => s.grupo === g).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      aoMudar({ ...preferencias, somId: s.id });
                      setAberto(false);
                    }}
                    className={`w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-etiqueta ${s.id === preferencias.somId ? "bg-destaque-claro" : ""}`}
                  >
                    <span className="block text-sm font-medium">{s.nome}</span>
                    <span className="block text-[12px] leading-snug text-suave">{s.descricao}</span>
                  </button>
                ))}
              </div>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-linha px-2.5 pt-2 text-[13px] text-suave">
              <label className="flex items-center gap-2">
                Volume
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={preferencias.volume}
                  onChange={(e) => aoMudar({ ...preferencias, volume: Number(e.target.value) })}
                  className="flex-1 accent-[var(--color-destaque)]"
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={preferencias.aoFocar}
                  onChange={(e) => aoMudar({ ...preferencias, aoFocar: e.target.checked })}
                />
                Tocar sozinho quando um foco começar
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
