-- Migration 2: prioridades editáveis. As três de sempre viram linhas de uma tabela
-- que o usuário pode renomear, reordenar, recolorir e ampliar.
-- A coluna antiga item.prioridade tem um CHECK fixo e o SQLite não remove CHECK sem
-- recriar a tabela (o que apagaria os eventos em cascata), então ela fica sem uso
-- e os itens passam a apontar para prioridade_id.

CREATE TABLE prioridade (
    id    TEXT PRIMARY KEY,
    nome  TEXT NOT NULL UNIQUE COLLATE NOCASE, -- usado no ! da captura avançada
    ordem INTEGER NOT NULL,                    -- 1 é a mais urgente
    cor   TEXT NOT NULL DEFAULT 'cinza'        -- vermelho, ambar, azul, verde, roxo ou cinza
);

-- Os ids das três iniciais são os valores antigos, para a cópia abaixo bastar.
INSERT INTO prioridade (id, nome, ordem, cor) VALUES
    ('alta', 'Alta', 1, 'vermelho'),
    ('media', 'Média', 2, 'ambar'),
    ('baixa', 'Baixa', 3, 'cinza');

ALTER TABLE item ADD COLUMN prioridade_id TEXT REFERENCES prioridade (id) ON DELETE SET NULL;

UPDATE item SET prioridade_id = prioridade WHERE prioridade IS NOT NULL;
