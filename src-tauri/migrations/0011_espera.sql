-- Migration 11: coluna Em espera do Meu dia, com o motivo da espera.
-- Em espera é o status 'aguardando' que já existe (o CHECK de item.status já o aceita).
-- O motivo vem de uma lista editável nas Configurações, como as prioridades.

CREATE TABLE tipo_espera (
    id    TEXT PRIMARY KEY,
    nome  TEXT NOT NULL UNIQUE COLLATE NOCASE,
    ordem INTEGER NOT NULL,
    cor   TEXT NOT NULL DEFAULT 'cinza' -- vermelho, ambar, azul, verde, roxo ou cinza
);

INSERT INTO tipo_espera (id, nome, ordem, cor) VALUES
    ('aprovacao', 'Aguardando aprovação', 1, 'ambar'),
    ('desenvolvimento', 'Aguardando desenvolvimento', 2, 'azul'),
    ('resposta', 'Aguardando resposta', 3, 'roxo'),
    ('terceiros', 'Aguardando terceiros', 4, 'cinza'),
    ('bloqueado', 'Bloqueado', 5, 'vermelho');

-- Motivo da espera do item; vazio fora de Em espera.
ALTER TABLE item ADD COLUMN espera_tipo_id TEXT REFERENCES tipo_espera (id) ON DELETE SET NULL;
