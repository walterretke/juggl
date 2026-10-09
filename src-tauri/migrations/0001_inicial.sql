-- Migration 1: tabelas do MVP usadas desde as semanas 1–2 (ver juggl.pdf, "Modelo de dados").
-- IDs são UUID v7 em texto. Datas e horas em ISO 8601 UTC; prazos como data local AAAA-MM-DD.
-- A tabela `regra` entra na semana 7.

CREATE TABLE pessoa (
    id      TEXT PRIMARY KEY,
    nome    TEXT NOT NULL,
    apelido TEXT NOT NULL UNIQUE COLLATE NOCASE -- usado no @ da captura
);

CREATE TABLE projeto (
    id                 TEXT PRIMARY KEY,
    nome               TEXT NOT NULL UNIQUE COLLATE NOCASE, -- usado no # da captura
    cor                TEXT,
    codigo_apontamento TEXT
);

CREATE TABLE item (
    id             TEXT PRIMARY KEY,
    titulo         TEXT NOT NULL,
    nota           TEXT,
    status         TEXT NOT NULL DEFAULT 'inbox'
                   CHECK (status IN ('inbox', 'a_fazer', 'em_foco', 'pausado', 'aguardando', 'feito', 'arquivado')),
    prioridade     TEXT CHECK (prioridade IN ('alta', 'media', 'baixa')),
    prazo          TEXT,
    prometido_para TEXT,
    projeto_id     TEXT REFERENCES projeto (id) ON DELETE SET NULL,
    pessoa_id      TEXT REFERENCES pessoa (id) ON DELETE SET NULL,
    link           TEXT,
    origem         TEXT NOT NULL DEFAULT 'manual'
                   CHECK (origem IN ('teams', 'jira', 'servicenow', 'devops', 'manual')),
    id_externo     TEXT,
    dia_planejado  TEXT, -- marca as 3 prioridades do ritual da manhã (semana 5)
    criado_em      TEXT NOT NULL,
    atualizado_em  TEXT NOT NULL
);

CREATE INDEX item_status ON item (status);
CREATE INDEX item_pessoa ON item (pessoa_id);
CREATE INDEX item_projeto ON item (projeto_id);

CREATE TABLE evento (
    id        TEXT PRIMARY KEY,
    item_id   TEXT NOT NULL REFERENCES item (id) ON DELETE CASCADE,
    tipo      TEXT NOT NULL
              CHECK (tipo IN ('criado', 'cobrado', 'foco_inicio', 'foco_fim', 'prazo_alterado', 'alerta_ignorado', 'concluido')),
    timestamp TEXT NOT NULL,
    dados     TEXT -- JSON
);

CREATE INDEX evento_item ON evento (item_id, timestamp);

CREATE TABLE config (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
);
