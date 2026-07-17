-- Migration 007 — Alternativas idempotentes por chave natural
--
-- Bug corrigido: o seed fazia DELETE + INSERT das alternativas, mas
-- `answers.alternative_id` referencia `alternatives(id)` SEM cascade.
-- Quando a pergunta já tinha respostas, o DELETE falhava silenciosamente
-- e o INSERT adicionava 5 cópias novas — itens BFI-2-S acumulavam 10+
-- alternativas (labels Likert duplicados na tela do quiz).
--
-- Correção em 3 passos:
--   1. Remapeia respostas que apontam para cópias duplicadas → cópia canônica
--      (menor id por question_id + sort_order; as cópias são idênticas em
--      texto e impactos, então o remapeamento é semanticamente neutro).
--   2. Apaga as cópias não-canônicas.
--   3. Cria UNIQUE (question_id, sort_order) — habilita o upsert idempotente
--      do seed e impede a reintrodução de duplicatas.
--
-- Execute no Supabase ANTES de rodar `npm run seed` (o seed novo usa
-- ON CONFLICT (question_id, sort_order), que exige esta constraint).

-- 1) Remapear respostas para a alternativa canônica
UPDATE answers a
SET alternative_id = canon.id
FROM alternatives dup
JOIN LATERAL (
  SELECT MIN(id) AS id
  FROM alternatives c
  WHERE c.question_id = dup.question_id
    AND c.sort_order = dup.sort_order
) canon ON true
WHERE a.alternative_id = dup.id
  AND dup.id <> canon.id;

-- 2) Apagar duplicatas (mantém a menor id por question_id + sort_order)
DELETE FROM alternatives dup
USING (
  SELECT MIN(id) AS keep_id, question_id, sort_order
  FROM alternatives
  GROUP BY question_id, sort_order
) canon
WHERE dup.question_id = canon.question_id
  AND dup.sort_order = canon.sort_order
  AND dup.id <> canon.keep_id;

-- 3) Chave natural para upsert idempotente
ALTER TABLE alternatives
  DROP CONSTRAINT IF EXISTS alternatives_question_sort_key,
  ADD  CONSTRAINT alternatives_question_sort_key UNIQUE (question_id, sort_order);

-- Conferência: todo item objetivo deve ter exatamente 5 alternativas.
SELECT q.external_id, COUNT(a.id) AS n_alternatives
FROM questions q
JOIN alternatives a ON a.question_id = q.id
WHERE q.kind = 'objective'
GROUP BY q.external_id
HAVING COUNT(a.id) <> 5
ORDER BY q.external_id;
