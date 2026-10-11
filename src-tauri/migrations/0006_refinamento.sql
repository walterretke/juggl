-- Migration 6: refinamento antes do uso real.

-- Aguardando alguém: de quem é a vez e quando cobrar o retorno (AAAA-MM-DD).
-- O status 'aguardando' já existia desde a migration 1, sem tela.
ALTER TABLE item ADD COLUMN aguardando_quem TEXT;
ALTER TABLE item ADD COLUMN aguardando_ate TEXT;

-- Tempo lançado à mão nas Horas da semana: reunião, foco esquecido.
-- Fica ligado a um item, a um projeto ou só a uma descrição.
CREATE TABLE sessao_manual (
    id         TEXT PRIMARY KEY,
    item_id    TEXT REFERENCES item (id) ON DELETE SET NULL,
    projeto_id TEXT REFERENCES projeto (id) ON DELETE SET NULL,
    descricao  TEXT,
    inicio     TEXT NOT NULL,
    fim        TEXT NOT NULL,
    criado_em  TEXT NOT NULL
);

CREATE INDEX sessao_manual_inicio ON sessao_manual (inicio);

-- Itens recorrentes: viram um item novo na caixa de entrada em cada `proxima` (AAAA-MM-DD).
-- `dia` é o dia da semana (1 = segunda ... 7 = domingo) na semanal e o dia do mês na mensal.
CREATE TABLE recorrencia (
    id            TEXT PRIMARY KEY,
    titulo        TEXT NOT NULL,
    nota          TEXT,
    pessoa_id     TEXT REFERENCES pessoa (id) ON DELETE SET NULL,
    projeto_id    TEXT REFERENCES projeto (id) ON DELETE SET NULL,
    prioridade_id TEXT REFERENCES prioridade (id) ON DELETE SET NULL,
    frequencia    TEXT NOT NULL CHECK (frequencia IN ('diaria', 'semanal', 'mensal')),
    dia           INTEGER,
    proxima       TEXT NOT NULL,
    ativa         INTEGER NOT NULL DEFAULT 1,
    criado_em     TEXT NOT NULL
);

-- Regra pronta nova: avisa no dia de cobrar o retorno de quem você está esperando.
INSERT INTO regra (id, nome, tipo, condicao, ativa, urgente, ordem) VALUES
    ('retorno_aguardando', 'Cobrar retorno', 'pronta', '{}', 1, 0, 7);
