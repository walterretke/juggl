import { describe, expect, it } from "vitest";
import { item } from "../teste/item";
import { atendeCondicao, avaliarRegras, type Contexto, type Regra } from "./motor";

// Sexta 09/10/2026.
const SEXTA_15H = new Date(2026, 9, 9, 15, 0);

function pronta(id: string, condicao: Regra["condicao"], urgente = false): Regra {
  return { id, nome: id, tipo: "pronta", condicao, acao: { tipo: "notificar" }, ativa: true, urgente, ordem: 0 };
}

function contexto(extra: Partial<Contexto> = {}): Contexto {
  return { agora: SEXTA_15H, itens: [], foco: null, ritualFeito: true, concluidosHoje: [], ...extra };
}

describe("regras prontas", () => {
  it("prazo chegando: vence hoje às 18h, dentro de 4 horas, e não está em foco", () => {
    const itens = [
      item("hoje", { prazo: "2026-10-09", pessoa: "Carlos" }),
      item("amanha", { prazo: "2026-10-10" }),
      item("em-foco", { prazo: "2026-10-09", status: "em_foco" }),
    ];
    const d = avaliarRegras([pronta("prazo_chegando", { horas: 4 }, true)], contexto({ itens }));
    expect(d.map((x) => x.itemId)).toEqual(["hoje"]);
    expect(d[0]).toMatchObject({ urgente: true, chave: "prazo_chegando:hoje:2026-10-09" });
    expect(d[0].corpo).toBe("hoje vence hoje às 18h (pedido de Carlos).");
  });

  it("prazo chegando: às 13h ainda faltam 5 horas", () => {
    const itens = [item("hoje", { prazo: "2026-10-09" })];
    const d = avaliarRegras([pronta("prazo_chegando", { horas: 4 })], contexto({ itens, agora: new Date(2026, 9, 9, 13) }));
    expect(d).toEqual([]);
  });

  it("promessa esquecida: prometido e parado há 2 dias ou mais", () => {
    const itens = [
      item("parado", { prometido_para: "2026-10-12", atualizado_em: "2026-10-06T12:00:00.000Z", pessoa: "Ana" }),
      item("mexido", { prometido_para: "2026-10-12", atualizado_em: "2026-10-09T10:00:00.000Z" }),
      item("sem-promessa", { atualizado_em: "2026-10-01T10:00:00.000Z" }),
    ];
    const d = avaliarRegras([pronta("promessa_esquecida", { dias: 2 })], contexto({ itens }));
    expect(d.map((x) => x.itemId)).toEqual(["parado"]);
    expect(d[0].corpo).toContain("para Ana");
  });

  it("inbox acumulando: só passa do limite", () => {
    const itens = Array.from({ length: 3 }, (_, i) => item(`i${i}`, { status: "inbox" }));
    expect(avaliarRegras([pronta("inbox_acumulando", { itens: 3 })], contexto({ itens }))).toEqual([]);
    const d = avaliarRegras([pronta("inbox_acumulando", { itens: 2 })], contexto({ itens }));
    expect(d[0]).toMatchObject({ chave: "inbox_acumulando:2026-10-09", corpo: "3 itens esperam triagem." });
  });

  it("ritual pendente: depois da hora e sem ritual feito", () => {
    const itens = [item("a")];
    expect(avaliarRegras([pronta("ritual_pendente", { hora: "10:00" })], contexto({ itens, ritualFeito: true }))).toEqual([]);
    expect(avaliarRegras([pronta("ritual_pendente", { hora: "16:00" })], contexto({ itens, ritualFeito: false }))).toEqual([]);
    expect(avaliarRegras([pronta("ritual_pendente", { hora: "10:00" })], contexto({ itens, ritualFeito: false }))).toHaveLength(1);
  });

  it("foco esquecido: sessão mais longa que o limite", () => {
    const foco = { itemId: "f", titulo: "Relatório", inicio: new Date(2026, 9, 9, 12, 30).toISOString() };
    expect(avaliarRegras([pronta("foco_esquecido", { horas: 3 })], contexto({ foco }))).toEqual([]);
    const d = avaliarRegras([pronta("foco_esquecido", { horas: 2 })], contexto({ foco }));
    expect(d[0].corpo).toBe("O timer de Relatório está rodando há 2 horas. Pause se já parou.");
  });

  it("fim do dia: resumo depois da hora, nunca no fim de semana", () => {
    const itens = [item("Deploy", { prazo: "2026-10-10" }), item("Depois", { prazo: "2026-10-20" })];
    const ctx = contexto({ itens, concluidosHoje: ["a", "b"], agora: new Date(2026, 9, 9, 17, 45) });
    const d = avaliarRegras([pronta("fim_do_dia", { hora: "17:30" })], ctx);
    expect(d[0].corpo).toBe("Feito hoje: 2 itens. Vencem até amanhã: Deploy.");
    const sabado = { ...ctx, agora: new Date(2026, 9, 10, 18) };
    expect(avaliarRegras([pronta("fim_do_dia", { hora: "17:30" })], sabado)).toEqual([]);
  });

  it("regra desligada não dispara", () => {
    const regra = { ...pronta("inbox_acumulando", { itens: 0 }), ativa: false };
    expect(avaliarRegras([regra], contexto({ itens: [item("a", { status: "inbox" })] }))).toEqual([]);
  });
});

describe("regras personalizadas", () => {
  const chefeParado: Regra = {
    id: "r1",
    nome: "Chefe esperando",
    tipo: "personalizada",
    condicao: { pessoa_id: "chefe", parado_dias: 1 },
    acao: { tipo: "notificar" },
    ativa: true,
    urgente: false,
    ordem: 10,
  };

  it("todas as condições preenchidas precisam valer", () => {
    const agora = SEXTA_15H;
    const velho = "2026-10-07T10:00:00.000Z";
    expect(atendeCondicao(item("a", { pessoa_id: "chefe", atualizado_em: velho }), chefeParado.condicao, agora)).toBe(true);
    expect(atendeCondicao(item("b", { pessoa_id: "outro", atualizado_em: velho }), chefeParado.condicao, agora)).toBe(false);
    expect(atendeCondicao(item("c", { pessoa_id: "chefe", atualizado_em: "2026-10-09T12:00:00.000Z" }), chefeParado.condicao, agora)).toBe(false);
    expect(atendeCondicao(item("d"), {}, agora)).toBe(false);
  });

  it("colocar no dia não repete para quem já é do dia", () => {
    const regra: Regra = { ...chefeParado, condicao: { projeto_id: "mig", prazo: "hoje" }, acao: { tipo: "do_dia" } };
    const itens = [
      item("novo", { projeto_id: "mig", prazo: "2026-10-09" }),
      item("ja", { projeto_id: "mig", prazo: "2026-10-09", dia_planejado: "2026-10-09" }),
    ];
    const d = avaliarRegras([regra], contexto({ itens }));
    expect(d.map((x) => [x.itemId, x.acao.tipo, x.chave])).toEqual([["novo", "do_dia", "regra:r1:novo:2026-10-09"]]);
  });
});
