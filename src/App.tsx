import { useEffect, useState } from "react";
import { contarInbox, modoJournal } from "./db";

type Estado =
  | { tipo: "carregando" }
  | { tipo: "pronto"; inbox: number; journal: string }
  | { tipo: "erro"; mensagem: string };

export default function App() {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });

  useEffect(() => {
    Promise.all([contarInbox(), modoJournal()])
      .then(([inbox, journal]) => setEstado({ tipo: "pronto", inbox, journal }))
      .catch((e) => setEstado({ tipo: "erro", mensagem: String(e) }));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-neutral-50 p-6 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
      <h1 className="text-3xl font-semibold">Juggl</h1>
      {estado.tipo === "carregando" && <p className="text-neutral-500">Abrindo o banco…</p>}
      {estado.tipo === "pronto" && (
        <p className="text-neutral-500">
          Banco pronto: {estado.inbox} {estado.inbox === 1 ? "item" : "itens"} na caixa de entrada
          (journal: {estado.journal}).
        </p>
      )}
      {estado.tipo === "erro" && (
        <p className="max-w-lg text-center text-red-600">Erro ao abrir o banco: {estado.mensagem}</p>
      )}
    </main>
  );
}
