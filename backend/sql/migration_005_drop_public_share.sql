-- Migration 005 — Remove public share columns (RF008 revogado)
--
-- A feature de publicação opt-in por link (RF008) foi removida do escopo.
-- Migration 005 original nunca deve ser reaplicada.
-- Este script remove as colunas adicionadas por ela.
--
-- SEGURO rodar mesmo se as colunas não existirem (IF EXISTS).
-- Execute no Supabase: SQL Editor → cole e rode.

ALTER TABLE results
  DROP COLUMN IF EXISTS is_public,
  DROP COLUMN IF EXISTS public_token,
  DROP COLUMN IF EXISTS published_at;

-- Remove o índice único gerado pelo token (se existir).
DROP INDEX IF EXISTS results_public_token_key;
DROP INDEX IF EXISTS idx_results_public_token;
