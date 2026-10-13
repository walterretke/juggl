import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { dataLocalIso } from "../captura/datas";
import { gravarConfig, lerConfig } from "../db/config";
import { definirCodigoApontamento, listarSessoes } from "../db/horas";
import { registrarApontamento } from "../db/uso";
import {
  horasMinutos,
  inicioDaSemana,
  NOMES_DIA_CURTO,
  resumirSemana,
  tabelaLinhas,
  tabelaSemana,
  type FormatoApontamento,
  type ResumoSemana,
  type Sessao,
} from "../horas/calculo";
import LancarTempo from "./horas/LancarTempo";
import SessoesDoDia, { type Celula } from "./horas/SessoesDoDia";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

interface Props {
  /** Muda quando o foco muda, para recarregar. */
  versao: string;
  aoAvisar: (texto: string) => void;
}

function somarDias(data: Date, dias: number): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate() + dias);
}

/** "5 – 11 out 2026" ou "28 set – 4 out 2026". */
function rotuloSemana(segunda: Date): string {
  const domingo = somarDias(segunda, 6);
  const inicio = segunda.getMonth() === domingo.getMonth() ? `${segunda.getDate()}` : `${segunda.getDate()} ${MESES[segunda.getMonth()]}`;
  return `${inicio} – ${domingo.getDate()} ${MESES[domingo.getMonth()]} ${domingo.getFullYear()}`;
}

