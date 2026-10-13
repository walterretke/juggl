import { useEffect, useState } from "react";
import { descreverPrazo } from "../captura/datas";
import { listarSugestoes } from "../db/itens";
import { criarRecorrencia, listarRecorrencias, removerRecorrencia, type Recorrencia } from "../db/recorrencias";
import { descreverFrequencia, type Frequencia } from "../recorrencia/datas";
import Icone from "./Icone";

const DIAS_SEMANA = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
const campo = "rounded-lg border border-linha bg-cartao px-2.5 py-1.5 text-sm outline-none focus:border-destaque";

/** Itens recorrentes nas configurações: lista, remover e criar (título, frequência, quem pediu, projeto). */
export default function SecaoRecorrentes() {
  const [lista, setLista] = useState<Recorrencia[]>([]);
  const [titulo, setTitulo] = useState("");
  const [frequencia, setFrequencia] = useState<Frequencia>("semanal");
  const [dia, setDia] = useState(1);
  const [pessoa, setPessoa] = useState("");
  const [projeto, setProjeto] = useState("");
  const [sugestoes, setSugestoes] = useState<{ pessoas: string[]; projetos: string[] }>({ pessoas: [], projetos: [] });
  const [mensagem, setMensagem] = useState<string | null>(null);

  const carregar = () => listarRecorrencias().then(setLista).catch((e) => setMensagem(String(e)));
  useEffect(() => {
    carregar();
    listarSugestoes().then(setSugestoes).catch(() => {});
  }, []);

  async function criar() {
    if (!titulo.trim()) return setMensagem("Escreva o título.");
    try {
      await criarRecorrencia({ titulo, pessoa, projeto, frequencia, dia: frequencia === "diaria" ? null : dia });
      setTitulo("");
      setMensagem(null);
      await carregar();
    } catch (e) {
      setMensagem(String(e));
    }
  }

  const hoje = new Date();
  return (
    <div className="mt-2">
      <p className="text-sm text-suave">
        Tarefas que voltam sempre (relatório mensal, checagem de backup). No dia, o item aparece na caixa de entrada.
      </p>
      {lista.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {lista.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-lg bg-cartao px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{r.titulo}</span>
              <span className="shrink-0 text-suave">
                {descreverFrequencia(r.frequencia, r.dia)} · próxima {descreverPrazo(r.proxima, hoje)}
              </span>
              <button
                type="button"
                title="Remover"
                aria-label={`Remover ${r.titulo}`}
                onClick={() => removerRecorrencia(r.id).then(carregar)}
                className="rounded-md p-1 text-apagado hover:bg-etiqueta hover:text-tinta"
              >
                <Icone nome="lixeira" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-2 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          criar();
        }}
      >
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título, ex.: Relatório mensal de acessos" className={campo} />
        <div className="flex flex-wrap gap-2">
          <select aria-label="Frequência" value={frequencia} onChange={(e) => setFrequencia(e.target.value as Frequencia)} className={campo}>
            <option value="diaria">Todo dia útil</option>
            <option value="semanal">Toda semana</option>
            <option value="mensal">Todo mês</option>
          </select>
          {frequencia === "semanal" && (
            <select aria-label="Dia da semana" value={dia} onChange={(e) => setDia(Number(e.target.value))} className={campo}>
              {DIAS_SEMANA.map((nome, i) => (
                <option key={nome} value={i + 1}>
                  {nome}
                </option>
              ))}
            </select>
          )}
          {frequencia === "mensal" && (
            <select aria-label="Dia do mês" value={dia} onChange={(e) => setDia(Number(e.target.value))} className={campo}>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i} value={i + 1}>
                  dia {i + 1}
                </option>
              ))}
            </select>
          )}
          <input list="rec-pessoas" value={pessoa} onChange={(e) => setPessoa(e.target.value)} placeholder="Quem pediu" className={`${campo} w-32`} />
          <input list="rec-projetos" value={projeto} onChange={(e) => setProjeto(e.target.value)} placeholder="Projeto" className={`${campo} w-32`} />
          <button type="submit" className="rounded-lg border border-linha px-3.5 py-1.5 text-sm hover:bg-etiqueta">
            Adicionar
          </button>
        </div>
        <datalist id="rec-pessoas">
          {sugestoes.pessoas.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <datalist id="rec-projetos">
          {sugestoes.projetos.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </form>
      {mensagem && <p className="mt-2 text-sm text-atraso">{mensagem}</p>}
    </div>
  );
}
