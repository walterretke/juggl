-- Migration 8: tarefas mais completas, agenda e anexos.

-- Checklist de subtarefas dentro de uma tarefa.
CREATE TABLE subtarefa (
    id        TEXT PRIMARY KEY,
    item_id   TEXT NOT NULL REFERENCES item (id) ON DELETE CASCADE,
    texto     TEXT NOT NULL,
    feita     INTEGER NOT NULL DEFAULT 0,
    ordem     INTEGER NOT NULL,
    criado_em TEXT NOT NULL
);

CREATE INDEX subtarefa_item ON subtarefa (item_id, ordem);

-- Horário de uma tarefa na agenda (AAAA-MM-DDTHH:MM, hora local). Sem horário,
-- a tarefa aparece na área "sem horário" do dia do prazo ou do dia planejado.
ALTER TABLE item ADD COLUMN agenda_inicio TEXT;
ALTER TABLE item ADD COLUMN agenda_fim TEXT;

-- Compromissos da agenda (academia 18h às 19h, reunião semanal...), que podem repetir.
CREATE TABLE compromisso (
    id          TEXT PRIMARY KEY,
    titulo      TEXT NOT NULL,
    nota        TEXT,
    data        TEXT NOT NULL,          -- AAAA-MM-DD da primeira vez
    hora_inicio TEXT,                   -- HH:MM; vazio = sem horário
    hora_fim    TEXT,                   -- HH:MM
    repete      TEXT NOT NULL DEFAULT 'nao'
                CHECK (repete IN ('nao', 'diaria', 'dias_uteis', 'semanal', 'mensal')),
    dias_semana TEXT,                   -- semanal: dias separados por vírgula (0 = domingo)
    ate         TEXT,                   -- último dia em que repete (vazio = sem fim)
    excecoes    TEXT,                   -- dias pulados, AAAA-MM-DD separados por vírgula
    criado_em   TEXT NOT NULL
);

CREATE INDEX compromisso_data ON compromisso (data);

-- Anexos das tarefas. Imagens são convertidas para WebP e reduzidas; os outros
-- arquivos vão comprimidos com gzip quando isso economiza espaço. `dados` em base64.
CREATE TABLE anexo (
    id               TEXT PRIMARY KEY,
    item_id          TEXT NOT NULL REFERENCES item (id) ON DELETE CASCADE,
    nome             TEXT NOT NULL,
    tipo             TEXT NOT NULL,     -- tipo MIME do conteúdo guardado
    tamanho_original INTEGER NOT NULL,
    tamanho          INTEGER NOT NULL,  -- bytes guardados (antes do base64)
    compressao       TEXT NOT NULL CHECK (compressao IN ('nenhuma', 'gzip', 'imagem')),
    dados            TEXT NOT NULL,
    criado_em        TEXT NOT NULL
);

CREATE INDEX anexo_item ON anexo (item_id);