/** Tela "Horas da semana": tempo em foco por projeto e por dia, para o apontamento. */
export default function Horas({ versao, aoAvisar }: Props) {
  const [segunda, setSegunda] = useState(() => inicioDaSemana(new Date()));
  const [resumo, setResumo] = useState<ResumoSemana | null>(null);
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [celula, setCelula] = useState<Celula | null>(null);
  const [lancando, setLancando] = useState(false);
  const [formato, setFormato] = useState<FormatoApontamento>("semana");
  const [passo, setPasso] = useState(0);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [editandoCodigo, setEditandoCodigo] = useState<string | null>(null);
  /** Quando a tela abriu: mede quanto o apontamento leva (até copiar ou exportar). */
  const aberturaRef = useRef(Date.now());

  const carregar = useCallback(async () => {
    try {
      const lidas = await listarSessoes(segunda, somarDias(segunda, 7));
      setSessoes(lidas);
      setResumo(resumirSemana(lidas, segunda));
      setErro(null);
    } catch (e) {
      setErro(String(e));
    }
  }, [segunda]);

  // Recarrega ao trocar de semana, quando o foco muda e a cada minuto (sessão em andamento).
  useEffect(() => {
    carregar();
    const relogio = setInterval(carregar, 60_000);
    return () => clearInterval(relogio);
  }, [carregar, versao]);

  // Formato do apontamento e arredondamento, escolhidos uma vez e guardados.
  useEffect(() => {
    lerConfig("horas_formato").then((f) => f === "linhas" && setFormato("linhas"));
    lerConfig("horas_arredondar").then((p) => setPasso(Number(p) || 0));
  }, []);

  function trocarFormato(novo: FormatoApontamento) {
    setFormato(novo);
    gravarConfig("horas_formato", novo).catch(() => {});
  }

  function trocarPasso(novo: number) {
    setPasso(novo);
    gravarConfig("horas_arredondar", String(novo)).catch(() => {});
  }

  const gerar = (r: ResumoSemana, separador: ";" | "\t") =>
    formato === "linhas" ? tabelaLinhas(r, separador, passo) : tabelaSemana(r, separador, passo);

  const estaSemana = segunda.getTime() === inicioDaSemana(new Date()).getTime();
  const hoje = dataLocalIso(new Date());

  async function copiar() {
    if (!resumo || resumo.total === 0) return;
    await writeText(gerar(resumo, "\t"));
    medirApontamento();
    aoAvisar("Tabela copiada. Cole numa planilha ou no sistema de apontamento.");
  }

  async function exportar() {
    if (!resumo || resumo.total === 0) return;
    try {
      // BOM para o Excel reconhecer os acentos.
      const caminho = await invoke<string>("salvar_csv", {
        nome: `juggl-horas-${dataLocalIso(segunda)}.csv`,
        conteudo: `﻿${gerar(resumo, ";")}`,
      });
      aoAvisar(`CSV salvo em ${caminho}`);
      medirApontamento();
      await revealItemInDir(caminho).catch(() => {});
    } catch (e) {
      setErro(String(e));
    }
  }

  function medirApontamento() {
    registrarApontamento(dataLocalIso(segunda), Date.now() - aberturaRef.current).catch(() => {});
  }

  async function salvarCodigo(projetoId: string, codigo: string) {
    setEditandoCodigo(null);
    await definirCodigoApontamento(projetoId, codigo);
    await carregar();
  }

  // Teclado: ← → trocam a semana, N lança tempo, Ctrl+C copia, Ctrl+S exporta o CSV.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (lancando) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl && e.key === "Escape" && celula) setCelula(null);
      else if (!ctrl && !e.altKey && e.key.toLowerCase() === "n") setLancando(true);
      else if (!ctrl && e.key === "ArrowLeft") setSegunda((s) => somarDias(s, -7));
      else if (!ctrl && e.key === "ArrowRight") setSegunda((s) => somarDias(s, 7));
      else if (ctrl && e.key.toLowerCase() === "c" && !window.getSelection()?.toString()) copiar();
      else if (ctrl && e.key.toLowerCase() === "s") exportar();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  });

  function alternar(chave: string) {
    const novos = new Set(abertos);
    if (novos.has(chave)) novos.delete(chave);
    else novos.add(chave);
    setAbertos(novos);
  }

  // Trocar de semana fecha o painel de sessões, que é de um dia daquela semana.
  useEffect(() => setCelula(null), [segunda]);

  const botao = "rounded-lg border border-linha px-3 py-1.5 text-sm hover:bg-etiqueta disabled:opacity-40";

  /** Célula de um dia: clique abre as sessões daquele dia para ajustar. */
  const celulaDia = (ms: number, alvo: Celula, classe: string) => {
    const aberta = celula && celula.dia === alvo.dia && celula.projetoId === alvo.projetoId && celula.itemChave === alvo.itemChave;
    return (
      <td key={alvo.dia} className={`px-0.5 py-1 text-right ${classe}`}>
        {ms > 0 ? (
          <button
            type="button"
            title="Ver e ajustar as sessões deste dia"
            onClick={(e) => {
              e.stopPropagation();
              setCelula(aberta ? null : alvo);
            }}
            className={`w-full rounded px-1 py-1.5 text-right hover:bg-destaque-claro hover:text-destaque-tinta ${
              aberta ? "bg-destaque-claro text-destaque-tinta ring-1 ring-destaque" : ""
            }`}
          >
            {horasMinutos(ms)}
          </button>
        ) : null}
      </td>
    );
  };
  const vazio = !resumo || resumo.total === 0;

  return (
    <div className="pb-6">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Semana anterior" title="Semana anterior (←)" onClick={() => setSegunda(somarDias(segunda, -7))} className={botao}>
          ‹
        </button>
        <span className="min-w-44 text-center text-[15px] font-semibold">{rotuloSemana(segunda)}</span>
        <button type="button" aria-label="Próxima semana" title="Próxima semana (→)" onClick={() => setSegunda(somarDias(segunda, 7))} className={botao}>
          ›
        </button>
        {!estaSemana && (
          <button type="button" onClick={() => setSegunda(inicioDaSemana(new Date()))} className={botao}>
            Esta semana
          </button>
        )}
        <div className="flex-1" />
        <button type="button" onClick={() => setLancando(true)} title="Reunião, foco esquecido... (N)" className={botao}>
          + Lançar tempo
        </button>
        <button type="button" disabled={vazio} onClick={copiar} title="Copiar a tabela (Ctrl+C)" className={botao}>
          Copiar
        </button>
        <button
          type="button"
          disabled={vazio}
          onClick={exportar}
          title="Salvar CSV em Downloads (Ctrl+S)"
          className="rounded-lg bg-destaque px-3 py-1.5 text-sm font-semibold text-folha hover:opacity-90 disabled:opacity-40"
        >
          Exportar CSV
        </button>
      </div>

      {erro && <p className="mt-4 rounded-xl bg-atraso-claro px-4 py-3 text-sm text-atraso">{erro}</p>}

      {lancando && (
        <LancarTempo
          segunda={segunda}
          aoCancelar={() => setLancando(false)}
          aoLancar={async (texto) => {
            setLancando(false);
            await carregar();
            aoAvisar(texto);
          }}
        />
      )}

      {resumo && vazio ? (
        <p className="mt-16 text-center text-[15px] text-apagado">
          Nenhum tempo nesta semana. O tempo conta enquanto um item está em foco (tecla F ou o botão de focar); reuniões e
          o que ficou de fora entram por "+ Lançar tempo" (N).
        </p>
      ) : (
        resumo && (
          <div className="mt-5 overflow-x-auto rounded-xl bg-cartao shadow-[0_0_0_1px_var(--color-linha)]">
            <table className="w-full min-w-[520px] table-fixed text-sm tabular-nums">
              <thead>
                <tr className="border-b border-linha text-xs text-apagado">
                  <th className="px-4 py-2.5 text-left font-semibold">Projeto</th>
                  {resumo.dias.map((d, i) => (
                    <th
                      key={i}
                      className={`w-12 px-1 py-2.5 text-right font-semibold ${dataLocalIso(d) === hoje ? "text-destaque" : ""}`}
                    >
                      {NOMES_DIA_CURTO[i]}
                      <span className="block font-normal">{d.getDate()}</span>
                    </th>
                  ))}
                  <th className="w-16 px-4 py-2.5 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {resumo.linhas.map((l) => {
                  const chave = l.projetoId ?? "";
                  const aberto = abertos.has(chave);
                  return (
                    <Fragment key={chave}>
                      <tr className="border-b border-linha hover:bg-etiqueta/50" onClick={() => alternar(chave)}>
                        <td className="max-w-0 px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-apagado transition-transform ${aberto ? "rotate-90" : ""}`}>›</span>
                            <span className="truncate font-medium">{l.projeto ?? "Sem projeto"}</span>
                            {l.projetoId && editandoCodigo === l.projetoId ? (
                              <input
                                autoFocus
                                defaultValue={l.codigo ?? ""}
                                placeholder="Código"
                                aria-label="Código de apontamento"
                                onClick={(e) => e.stopPropagation()}
                                onBlur={(e) => salvarCodigo(l.projetoId!, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.currentTarget.blur();
                                  if (e.key === "Escape") setEditandoCodigo(null);
                                }}
                                className="w-28 rounded border border-destaque bg-folha px-1.5 text-xs outline-none"
                              />
                            ) : (
                              l.projetoId && (
                              <button
                                type="button"
                                title="Código usado no apontamento"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditandoCodigo(l.projetoId);
                                }}
                                className="shrink-0 rounded px-1.5 text-xs text-apagado hover:bg-etiqueta hover:text-tinta"
                              >
                                {l.codigo ?? "+ código"}
                              </button>
                              )
                            )}
                          </div>
                        </td>
                        {l.porDia.map((ms, i) => celulaDia(ms, { dia: i, projetoId: l.projetoId, itemChave: null }, "text-tinta-2"))}
                        <td className="px-4 py-2.5 text-right font-semibold">{horasMinutos(l.total)}</td>
                      </tr>
                      {aberto &&
                        l.itens.map((it) => (
                          <tr key={it.itemId} className="border-b border-linha text-[13px] text-suave">
                            <td className="max-w-0 truncate py-1.5 pr-4 pl-10">{it.titulo}</td>
                            {it.porDia.map((ms, i) => celulaDia(ms, { dia: i, projetoId: l.projetoId, itemChave: it.itemId }, ""))}
                            <td className="px-4 py-1.5 text-right">{horasMinutos(it.total)}</td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="px-4 py-2.5">Total</td>
                  {resumo.porDia.map((ms, i) => (
                    <td key={i} className="px-1 py-2.5 text-right">
                      {horasMinutos(ms)}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right">{horasMinutos(resumo.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}
      {celula && (
        <SessoesDoDia
          celula={celula}
          segunda={segunda}
          sessoes={sessoes}
          aoFechar={() => setCelula(null)}
          aoMudar={async (texto) => {
            await carregar();
            aoAvisar(texto);
          }}
        />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-suave">
        <span>Copiar e CSV:</span>
        <select
          aria-label="Formato do apontamento"
          value={formato}
          onChange={(e) => trocarFormato(e.target.value as FormatoApontamento)}
          className="rounded-lg border border-linha bg-cartao px-2 py-1 text-sm text-tinta outline-none focus:border-destaque"
        >
          <option value="semana">Tabela da semana (projetos × dias)</option>
          <option value="linhas">Uma linha por dia e projeto</option>
        </select>
        <select
          aria-label="Arredondamento"
          value={passo}
          onChange={(e) => trocarPasso(Number(e.target.value))}
          className="rounded-lg border border-linha bg-cartao px-2 py-1 text-sm text-tinta outline-none focus:border-destaque"
        >
          <option value={0}>Sem arredondar</option>
          <option value={15}>Arredondar a 15 min</option>
          <option value={30}>Arredondar a 30 min</option>
        </select>
      </div>
      <p className="mt-2 text-xs text-apagado">
        Horas no formato h:mm. Copiar e o CSV usam horas decimais (1,50 = uma hora e meia). Clique num projeto para ver os
        itens e num dia para ajustar as sessões.
      </p>
    </div>
  );
}
