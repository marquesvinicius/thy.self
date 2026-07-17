-- Migration 006 — Limpeza de infraestrutura morta
--
-- 1) `rank_position` e `slider_value` (adicionadas na migration_002) nunca
--    foram consumidas: nenhum widget de slider/ranking existe no frontend e
--    nenhum item do seed usa esses tipos. A cadeia answer (controller →
--    service → query) foi limpa no código; este script remove as colunas.
--    `answer_type` e `user_observation` permanecem — são usados pelos
--    widgets binary/reflection.
--
-- Execute no Supabase: SQL Editor → cole e rode.
-- SEGURO rodar mesmo se as colunas não existirem (IF EXISTS).

ALTER TABLE answers
  DROP COLUMN IF EXISTS rank_position,
  DROP COLUMN IF EXISTS slider_value;
