-- Migration 3: regras de notificação (semanas 7–8).
-- As seis regras prontas do PDF são linhas fixas (tipo 'pronta') que o usuário liga,
-- desliga e ajusta; as personalizadas (tipo 'personalizada') têm condição e ação
-- montadas na tela de regras. `condicao` e `acao` são JSON.

CREATE TABLE regra (
    id       TEXT PRIMARY KEY,
    nome     TEXT NOT NULL,
    tipo     TEXT NOT NULL CHECK (tipo IN ('pronta', 'personalizada')),
    condicao TEXT NOT NULL DEFAULT '{}',
    acao     TEXT NOT NULL DEFAULT '{"tipo":"notificar"}',
    ativa    INTEGER NOT NULL DEFAULT 1,
    -- Urgente passa pelo não perturbe durante o foco; as outras esperam a pausa.
    urgente  INTEGER NOT NULL DEFAULT 0,
    ordem    INTEGER NOT NULL DEFAULT 0
);

INSERT INTO regra (id, nome, tipo, condicao, ativa, urgente, ordem) VALUES
    ('prazo_chegando',     'Prazo chegando',     'pronta', '{"horas":4}',       1, 1, 1),
    ('promessa_esquecida', 'Promessa esquecida', 'pronta', '{"dias":2}',        1, 0, 2),
    ('inbox_acumulando',   'Inbox acumulando',   'pronta', '{"itens":10}',      1, 0, 3),
    ('ritual_pendente',    'Ritual pendente',    'pronta', '{"hora":"10:00"}',  1, 0, 4),
    ('foco_esquecido',     'Foco esquecido',     'pronta', '{"horas":2}',       1, 0, 5),
    ('fim_do_dia',         'Fim do dia',         'pronta', '{"hora":"17:30"}',  1, 0, 6);

-- Cada aviso disparado, uma vez por `chave` (ex.: prazo de um item num dia).
-- `entregue_em` vazio quer dizer que está esperando o fim do foco (não perturbe).
CREATE TABLE notificacao (
    id          TEXT PRIMARY KEY,
    regra_id    TEXT REFERENCES regra (id) ON DELETE SET NULL,
    item_id     TEXT REFERENCES item (id) ON DELETE CASCADE,
    chave       TEXT NOT NULL UNIQUE,
    titulo      TEXT NOT NULL,
    corpo       TEXT NOT NULL,
    criada_em   TEXT NOT NULL,
    entregue_em TEXT
);

CREATE INDEX notificacao_pendente ON notificacao (entregue_em);
