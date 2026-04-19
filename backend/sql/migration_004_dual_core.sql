-- Migration 004: Dual-Core Architecture
--
-- Separates questions into two mutually-exclusive layers:
--   * 'objective'      — validated BFI-2-S items (Soto & John, 2017). ONLY these feed the OCEAN calculation.
--                        Must declare `trait` (O/C/E/A/N) and `reverse_key` (direct vs. reverse-keyed Likert item).
--   * 'interpretative' — authorial items (moral dilemmas, paradoxes, interest probes). Do NOT influence the
--                        numeric score; used only as qualitative context for the LLM narrative.
--
-- Also adds `external_id` as a natural key for idempotent reseeds of the BFI-2-S pool.

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS kind        VARCHAR(20) NOT NULL DEFAULT 'interpretative',
  ADD COLUMN IF NOT EXISTS trait       CHAR(1),
  ADD COLUMN IF NOT EXISTS reverse_key BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_id VARCHAR(50);

ALTER TABLE questions
  DROP CONSTRAINT IF EXISTS questions_kind_check,
  ADD  CONSTRAINT questions_kind_check
    CHECK (kind IN ('objective', 'interpretative'));

ALTER TABLE questions
  DROP CONSTRAINT IF EXISTS questions_trait_check,
  ADD  CONSTRAINT questions_trait_check
    CHECK (trait IS NULL OR trait IN ('O', 'C', 'E', 'A', 'N'));

-- Cross-field consistency: objective items MUST declare a trait;
-- interpretative items MUST NOT declare trait or reverse_key.
ALTER TABLE questions
  DROP CONSTRAINT IF EXISTS questions_kind_trait_consistency,
  ADD  CONSTRAINT questions_kind_trait_consistency
    CHECK (
      (kind = 'objective'      AND trait IS NOT NULL) OR
      (kind = 'interpretative' AND trait IS NULL AND reverse_key = false)
    );

-- Natural key for idempotent reseed of BFI-2-S items.
-- NOTE: must be a real UNIQUE constraint (not a partial index), so that
-- PostgREST's `ON CONFLICT (external_id)` can match it. Postgres UNIQUE
-- already treats multiple NULLs as distinct, which is exactly what we want
-- for interpretative rows (they keep external_id = NULL).
DROP INDEX IF EXISTS idx_questions_external_id;

ALTER TABLE questions
  DROP CONSTRAINT IF EXISTS questions_external_id_key,
  ADD  CONSTRAINT questions_external_id_key UNIQUE (external_id);

CREATE INDEX IF NOT EXISTS idx_questions_kind  ON questions(kind);
CREATE INDEX IF NOT EXISTS idx_questions_trait ON questions(trait) WHERE trait IS NOT NULL;
