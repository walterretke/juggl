-- Migration 7: feedback do primeiro dia de uso.

-- Onde a tarefa estava antes de ser concluída ou arquivada (inbox, a_fazer, aguardando...),
-- para "Restaurar" devolver ao lugar certo. Vazio nas antigas: voltam para A fazer.
ALTER TABLE item ADD COLUMN status_anterior TEXT;
