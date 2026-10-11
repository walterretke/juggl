-- Migration 5: tela Meu dia.

-- Quando, no dia, você pretende fazer um item escolhido para hoje
-- (manha, depois_daily, tarde, fim_dia). Sem horário rígido, só o momento aproximado.
ALTER TABLE item ADD COLUMN quando TEXT;

-- "Ritual da manhã" passou a se chamar "Planejar o dia": a regra pronta acompanha.
UPDATE regra SET nome = 'Dia não planejado' WHERE id = 'ritual_pendente' AND nome = 'Ritual pendente';
