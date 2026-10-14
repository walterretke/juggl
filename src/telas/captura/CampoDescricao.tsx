import TextoRico from "../TextoRico";

interface Props {
  valor: string;
  aoMudar: (valor: string) => void;
  /** Texto de ajuda no campo vazio. */
  dica?: string;
  /** Na nova tarefa Enter salva; no editor da tarefa Enter quebra a linha e Ctrl+Enter salva. */
  modo?: "captura" | "editor";
  aoSalvar?: () => void;
}

/** Descrição da tarefa, com negrito, itálico e listas. */
export default function CampoDescricao({
  valor,
  aoMudar,
  dica = "Detalhes ou a mensagem recebida (opcional)",
  modo = "captura",
  aoSalvar,
}: Props) {
  return (
    <div>
      <label htmlFor="captura-nota" className="block text-xs font-semibold text-suave">
        Descrição
      </label>
      <TextoRico
        id="captura-nota"
        valor={valor}
        aoMudar={aoMudar}
        dica={dica}
        modo={modo}
        aoSalvar={aoSalvar}
        alturaInicial={modo === "editor" ? "12rem" : "7rem"}
      />
    </div>
  );
}
