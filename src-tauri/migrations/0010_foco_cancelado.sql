-- Migration 10: evento foco_cancelado.
-- Cancelar o foco grava um evento foco_cancelado (a sessão não entra nas horas), mas o CHECK
-- de evento.tipo da migration 1 só aceitava os tipos de então. O SQLite não altera CHECK,
-- então a tabela é recriada com os mesmos dados. Nada referencia evento, então trocar a
-- tabela não apaga nada em cascata.

CREATE TABLE evento_novo (
    id        TEXT PRIMARY KEY,
    item_id   TEXT NOT NULL REFERENCES item (id) ON DELETE CASCADE,
    tipo      TEXT NOT NULL
              CHECK (tipo IN ('criado', 'cobrado', 'foco_inicio', 'foco_fim', 'foco_cancelado', 'prazo_alterado', 'alerta_ignorado', 'concluido')),
    timestamp TEXT NOT NULL,
    dados     TEXT -- JSON
);

INSERT INTO evento_novo (id, item_id, tipo, timestamp, dados)
SELECT id, item_id, tipo, timestamp, dados FROM evento;

DROP TABLE evento;
ALTER TABLE evento_novo RENAME TO evento;

CREATE INDEX evento_item ON evento (item_id, timestamp);
