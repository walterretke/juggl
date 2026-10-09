import { Fragment, useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { dataLocalIso } from "../captura/datas";
import { definirCodigoApontamento, listarSessoes } from "../db/horas";
import {
  horasMinutos,
  inicioDaSemana,
  NOMES_DIA_CURTO,
  resumirSemana,
  tabelaSemana,
  type ResumoSemana,
} from "../horas/calculo";

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
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [editandoCodigo, setEditandoCodigo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const sessoes = await listarSessoes(segunda, somarDias(segunda, 7));
      setResumo(resumirSemana(sessoes, segunda));
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

  const estaSemana = segunda.getTime() === inicioDaSemana(new Date()).getTime();
  const hoje = dataLocalIso(new Date());

  async function copiar() {
    if (!resumo) return;
    await writeText(tabelaSemana(resumo, "\t"));
    aoAvisar("Tabela copiada. Cole numa planilha ou no sistema de apontamento.");
  }

  async function exportar() {
    if (!resumo) return;
    try {
      // BOM para o Excel reconhecer os acentos.
      const caminho = await invoke<string>("salvar_csv", {
        nome: `juggl-horas-${dataLocalIso(segunda)}.csv`,
        conteudo: `﻿${tabelaSemana(resumo, ";")}`,
      });
      aoAvisar(`CSV salvo em ${caminho}`);
      await revealItemInDir(caminho).catch(() => {});
    } catch (e) {
      setErro(String(e));
    }
  }

  async function salvarCodigo(projetoId: string, codigo: string) {
    setEditandoCodigo(null);
    await definirCodigoApontamento(projetoId, codigo);
    await carregar();
  }

  function alternar(chave: string) {
    const novos = new Set(abertos);
    if (novos.has(chave)) novos.delete(chave);
    else novos.add(chave);
    setAbertos(novos);
  }

  const botao = "rounded-lg border border-linha px-3 py-1.5 text-sm hover:bg-etiqueta disabled:opacity-40";
  const vazio = !resumo || resumo.total === 0;

  return (
    <div className="pb-6">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Semana anterior" onClick={() => setSegunda(somarDias(segunda, -7))} className={botao}>
          ‹
        </button>
        <span className="min-w-44 text-center text-[15px] font-semibold">{rotuloSemana(segunda)}</span>
        <button type="button" aria-label="Próxima semana" onClick={() => setSegunda(somarDias(segunda, 7))} className={botao}>
          ›
        </button>
        {!estaSemana && (
          <button type="button" onClick={() => setSegunda(inicioDaSemana(new Date()))} className={botao}>
            Esta semana
          </button>
        )}
        <div className="flex-1" />
        <button type="button" disabled={vazio} onClick={copiar} className={botao}>
          Copiar
        </button>
        <button
          type="button"
          disabled={vazio}
          onClick={exportar}
          className="rounded-lg bg-destaque px-3 py-1.5 text-sm font-semibold text-folha hover:opacity-90 disabled:opacity-40"
        >
          Exportar CSV
        </button>
      </div>

      {erro && <p className="mt-4 rounded-xl bg-atraso-claro px-4 py-3 text-sm text-atraso">{erro}</p>}

      {resumo && vazio ? (
        <p className="mt-16 text-center text-[15px] text-apagado">
          Nenhum tempo em foco nesta semana. O tempo conta enquanto um item está em foco (tecla F ou o botão de focar).
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
                        {l.porDia.map((ms, i) => (
                          <td key={i} className="px-1 py-2.5 text-right text-tinta-2">
                            {horasMinutos(ms)}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-right font-semibold">{horasMinutos(l.total)}</td>
                      </tr>
                      {aberto &&
                        l.itens.map((it) => (
                          <tr key={it.itemId} className="border-b border-linha text-[13px] text-suave">
                            <td className="max-w-0 truncate py-1.5 pr-4 pl-10">{it.titulo}</td>
                            {it.porDia.map((ms, i) => (
                              <td key={i} className="px-1 py-1.5 text-right">
                                {horasMinutos(ms)}
                              </td>
                            ))}
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
      <p className="mt-3 text-xs text-apagado">
        Horas no formato h:mm. Copiar e o CSV usam horas decimais (1,50 = uma hora e meia). Clique num projeto para ver os itens.
      </p>
    </div>
  );
}
