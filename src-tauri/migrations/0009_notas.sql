-- Migration 9: notas com lembrete.
-- Uma nota não é uma tarefa: é algo para não esquecer ("marcar reunião com o Carlos"),
-- que avisa de tempos em tempos até ser resolvida. Pode virar tarefa, mas não precisa.

CREATE TABLE nota (
    id            TEXT PRIMARY KEY,
    titulo        TEXT NOT NULL,
    descricao     TEXT,
    intervalo_min INTEGER NOT NULL CHECK (intervalo_min > 0), -- de quanto em quanto tempo avisar
    proximo_aviso TEXT NOT NULL,                              -- ISO 8601 UTC
    status        TEXT NOT NULL DEFAULT 'ativa'
                  CHECK (status IN ('ativa', 'resolvida', 'virou_tarefa')),
    item_id       TEXT REFERENCES item (id) ON DELETE SET NULL, -- a tarefa em que ela virou
    avisos        INTEGER NOT NULL DEFAULT 0,                  -- quantas vezes já avisou
    criada_em     TEXT NOT NULL,
    fechada_em    TEXT
);

CREATE INDEX nota_ativa ON nota (status, proximo_aviso);

