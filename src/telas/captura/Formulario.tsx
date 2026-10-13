import { useRef, useState } from "react";
import { dataLocalIso, descreverPrazo, fimDaSemana, fimDoMes } from "../../captura/datas";
import type { Prioridade } from "../../db/prioridades";
import { ETIQUETA_PRIORIDADE } from "../cores";
import Autocompletar from "./Autocompletar";
import Calendario from "./Calendario";
import CampoDescricao from "./CampoDescricao";

export interface ValoresFormulario {
  titulo: string;
  pessoa: string;
  projeto: string;
  prioridadeId: string | null;
  prazo: string | null; // AAAA-MM-DD
}

export const FORMULARIO_VAZIO: ValoresFormulario = {
  titulo: "",
  pessoa: "",
  projeto: "",
  prioridadeId: null,
  prazo: null,
};

interface Props {
  valores: ValoresFormulario;
  aoMudar: (mudancas: Partial<ValoresFormulario>) => void;
  sugestoes: { pessoas: string[]; projetos: string[] };
  prioridades: Prioridade[];
  refTitulo: React.Ref<HTMLInputElement>;
  /** Título usado se o campo ficar vazio ("Atividade N"). */
  tituloSugerido: string;
  descricao: string;
  aoMudarDescricao: (descricao: string) => void;
  /** Ajuda da descrição. */
  dicaDescricao?: string;
  /** "editor": Enter quebra a linha na descrição e Ctrl+Enter salva; "captura": Enter salva. */
  modoDescricao?: "captura" | "editor";
  aoSalvar?: () => void;
  /** Conteúdo extra logo depois da descrição (checklist e anexos, no editor). */
  depoisDaDescricao?: React.ReactNode;
  /** Pergunta do título ("O que chegou?" na nova tarefa). */
  rotuloTitulo?: string;
}

function amanha(): string {
  const d = new Date();
  return dataLocalIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
}

const chip = "rounded-full px-3 py-1 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-destaque/50";
const chipLivre = `${chip} bg-etiqueta text-tinta-2 hover:text-tinta`;
const chipMarcado = `${chip} bg-destaque font-semibold text-folha`;

/**
 * Grupo de opções com uma parada só no Tab: as setas trocam a escolha,
 * como um grupo de botões de rádio.
 */
export function Opcoes<T>({
  rotulo,
  opcoes,
  valor,
  aoEscolher,
}: {
  rotulo: string;
  opcoes: { valor: T; nome: string; classe?: string }[];
  valor: T;
  aoEscolher: (valor: T) => void;
}) {
  const atual = Math.max(
    0,
    opcoes.findIndex((o) => o.valor === valor),
  );
  return (
    <div
      role="radiogroup"
      aria-label={rotulo}
      className="mt-1 flex flex-wrap gap-1.5"
      onKeyDown={(e) => {
        const passo = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!passo) return;
        e.preventDefault();
        const proximo = (atual + passo + opcoes.length) % opcoes.length;
        aoEscolher(opcoes[proximo].valor);
        (e.currentTarget.children[proximo] as HTMLElement | undefined)?.focus();
      }}
    >
      {opcoes.map((o, i) => {
        const marcado = o.valor === valor;
        return (
          <button
            key={o.nome}
            type="button"
            role="radio"
            aria-checked={marcado}
            tabIndex={i === atual ? 0 : -1}
            onClick={() => aoEscolher(o.valor)}
            className={marcado ? (o.classe ? `${chip} font-semibold ring-2 ring-current ${o.classe}` : chipMarcado) : chipLivre}
          >
            {o.nome}
          </button>
        );
      })}
    </div>
  );
}

