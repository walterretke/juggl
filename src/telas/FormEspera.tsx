import { useEffect, useState } from "react";
import { dataLocalIso, descreverPrazo } from "../captura/datas";
import { listarTiposEspera, type TipoEspera } from "../db/esperas";
import type { Item, Mudancas } from "../db/itens";
import Calendario from "./captura/Calendario";

/** O que é pedido ao pôr um item em espera. */
export interface Espera {
  /** Tipo de espera (motivo), da lista das Configurações. */
  motivo: string | null;
  /** Nome do motivo, para o aviso ("Em espera: Aguardando aprovação"). */
  nomeMotivo: string | null;
  quem: string | null;
  /** Dia de cobrar o retorno; nesse dia o item volta para A fazer. */
  ate: string | null;
}

interface Props {
  item: Item;
  agora: Date;
  aoConfirmar: (espera: Espera) => void;
}

/** O que muda no item ao pôr em espera. Planejado para hoje e em espera não combina: sai de Hoje. */
export function mudancasDeEspera({ motivo, quem, ate }: Espera): Mudancas {
  return { status: "aguardando", espera_tipo_id: motivo, aguardando_quem: quem, aguardando_ate: ate, dia_planejado: null, quando: null };
}

export function mensagemDeEspera({ nomeMotivo, quem }: Espera): string {
  return `Em espera${nomeMotivo ? `: ${nomeMotivo}` : ""}${quem ? ` (${quem})` : ""}`;
}

function diasDepois(agora: Date, dias: number): string {
  return dataLocalIso(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + dias));
}

const campo =
  "mt-1 w-full rounded-lg border border-linha bg-folha px-2.5 py-1.5 text-sm font-normal normal-case tracking-normal text-tinta outline-none focus:border-destaque";

/** Motivo da espera, de quem é a vez e quando cobrar o retorno. Enter confirma. */
export function FormEspera({ item, agora, aoConfirmar }: Props) {
  const [tipos, setTipos] = useState<TipoEspera[] | null>(null);
  const [motivo, setMotivo] = useState<string | null>(item.espera_tipo_id);
  const [quem, setQuem] = useState(item.aguardando_quem ?? item.pessoa ?? "");
  const [ate, setAte] = useState<string | null>(item.aguardando_ate ?? diasDepois(agora, 2));
  const [calendario, setCalendario] = useState(false);

  useEffect(() => {
    listarTiposEspera()
      .then((lista) => {
        setTipos(lista);
        // Sem motivo ainda (ou o dele foi removido): vem marcado o primeiro da lista.
        setMotivo((atual) => (atual && lista.some((t) => t.id === atual) ? atual : lista[0]?.id ?? null));
      })
      .catch(() => setTipos([]));
  }, []);

  const opcoes = [
    { nome: "Amanhã", valor: diasDepois(agora, 1) },
    { nome: "Em 2 dias", valor: diasDepois(agora, 2) },
    { nome: "Em 1 semana", valor: diasDepois(agora, 7) },
    { nome: "Sem data", valor: null as string | null },
  ];
  const confirmar = () =>
    aoConfirmar({ motivo, nomeMotivo: tipos?.find((t) => t.id === motivo)?.nome ?? null, quem: quem.trim() || null, ate });
  return (
    <form
      className="flex w-72 flex-col gap-2 p-1"
      onSubmit={(e) => {
        e.preventDefault();
        confirmar();
      }}
      onKeyDown={(e) => {
        // Enter no dropdown também confirma, como nos outros campos.
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "SELECT") {
          e.preventDefault();
          confirmar();
        }
      }}
    >
      <label className="text-xs font-semibold uppercase tracking-wider text-apagado">
        Motivo da espera
        <select
          autoFocus
          value={motivo ?? ""}
          onChange={(e) => setMotivo(e.target.value || null)}
          className={campo}
        >
          {tipos?.length === 0 && <option value="">Sem motivo (crie tipos nas Configurações)</option>}
          {tipos?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-semibold uppercase tracking-wider text-apagado">
        Esperando quem
        <input
          value={quem}
          onChange={(e) => setQuem(e.target.value)}
          placeholder="Carlos, fornecedor, equipe de redes..."
          className={campo}
        />
      </label>
      <p className="text-xs font-semibold uppercase tracking-wider text-apagado">Cobrar o retorno</p>
      <div className="flex flex-wrap gap-1.5">
        {opcoes.map((o) => (
          <button
            key={o.nome}
            type="button"
            onClick={() => setAte(o.valor)}
            className={`rounded-full px-3 py-1 text-[13px] ${
              ate === o.valor ? "bg-destaque font-semibold text-folha" : "bg-etiqueta text-tinta-2 hover:text-tinta"
            }`}
          >
            {o.nome}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCalendario(!calendario)}
          className={`rounded-full px-3 py-1 text-[13px] ${
            ate && !opcoes.some((o) => o.valor === ate) ? "bg-destaque font-semibold text-folha" : "bg-etiqueta text-tinta-2 hover:text-tinta"
          }`}
        >
          {ate && !opcoes.some((o) => o.valor === ate) ? descreverPrazo(ate, agora) : "Outra data"}
        </button>
      </div>
      {calendario && (
        <Calendario
          valor={ate}
          aoEscolher={(d) => {
            setAte(d);
            setCalendario(false);
          }}
          aoFechar={() => setCalendario(false)}
        />
      )}
      <p className="text-[13px] text-suave">
        {ate ? `No dia, o item volta para A fazer e o Juggl avisa para cobrar.` : "Fica em espera até você tirar."}
      </p>
      <button
        type="submit"
        disabled={!tipos}
        className="self-start rounded-lg bg-destaque px-3 py-1.5 text-sm font-semibold text-folha hover:opacity-90 disabled:opacity-40"
      >
        Pôr em espera <kbd className="ml-1 font-sans font-normal opacity-70">Enter</kbd>
      </button>
    </form>
  );
}

/** Janela que pede o motivo ao soltar um cartão em Em espera no Meu dia. Esc cancela. */
export default function PedidoEspera({ item, agora, aoConfirmar, aoCancelar }: Props & { aoCancelar: () => void }) {
  return (
    <div
      className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:pt-24"
      onMouseDown={(e) => e.target === e.currentTarget && aoCancelar()}
      onKeyDown={(e) => {
        // As teclas ficam na janela: não viram atalhos da tela de trás (Tab, Z...).
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          aoCancelar();
        }
      }}
    >
      <div className="rounded-2xl bg-folha p-5 text-tinta shadow-2xl ring-1 ring-linha">
        <p className="text-xs font-semibold uppercase tracking-wider text-apagado">Em espera</p>
        <p className="mt-1 mb-3 max-w-72 truncate font-titulo text-xl font-medium" title={item.titulo}>
          {item.titulo}
        </p>
        <FormEspera item={item} agora={agora} aoConfirmar={aoConfirmar} />
      </div>
    </div>
  );
}
