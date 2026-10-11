-- Migration 4: medir as 4 semanas de uso real (critérios de sucesso do plano)
-- e guardar as anotações do que irrita.

-- Um registro por dia em que o app ficou aberto; `ritual` = 1 se o ritual foi feito no dia.
CREATE TABLE dia_de_uso (
    dia       TEXT PRIMARY KEY, -- AAAA-MM-DD local
    aberto_em TEXT NOT NULL,
    ritual    INTEGER NOT NULL DEFAULT 0
);

-- Quanto tempo levou o apontamento de cada semana (da abertura de Horas até copiar ou exportar).
CREATE TABLE apontamento (
    id         TEXT PRIMARY KEY,
    semana     TEXT NOT NULL, -- segunda-feira da semana apontada
    duracao_ms INTEGER NOT NULL,
    criado_em  TEXT NOT NULL
);

-- "O que irrita": anotações rápidas durante o uso, para virar a lista de correções.
CREATE TABLE irritacao (
    id           TEXT PRIMARY KEY,
    texto        TEXT NOT NULL,
    tela         TEXT,
    criada_em    TEXT NOT NULL,
    resolvida_em TEXT
);

-- Os dias em que já houve atividade contam como dias de uso.
INSERT OR IGNORE INTO dia_de_uso (dia, aberto_em)
    SELECT date(timestamp, 'localtime'), MIN(timestamp) FROM evento GROUP BY date(timestamp, 'localtime');
UPDATE dia_de_uso SET ritual = 1 WHERE dia = (SELECT valor FROM config WHERE chave = 'ritual_feito');

-- O período de uso real começa no dia em que esta versão abre pela primeira vez.
INSERT OR IGNORE INTO config (chave, valor) VALUES ('uso_inicio', date('now', 'localtime'));
