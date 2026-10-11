import { useCallback, useEffect, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { dataLocalIso, formatarDuracao } from "../captura/datas";
import {
  alternarIrritacaoResolvida,
  lerDadosDeUso,
  mudarColegas,
  recomecarPeriodo,
  removerIrritacao,
  type DadosDeUso,
} from "../db/uso";
import { DIAS_UTEIS_DO_PERIODO, listaDeIrritacoes, META_APONTAMENTO_MS, META_DIAS_USADOS, resumirPeriodo } from "../uso/criterios";
import Icone from "./Icone";

interface Props {
  versao: number;
  aoAvisar: (texto: string) => void;
  aoAnotar: () => void;
}

function dataCurta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

type Situacao = "ok" | "atencao" | "neutro";

function Criterio({ titulo, valor, meta, situacao, children }: { titulo: string; valor: string; meta: string; situacao: Situacao; children?: React.ReactNode }) {
  const cor = situacao === "ok" ? "text-destaque" : situacao === "atencao" ? "text-atraso" : "text-tinta";
  return (
    <li className="rounded-xl bg-cartao px-4 py-3 shadow-[0_0_0_1px_var(--color-linha)]">
      <p className="text-[13px] text-suave">{titulo}</p>
      <p className={`font-titulo text-2xl font-medium tabular-nums ${cor}`}>{valor}</p>
      <p className="text-[13px] text-suave">{meta}</p>
      {children}
    </li>
  );
}

/** Tela Uso: os critérios de sucesso das 4 semanas de uso real e a lista do que irrita. */
export default function Uso({ versao, aoAvisar, aoAnotar }: Props) {
  const [dados, setDados] = useState<DadosDeUso | null>(null);
  const [selecionada, setSelecionada] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => lerDadosDeUso().then(setDados).catch((e) => setErro(String(e))), []);
  useEffect(() => {
    carregar();
  }, [carregar, versao]);

  const abertas = dados?.irritacoes.filter((i) => !i.resolvida_em) ?? [];

  const copiar = useCallback(async () => {
    if (abertas.length === 0) return aoAvisar("Nada anotado ainda.");
    await writeText(listaDeIrritacoes(abertas));
    aoAvisar(`${abertas.length === 1 ? "1 anotação copiada" : `${abertas.length} anotações copiadas`}. Cole na conversa com o Claude.`);
  }, [abertas, aoAvisar]);

  // Teclado: ↑ ↓ escolhem a anotação, Espaço marca como resolvida, Delete apaga, Ctrl+C copia a lista.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (!dados || (e.target instanceof HTMLElement && e.target.closest("input, textarea"))) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const atual = dados.irritacoes[selecionada];
      if (ctrl && e.key.toLowerCase() === "c" && !window.getSelection()?.toString()) copiar();
      else if (ctrl || e.altKey) return;
      else if (e.key === "ArrowDown" || e.key === "j") setSelecionada((s) => Math.min(s + 1, dados.irritacoes.length - 1));
      else if (e.key === "ArrowUp" || e.key === "k") setSelecionada((s) => Math.max(s - 1, 0));
      else if (e.key === " " && atual) alternarIrritacaoResolvida(atual).then(carregar);
      else if (e.key === "Delete" && atual) removerIrritacao(atual.id).then(carregar);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [dados, selecionada, copiar, carregar]);

  if (erro) return <p className="rounded-xl bg-atraso-claro px-4 py-3 text-sm text-atraso">{erro}</p>;
  if (!dados) return null;

  const periodo = resumirPeriodo(dados.inicio, dados.dias, new Date());
  const ultimoApontamento = dados.apontamentos[0];

  return (
    <div className="pb-6">
      <p className="text-[15px] text-suave">
        Período de {dataCurta(dados.inicio)} a {dataCurta(periodo.fim)} ({DIAS_UTEIS_DO_PERIODO} dias úteis).{" "}
        {periodo.terminou ? "Terminou: hora de decidir o que muda." : `${periodo.decorridos} de ${DIAS_UTEIS_DO_PERIODO} dias úteis passaram.`}{" "}
        <button
          type="button"
          onClick={() => recomecarPeriodo().then(carregar).then(() => aoAvisar("Contagem recomeçada hoje."))}
          className="text-destaque hover:underline"
        >
          Recomeçar hoje
        </button>
      </p>

      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Criterio
          titulo="Dias com o Juggl aberto"
          valor={`${periodo.usados} de ${periodo.decorridos}`}
          meta={`Meta: ${META_DIAS_USADOS} de ${DIAS_UTEIS_DO_PERIODO} dias úteis.${periodo.metaPossivel ? "" : " Não dá mais para chegar lá."}`}
          situacao={!periodo.metaPossivel ? "atencao" : periodo.decorridos > 0 && periodo.usados === periodo.decorridos ? "ok" : "neutro"}
        />
        <Criterio
          titulo="Dia planejado"
          valor={`${periodo.rituais} de ${periodo.decorridos}`}
          meta="Meta: na maioria dos dias."
          situacao={periodo.decorridos === 0 ? "neutro" : periodo.rituais * 2 > periodo.decorridos ? "ok" : "atencao"}
        />
        <Criterio
          titulo="Apontamento de horas"
          valor={ultimoApontamento ? formatarDuracao(ultimoApontamento.duracao_ms) : "–"}
          meta={
            ultimoApontamento
              ? `Semana de ${dataCurta(ultimoApontamento.semana)}. Meta: menos de 5 min.`
              : "Medido da abertura de Horas até copiar ou exportar. Meta: menos de 5 min."
          }
          situacao={!ultimoApontamento ? "neutro" : ultimoApontamento.duracao_ms < META_APONTAMENTO_MS ? "ok" : "atencao"}
        >
          {dados.apontamentos.length > 1 && (
            <p className="mt-1 text-[13px] text-suave">
              Antes: {dados.apontamentos.slice(1, 4).map((a) => formatarDuracao(a.duracao_ms)).join(", ")}
            </p>
          )}
        </Criterio>
        <Criterio
          titulo="Cobranças recebidas"
          valor={String(dados.cobrancas)}
          meta={
            dados.promessasAtrasadas > 0
              ? `${dados.promessasAtrasadas === 1 ? "1 promessa passou" : `${dados.promessasAtrasadas} promessas passaram`} do dia. Meta: nenhum pedido esquecido.`
              : "Meta: nenhum pedido esquecido a ponto de ser cobrado pelo chefe."
          }
          situacao={dados.maisCobrados.length > 0 || dados.promessasAtrasadas > 0 ? "atencao" : "neutro"}
        >
          {dados.maisCobrados.length > 0 && (
            <ul className="mt-1 text-[13px] text-suave">
              {dados.maisCobrados.map((c) => (
                <li key={c.titulo} className="truncate">
                  {c.vezes}× {c.titulo}
                  {c.pessoa && ` (${c.pessoa})`}
                </li>
              ))}
            </ul>
          )}
        </Criterio>
        <Criterio titulo="Colegas que pediram para usar" valor={String(dados.colegas)} meta="Meta: pelo menos 2." situacao={dados.colegas >= 2 ? "ok" : "neutro"}>
          <span className="mt-1 flex gap-1">
            <button
              type="button"
              aria-label="Menos um"
              onClick={() => mudarColegas(dados.colegas - 1).then(carregar)}
              className="size-7 rounded-md border border-linha text-sm hover:bg-etiqueta"
            >
              −
            </button>
            <button
              type="button"
              aria-label="Mais um"
              onClick={() => mudarColegas(dados.colegas + 1).then(carregar)}
              className="size-7 rounded-md border border-linha text-sm hover:bg-etiqueta"
            >
              +
            </button>
          </span>
        </Criterio>
      </ul>

      <div className="mt-8 mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-apagado">
          O que irrita <span className="font-normal">{abertas.length}</span>
        </h2>
        <span className="flex gap-1">
          <button type="button" onClick={copiar} className="rounded-lg px-3 py-1.5 text-sm text-suave hover:bg-etiqueta hover:text-tinta">
            Copiar lista <kbd className="ml-1 font-sans text-apagado">Ctrl+C</kbd>
          </button>
          <button type="button" onClick={aoAnotar} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-destaque hover:bg-destaque-claro">
            + Anotar <kbd className="ml-1 font-sans font-normal text-apagado">!</kbd>
          </button>
        </span>
      </div>
      {dados.irritacoes.length === 0 && (
        <p className="text-[15px] text-apagado">
          Algo atrapalhou? Aperte ! em qualquer tela e escreva em uma linha. No fim do período, essa lista vira as correções.
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {dados.irritacoes.map((i, indice) => (
          <li
            key={i.id}
            onClick={() => setSelecionada(indice)}
            className={`group flex items-center gap-3 rounded-xl px-4 py-2.5 ${
              indice === selecionada ? "bg-cartao shadow-[0_0_0_1.5px_var(--color-destaque)]" : "hover:bg-cartao/60"
            }`}
          >
            <button
              type="button"
              aria-label={i.resolvida_em ? "Reabrir" : "Marcar como resolvida"}
              title="Resolvida (Espaço)"
              onClick={() => alternarIrritacaoResolvida(i).then(carregar)}
              className={`flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                i.resolvida_em ? "border-destaque bg-destaque text-folha" : "border-apagado hover:border-destaque"
              }`}
            >
              {i.resolvida_em && <Icone nome="check" className="size-3" />}
            </button>
            <span className={`min-w-0 flex-1 text-[15px] ${i.resolvida_em ? "text-apagado line-through" : ""}`}>{i.texto}</span>
            <span className="shrink-0 text-[13px] text-apagado">
              {[dataCurta(dataLocalIso(new Date(i.criada_em))), i.tela].filter(Boolean).join(" · ")}
            </span>
            <button
              type="button"
              aria-label="Apagar"
              title="Apagar (Delete)"
              onClick={(e) => {
                e.stopPropagation();
                removerIrritacao(i.id).then(carregar);
              }}
              className="shrink-0 rounded p-1 text-apagado opacity-0 hover:bg-etiqueta hover:text-atraso group-hover:opacity-100"
            >
              <Icone nome="lixeira" className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
