import { COR_ORIGEM, NOME_ORIGEM } from "./origens";

export default function Origem({ origem, id }: { origem: string; id?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
      <span className={`size-2 shrink-0 rounded-full ${COR_ORIGEM[origem] ?? COR_ORIGEM.manual}`} />
      {NOME_ORIGEM[origem] ?? origem}
      {id ? <span className="font-mono text-[11px]">{id}</span> : null}
    </span>
  );
}
