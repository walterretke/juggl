import { useCallback, useEffect, useMemo, useState } from "react";
import { dataLocalIso, descreverPrazo } from "../captura/datas";
import type { Item } from "../db/itens";
import { candidatosDoRitual, MAX_DO_DIA, salvarRitual } from "../db/ritual";
import { gruposDoRitual } from "../ritual/grupos";
import { COR_ORIGEM } from "./origens";

interface Props {
  /** Muda quando os itens mudam em outra tela, para recarregar. */
  versao: number;
  /** Ritual salvo: volta para o Agora. */
  aoComecar: (quantos: number) => void;
  aoPular: () => void;
}

function Etiqueta({ children, classe = "bg-etiqueta text-tinta-2" }: { children: React.ReactNode; classe?: string }) {
  return <span className={`shrink-0 rounded-full px-2 text-xs font-semibold ${classe}`}>{children}</span>;
}

/** Ritual da manhã: o que vence, quem cobrou e o que ficou pausado, para escolher as 3 do dia. */
export default function Ritual({ versao, aoComecar, aoPular }: Props) {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const hoje = new Date();
  const diaHoje = dataLocalIso(hoje);

  useEffect(() => {
    candidatosDoRitual()
      .then((lidos) => {
        setItens(lidos);
        // Reabrir o ritual no mesmo dia mostra o que já tinha sido escolhido.
        setEscolhidos((atuais) =>
          atuais.length > 0 ? atuais : lidos.filter((i) => i.dia_planejado === diaHoje).map((i) => i.id).slice(0, MAX_DO_DIA),
        );
      })
      .catch((e) => setErro(String(e)));
  }, [versao, diaHoje]);

  const grupos = useMemo(() => (itens ? gruposDoRitual(itens, hoje) : []), [itens, diaHoje]);
  const ordem = useMemo(() => grupos.flatMap((g) => g.itens), [grupos]);
  const porId = useMemo(() => new Map(ordem.map((i) => [i.id, i])), [ordem]);

  const alternar = useCallback(
    (id: string) => {
      if (escolhidos.includes(id)) {
        setEscolhidos(escolhidos.filter((e) => e !== id));
        setAviso(null);
      } else if (escolhidos.length >= MAX_DO_DIA) {
        setAviso(`Só ${MAX_DO_DIA} por dia. Tire uma para escolher outra.`);
      } else {
        setEscolhidos([...escolhidos, id]);
        setAviso(null);
      }
    },
    [escolhidos],
  );

  const comecar = useCallback(async () => {
    try {
      await salvarRitual(escolhidos);
      aoComecar(escolhidos.length);
    } catch (e) {
      setErro(String(e));
    }
  }, [escolhidos, aoComecar]);

  // Teclado: setas ou J/K andam, Espaço escolhe, Enter começa o dia.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof HTMLElement && e.target.closest("input, textarea"))) return;
      if (e.key === "ArrowDown" || e.key === "j") setCursor((c) => Math.min(c + 1, ordem.length - 1));
      else if (e.key === "ArrowUp" || e.key === "k") setCursor((c) => Math.max(c - 1, 0));
      else if (e.key === " " && ordem[cursor]) alternar(ordem[cursor].id);
      else if (e.key === "Enter") comecar();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [ordem, cursor, alternar, comecar]);

  useEffect(() => {
    document.getElementById(`ritual-${cursor}`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (erro) return <p className="rounded-xl bg-atraso-claro px-4 py-3 text-sm text-atraso">{erro}</p>;
  if (!itens) return null;

  return (
    <div className="pb-6">
      <section aria-label="As 3 do dia" className="rounded-2xl bg-cartao px-6 py-5 shadow-[0_0_0_1px_var(--color-linha)]">
        <p className="text-xs font-semibold uppercase tracking-wider text-destaque">Hoje</p>
        <ol className="mt-3 flex flex-col gap-2">
          {Array.from({ length: MAX_DO_DIA }, (_, i) => {
            const item = porId.get(escolhidos[i]);
            return (
              <li key={i} className="flex min-h-9 items-center gap-3">
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${
                    item ? "bg-destaque text-folha" : "border border-dashed border-apagado text-apagado"
                  }`}
                >
                  {i + 1}
                </span>
                {item ? (
                  <>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{item.titulo}</span>
                    <button
                      type="button"
                      onClick={() => alternar(item.id)}
                      className="shrink-0 rounded px-2 text-sm text-apagado hover:bg-etiqueta hover:text-tinta"
                    >
                      Tirar
                    </button>
                  </>
                ) : (
                  <span className="text-[15px] text-apagado">Escolha na lista abaixo</span>
                )}
              </li>
            );
          })}
        </ol>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={comecar}
            className="rounded-lg bg-destaque px-4 py-2 text-sm font-semibold text-folha hover:opacity-90"
          >
            {escolhidos.length === 0 ? "Começar sem escolher" : "Começar o dia"}{" "}
            <kbd className="ml-1 font-sans font-normal opacity-70">Enter</kbd>
          </button>
          <button type="button" onClick={aoPular} className="rounded-lg px-3 py-2 text-sm text-suave hover:bg-etiqueta hover:text-tinta">
            Pular por agora
          </button>
          {aviso && <span className="text-sm font-semibold text-atraso">{aviso}</span>}
        </div>
      </section>

      {ordem.length === 0 && (
        <p className="mt-12 text-center text-[15px] text-apagado">Nada pendente. Bom dia tranquilo.</p>
      )}

      {grupos.map((grupo) => (
        <section key={grupo.chave} className="mt-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-apagado">
            {grupo.titulo} <span className="font-normal">{grupo.itens.length}</span>
          </h2>
          <ul className="flex flex-col gap-1">
            {grupo.itens.map((item) => {
              const indice = ordem.indexOf(item);
              const posicao = escolhidos.indexOf(item.id);
              const prazo = item.prazo ? descreverPrazo(item.prazo, hoje) : null;
              const promessa = item.prometido_para ? descreverPrazo(item.prometido_para, hoje) : null;
              const atrasado = (t: string | null) => t?.startsWith("atrasado") || t === "hoje";
              return (
                <li key={item.id} id={`ritual-${indice}`}>
                  <button
                    type="button"
                    aria-pressed={posicao >= 0}
                    onClick={() => {
                      setCursor(indice);
                      alternar(item.id);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left ${
                      indice === cursor ? "bg-cartao shadow-[0_0_0_1.5px_var(--color-destaque)]" : "hover:bg-cartao/60"
                    }`}
                  >
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        posicao >= 0 ? "bg-destaque text-folha" : "border-[1.5px] border-apagado"
                      }`}
                    >
                      {posicao >= 0 ? posicao + 1 : ""}
                    </span>
                    <span className={`size-2 shrink-0 rounded-full ${COR_ORIGEM[item.origem] ?? COR_ORIGEM.manual}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{item.titulo}</span>
                      {(item.pessoa || item.nota_pausa) && (
                        <span className="block truncate text-[13px] text-suave">
                          {[item.pessoa, item.nota_pausa && `Parou em: ${item.nota_pausa}`].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                    {item.cobrancas > 0 && <Etiqueta classe="bg-atraso-claro text-atraso">cobrou {item.cobrancas}×</Etiqueta>}
                    {item.status === "pausado" && <Etiqueta>Pausado</Etiqueta>}
                    {item.status === "em_foco" && <Etiqueta classe="bg-destaque-claro text-destaque-tinta">Em foco</Etiqueta>}
                    {item.prioridade && <Etiqueta>{item.prioridade}</Etiqueta>}
                    {promessa && (
                      <span className={`shrink-0 text-sm ${atrasado(promessa) ? "font-semibold text-atraso" : "text-suave"}`}>
                        prometido {promessa}
                      </span>
                    )}
                    {prazo && (
                      <span className={`w-20 shrink-0 text-right text-sm ${atrasado(prazo) ? "font-semibold text-atraso" : "text-suave"}`}>
                        {prazo}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
