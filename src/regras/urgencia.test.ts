import { describe, expect, it } from "vitest";
import { item } from "../teste/item";
import { detectarPrioridadeErrada, explicar, HISTORICO_VAZIO, pontosDasPrioridades, pontuar, type Urgencia } from "./urgencia";

// Quarta 07/10/2026, 15h.
const QUARTA = new Date(2026, 9, 7, 15, 0);
const RECENTE = "2026-10-07T17:00:00.000Z";
const ORDEM = pontosDasPrioridades(["alta", "media", "baixa"]);

function pontos(extra: Parameters<typeof item>[1]) {
  return pontuar(item("x", { atualizado_em: RECENTE, ...extra }), QUARTA, ORDEM).total;
}

describe("pontuação de urgência", () => {
  it("prazo: atrasado 50, hoje 40, amanhã 25, esta semana 10, depois 0", () => {
    expect(pontos({ prazo: "2026-10-06" })).toBe(50);
    expect(pontos({ prazo: "2026-10-07" })).toBe(40);
    expect(pontos({ prazo: "2026-10-08" })).toBe(25);
    expect(pontos({ prazo: "2026-10-11" })).toBe(10); // domingo
    expect(pontos({ prazo: "2026-10-12" })).toBe(0);
  });

  it("usa a promessa quando ela vence antes do prazo", () => {
    const u = pontuar(item("x", { atualizado_em: RECENTE, prazo: "2026-10-12", prometido_para: "2026-10-07" }), QUARTA, ORDEM);
    expect(u.total).toBe(40);
    expect(explicar(u)).toBe("você prometeu para hoje");
  });

  it("cobrança 15 cada até 45; espera 2 por dia até 20", () => {
    expect(pontos({ cobrancas: 2 })).toBe(30);
    expect(pontos({ cobrancas: 5 })).toBe(45);
    expect(pontos({ atualizado_em: "2026-10-04T12:00:00.000Z" })).toBe(6);
    expect(pontos({ atualizado_em: "2026-08-01T12:00:00.000Z" })).toBe(20);
  });

  it("prioridade contada de baixo: com quatro, as duas de cima valem 20", () => {
    expect([...pontosDasPrioridades(["urgente", "alta", "media", "baixa"]).values()]).toEqual([20, 20, 10, 0]);
    expect([...pontosDasPrioridades(["unica"]).values()]).toEqual([0]);
  });

  it("prioridade pela ordem (20, 10, 0) e 15 se é uma das 3 do dia", () => {
    expect(pontos({ prioridade_id: "alta" })).toBe(20);
    expect(pontos({ prioridade_id: "media" })).toBe(10);
    expect(pontos({ prioridade_id: "baixa" })).toBe(0);
    expect(pontos({ dia_planejado: "2026-10-07" })).toBe(15);
    expect(pontos({ dia_planejado: "2026-10-06" })).toBe(0);
  });

  it("explica com os dois motivos que mais pesam", () => {
    const u = pontuar(
      item("x", { atualizado_em: RECENTE, prazo: "2026-10-07", cobrancas: 2, pessoa: "Carlos", prioridade_id: "alta", prioridade: "Alta" }),
      QUARTA,
      ORDEM,
    );
    expect(u.total).toBe(90);
    expect(explicar(u)).toBe("vence hoje e Carlos já cobrou 2 vezes");
  });
});

describe("detector de prioridade errada", () => {
  const foco = item("foco", { status: "em_foco", atualizado_em: RECENTE });
  const urgente = item("urgente", { titulo: "Relatório de acessos", prazo: "2026-10-07", atualizado_em: RECENTE });
  const pouco = item("pouco", { prazo: "2026-10-08", atualizado_em: RECENTE });

  it("avisa quando outro está 30 pontos ou mais à frente", () => {
    const a = detectarPrioridadeErrada(foco, [foco, pouco, urgente], QUARTA, ORDEM, HISTORICO_VAZIO);
    expect(a).toMatchObject({ outro: { id: "urgente" }, pontosFoco: 0, pontosOutro: 40, explicacao: "vence hoje" });
  });

  it("não avisa abaixo de 30 sem evento novo", () => {
    expect(detectarPrioridadeErrada(foco, [foco, pouco], QUARTA, ORDEM, HISTORICO_VAZIO)).toBeNull();
  });

  it("avisa quando um evento novo faz o outro passar à frente durante o foco", () => {
    const focoAlto = item("foco", { status: "em_foco", atualizado_em: RECENTE, prazo: "2026-10-08" }); // 25
    const antes = item("outro", { atualizado_em: RECENTE, prioridade_id: "media" }); // 10
    const depois = { ...antes, cobrancas: 2 }; // 40
    const inicio = new Map<string, Urgencia>([
      ["foco", pontuar(focoAlto, QUARTA, ORDEM)],
      ["outro", pontuar(antes, QUARTA, ORDEM)],
    ]);
    expect(detectarPrioridadeErrada(focoAlto, [focoAlto, depois], QUARTA, ORDEM, HISTORICO_VAZIO, inicio)).toMatchObject({
      outro: { id: "outro" },
      pontosOutro: 40,
    });
    // Sem o evento novo, a mesma diferença não avisa.
    expect(detectarPrioridadeErrada(focoAlto, [focoAlto, antes], QUARTA, ORDEM, HISTORICO_VAZIO, inicio)).toBeNull();
  });

  it("no máximo uma vez por hora por par, e nada enquanto adiado", () => {
    const ha30 = new Date(QUARTA.getTime() - 30 * 60 * 1000).toISOString();
    const ha2h = new Date(QUARTA.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const itens = [foco, urgente];
    expect(detectarPrioridadeErrada(foco, itens, QUARTA, ORDEM, { ...HISTORICO_VAZIO, avisados: { "foco:urgente": ha30 } })).toBeNull();
    expect(detectarPrioridadeErrada(foco, itens, QUARTA, ORDEM, { ...HISTORICO_VAZIO, avisados: { "foco:urgente": ha2h } })).not.toBeNull();
    const adiado = new Date(QUARTA.getTime() + 10 * 60 * 1000).toISOString();
    expect(detectarPrioridadeErrada(foco, itens, QUARTA, ORDEM, { ...HISTORICO_VAZIO, adiadoAte: adiado })).toBeNull();
  });

  it("depois de continuar, só avisa de novo se o outro subir", () => {
    const historico = { ...HISTORICO_VAZIO, ignorados: { "foco:urgente": 40 } };
    expect(detectarPrioridadeErrada(foco, [foco, urgente], QUARTA, ORDEM, historico)).toBeNull();
    const cobrado = { ...urgente, cobrancas: 1 };
    expect(detectarPrioridadeErrada(foco, [foco, cobrado], QUARTA, ORDEM, historico)).not.toBeNull();
  });

  it("ignora itens da caixa de entrada", () => {
    expect(detectarPrioridadeErrada(foco, [foco, { ...urgente, status: "inbox" }], QUARTA, ORDEM, HISTORICO_VAZIO)).toBeNull();
  });
});
