/** Ícones de linha simples (16px), na cor do texto. */
const CAMINHOS = {
  check: "M3.5 8.5l3 3 6-7",
  calendario: "M3 4.5h10v9H3zM3 7h10M5.5 3v3M10.5 3v3",
  bandeira: "M4 14V2.5M4 3h7.5l-1.5 2.5L11.5 8H4",
  foco: "M5 3.5v9l7-4.5z",
  seta: "M3 8h9M8.5 4.5L12 8l-3.5 3.5",
  voltar: "M13 8H4M7.5 4.5L4 8l3.5 3.5",
  link: "M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5",
  arquivar: "M2.5 3.5h11v3h-11zM3.5 6.5V13h9V6.5M6.5 9h3",
  lapis: "M10.5 3l2.5 2.5L6 12.5H3.5V10z",
  pessoa: "M8 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM3.5 13.5c.5-2.5 2.3-3.5 4.5-3.5s4 1 4.5 3.5",
  projeto: "M2.5 4.5h4l1 1.5h6v7h-11z",
} as const;

export type NomeIcone = keyof typeof CAMINHOS;

export default function Icone({ nome, className }: { nome: NomeIcone; className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={CAMINHOS[nome]} />
    </svg>
  );
}
