-- Manutenção (one-shot): deduplicação de perguntas interpretativas
--
-- Contexto: até esta correção, `seedInterpretative()` usava INSERT puro —
-- cada `npm run seed` duplicava as 28 perguntas interpretativas. O seed agora
-- faz upsert por `external_id` (INT_MD_01, INT_PX_01, …), mas linhas antigas
-- criadas pelo seed legado ficaram com external_id = NULL.
--
-- Ordem de execução:
--   1. Rode `npm run seed` (novo) UMA vez — cria/atualiza as 28 canônicas
--      com external_id preenchido.
--   2. Rode este script no Supabase SQL Editor.
--
-- Segurança: `answers.question_id` NÃO tem ON DELETE CASCADE, então perguntas
-- legadas que já receberam respostas não podem ser apagadas — elas são apenas
-- desativadas (is_active = false) e param de ser servidas pelo picker.
-- As alternatives das apagadas caem via ON DELETE CASCADE.

-- 1) Apaga interpretativas legadas (sem external_id) que nunca foram respondidas.
DELETE FROM questions q
WHERE q.kind = 'interpretative'
  AND q.external_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM answers a WHERE a.question_id = q.id);

-- 2) Desativa as legadas restantes (com respostas) — preserva histórico,
--    remove do pool de perguntas servidas.
UPDATE questions
SET is_active = false
WHERE kind = 'interpretative'
  AND external_id IS NULL;

-- 3) Conferência: deve retornar exatamente 28 linhas ativas, todas com external_id.
SELECT external_id, LEFT(text, 60) AS text_preview
FROM questions
WHERE kind = 'interpretative' AND is_active = true
ORDER BY external_id;
