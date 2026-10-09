import { useEffect, useMemo, useRef, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { descreverPrazo, tempoParado } from "../captura/datas";
import { normalizarNome } from "../captura/parser";
import type { Item } from "../db/itens";
import { itensDaPessoa, listarPessoas, type ResumoPessoa } from "../db/pessoas";
import { NOME_STATUS, resumoParaPessoa } from "../pessoas/resumo";
import Icone from "./Icone";

interface Props {
  /** Muda quando os itens mudam, para recarregar. */
  versao: number;
  aoCobrar: (item: Item) => void;
  aoFocar: (item: Item) => void;
  aoAvisar: (texto: string) => void;
}

const CLASSE_STATUS: Partial<Record<Item["status"], string>> = {
  em_foco: "bg-destaque-claro text-destaque-tinta",
  feito: "bg-etiqueta text-apagado",
};

function desde(iso: string, agora: Date): string {
  const tempo = tempoParado(iso, agora);
  return tempo === "agora" ? "agora mesmo" : `há ${tempo}`;
}

/** Tela Pessoas: tudo que cada pessoa pediu, com status e cobranças, e um resumo pronto para responder. */
export default function Pessoas({ versao, aoCobrar, aoFocar, aoAvisar }: Props) {
  const [pessoas, setPessoas] = useState<ResumoPessoa[] | null>(null);
  const [busca, setBusca] = useState("");
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const campoBusca = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listarPessoas()
      .then(setPessoas)
      .catch((e) => setErro(String(e)));
  }, [versao]);

  const filtradas = useMemo(() => {
    const alvo = normalizarNome(busca);
    return (pessoas ?? []).filter(
      (p) => normalizarNome(p.nome).includes(alvo) || normalizarNome(p.apelido).includes(alvo),
    );
  }, [pessoas, busca]);

  // Sem escolha (ou a escolhida saiu do filtro): mostra a primeira da lista.
  const atual = filtradas.find((p) => p.id === escolhida) ?? filtradas[0] ?? null;

  useEffect(() => {
    if (!atual) {
      setItens([]);
      return;
    }
    itensDaPessoa(atual.id)
      .then(setItens)
      .catch((e) => setErro(String(e)));
  }, [atual?.id, versao]);

  // "/" vai para a busca, como em muitos apps.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        campoBusca.current?.focus();
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  function moverEscolha(passo: number) {
    if (filtradas.length === 0) return;
    const i = atual ? filtradas.indexOf(atual) : -1;
    const proxima = filtradas[Math.min(Math.max(i + passo, 0), filtradas.length - 1)];
    setEscolhida(proxima.id);
    document.getElementById(`pessoa-${proxima.id}`)?.scrollIntoView({ block: "nearest" });
  }

  async function copiarResumo() {
    if (!atual) return;
    await writeText(resumoParaPessoa(atual.nome, itens, new Date()));
    aoAvisar(`Resumo para ${atual.nome} copiado. Cole no Teams.`);
  }

  if (erro) return <p className="rounded-xl bg-atraso-claro px-4 py-3 text-sm text-atraso">{erro}</p>;
  if (!pessoas) return null;
  if (pessoas.length === 0) {
    return (
      <p className="mt-16 text-center text-[15px] text-apagado">
        Ninguém ainda. Quem pediu entra aqui quando você preenche "quem pediu" numa captura.
      </p>
    );
  }

  const agora = new Date();
  const abertos = itens.filter((i) => i.status !== "feito");

  return (
    <div className="flex gap-6 pb-6">
      <div className="w-48 shrink-0">
        <label className="flex items-center gap-2 rounded-lg border border-linha bg-cartao px-3 py-1.5 focus-within:border-destaque">
          <Icone nome="busca" className="shrink-0 text-apagado" />
          <input
            ref={campoBusca}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                moverEscolha(e.key === "ArrowDown" ? 1 : -1);
              } else if (e.key === "Escape") {
                setBusca("");
                e.currentTarget.blur();
              }
            }}
            placeholder="Buscar pessoa  /"
            aria-label="Buscar pessoa"
            className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-apagado"
          />
        </label>
        <ul className="mt-3 flex flex-col gap-0.5">
          {filtradas.map((p) => (
            <li key={p.id} id={`pessoa-${p.id}`}>
              <button
                type="button"
                onClick={() => setEscolhida(p.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[15px] ${
                  atual?.id === p.id ? "bg-cartao font-semibold shadow-sm" : "text-tinta-2 hover:bg-cartao/60"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                {p.cobrancas > 0 && (
                  <span title="Cobranças nos pedidos abertos" className="text-xs font-semibold text-atraso">
                    {p.cobrancas}×
                  </span>
                )}
                <span className="w-5 text-right text-[13px] font-normal tabular-nums text-apagado">{p.abertos || ""}</span>
              </button>
            </li>
          ))}
          {filtradas.length === 0 && <li className="px-3 py-2 text-sm text-apagado">Ninguém com esse nome.</li>}
        </ul>
      </div>

      {atual && (
        <section className="min-w-0 flex-1">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-titulo text-2xl font-medium">{atual.nome}</h2>
              <p className="text-sm text-suave">
                {abertos.length === 0
                  ? "Nada em aberto."
                  : `${abertos.length} ${abertos.length === 1 ? "pedido aberto" : "pedidos abertos"}`}
                {atual.cobrancas > 0 && ` · cobrou ${atual.cobrancas}× nesses pedidos`}
              </p>
            </div>
            <button
              type="button"
              disabled={itens.length === 0}
              onClick={copiarResumo}
              title="Copia uma mensagem com o status de cada pedido"
              className="rounded-lg border border-linha px-3 py-1.5 text-sm hover:bg-etiqueta disabled:opacity-40"
            >
              Copiar resumo
            </button>
          </div>

          <ul className="mt-4 flex flex-col gap-1.5">
            {itens.map((item) => {
              const promessa = item.prometido_para ? descreverPrazo(item.prometido_para, agora) : null;
              const prazo = item.prazo ? descreverPrazo(item.prazo, agora) : null;
              const feito = item.status === "feito";
              return (
                <li
                  key={item.id}
                  className={`group flex items-center gap-3 rounded-xl px-4 py-3 ${feito ? "opacity-60" : "bg-cartao shadow-[0_0_0_1px_var(--color-linha)]"}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`truncate text-[15px] font-medium ${feito ? "line-through" : ""}`}>{item.titulo}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 text-xs font-semibold ${CLASSE_STATUS[item.status] ?? "bg-etiqueta text-tinta-2"}`}
                      >
                        {NOME_STATUS[item.status]}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-suave">
                      {[
                        promessa && `prometido ${promessa}`,
                        prazo && `prazo ${prazo}`,
                        item.cobrancas > 0 && `cobrou ${item.cobrancas}×`,
                        `${feito ? "concluído" : "mexido"} ${desde(item.atualizado_em, agora)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {!feito && (
                    <div className="flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                      {item.status !== "em_foco" && (
                        <button
                          type="button"
                          title="Focar agora"
                          aria-label="Focar agora"
                          onClick={() => aoFocar(item)}
                          className="rounded-md p-1.5 text-apagado hover:bg-etiqueta hover:text-tinta"
                        >
                          <Icone nome="foco" />
                        </button>
                      )}
                      <button
                        type="button"
                        title="Cobrou de novo"
                        aria-label="Cobrou de novo"
                        onClick={() => aoCobrar(item)}
                        className="rounded-md p-1.5 text-apagado hover:bg-etiqueta hover:text-tinta"
                      >
                        <Icone nome="cobrar" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