/** Captura padrão: título, descrição e campos para escolher, sem precisar lembrar marcações. */
export default function Formulario({
  valores,
  aoMudar,
  sugestoes,
  prioridades,
  refTitulo,
  tituloSugerido,
  descricao,
  aoMudarDescricao,
  dicaDescricao,
  modoDescricao = "captura",
  aoSalvar,
  depoisDaDescricao,
  rotuloTitulo = "O que chegou?",
}: Props) {
  const [calendario, setCalendario] = useState(false);
  const grupoPrazo = useRef<HTMLDivElement>(null);

  // Ao fechar o calendário, o foco volta para o prazo, para o Enter seguinte salvar.
  function fecharCalendario() {
    setCalendario(false);
    requestAnimationFrame(() => grupoPrazo.current?.querySelector<HTMLElement>("[aria-checked=true]")?.focus());
  }
  const hoje = dataLocalIso(new Date());
  // "Esta semana" e "Este mês" só aparecem quando caem num dia diferente das opções anteriores.
  const prontas = [hoje, amanha(), fimDaSemana(new Date()), fimDoMes(new Date())];
  const semana = prontas[2] !== hoje && prontas[2] !== prontas[1] ? prontas[2] : null;
  const mes = prontas[3] !== hoje && prontas[3] !== prontas[1] && prontas[3] !== prontas[2] ? prontas[3] : null;
  const dataEscolhida = valores.prazo && ![hoje, amanha(), semana, mes].includes(valores.prazo) ? valores.prazo : null;

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <label htmlFor="captura-titulo" className="block text-xs font-semibold uppercase tracking-wider text-apagado">
          {rotuloTitulo}
        </label>
        <input
          id="captura-titulo"
          ref={refTitulo}
          autoFocus
          value={valores.titulo}
          onChange={(e) => aoMudar({ titulo: e.target.value })}
          placeholder={`Título (vazio fica "${tituloSugerido}")`}
          spellCheck={false}
          className="mt-1 h-10 w-full bg-transparent text-xl caret-destaque outline-none placeholder:text-apagado"
        />
      </div>

      <CampoDescricao valor={descricao} aoMudar={aoMudarDescricao} dica={dicaDescricao} modo={modoDescricao} aoSalvar={aoSalvar} />
      {depoisDaDescricao}

      <div className="flex gap-3">
        <Autocompletar
          id="captura-pessoa"
          rotulo="Quem pediu"
          valor={valores.pessoa}
          opcoes={sugestoes.pessoas}
          placeholder="Nome"
          aoMudar={(pessoa) => aoMudar({ pessoa })}
        />
        <Autocompletar
          id="captura-projeto"
          rotulo="Projeto"
          valor={valores.projeto}
          opcoes={sugestoes.projetos}
          placeholder="Opcional"
          aoMudar={(projeto) => aoMudar({ projeto })}
        />
      </div>

      <div>
        <span className="block text-xs font-semibold text-suave">Prioridade</span>
        <Opcoes
          rotulo="Prioridade"
          valor={valores.prioridadeId}
          aoEscolher={(prioridadeId) => aoMudar({ prioridadeId })}
          opcoes={[
            { valor: null, nome: "Nenhuma" },
            ...prioridades.map((p) => ({ valor: p.id as string | null, nome: p.nome, classe: ETIQUETA_PRIORIDADE[p.cor] })),
          ]}
        />
      </div>

      <div>
        <span className="block text-xs font-semibold text-suave">Prazo</span>
        <div ref={grupoPrazo} className="flex flex-wrap items-center gap-1.5">
          <Opcoes
            rotulo="Prazo"
            valor={dataEscolhida ? "outra" : (valores.prazo ?? "")}
            aoEscolher={(v) => {
              if (v === "outra") {
                setCalendario(true);
                return;
              }
              setCalendario(false);
              aoMudar({ prazo: v || null });
            }}
            opcoes={[
              { valor: "", nome: "Sem prazo" },
              { valor: hoje, nome: "Hoje" },
              { valor: amanha(), nome: "Amanhã" },
              ...(semana ? [{ valor: semana, nome: "Esta semana" }] : []),
              ...(mes ? [{ valor: mes, nome: "Este mês" }] : []),
              { valor: "outra", nome: dataEscolhida ? descreverPrazo(dataEscolhida, new Date()) : "Escolher data…" },
            ]}
          />
        </div>
        {calendario && (
          <Calendario
            valor={valores.prazo}
            aoEscolher={(prazo) => {
              aoMudar({ prazo });
              fecharCalendario();
            }}
            aoFechar={fecharCalendario}
          />
        )}
      </div>
    </div>
  );
}
