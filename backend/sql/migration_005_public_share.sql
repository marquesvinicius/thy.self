-- Migration 005: Public share for results
--
-- Allows the user (result owner) to explicitly publish their result as a
-- read-only page accessible by a URL-safe token, decoupling the public
-- identity from the `session_id` (which is also the auth token used to
-- submit answers — MUST NOT be reused for sharing).
--
-- Invariants:
--   * `public_token` is generated once, immutable per result.
--   * Publication is opt-in: `is_public` defaults to FALSE; flipping it
--     to TRUE is a deliberate user action (POST /result/:sid/share).
--   * A result can be un-published later by flipping the flag back — the
--     token itself is preserved so the same URL can be revived.

-- pgcrypto is already enabled on Supabase projects, but keep the guard.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE results
  ADD COLUMN IF NOT EXISTS public_token UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS is_public    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE results
  DROP CONSTRAINT IF EXISTS results_public_token_key,
  ADD  CONSTRAINT results_public_token_key UNIQUE (public_token);

-- Fast lookup when serving the public page. Filtered index: we only ever
-- query for rows that are currently public, which keeps the index tiny
-- regardless of how many private results accumulate.
CREATE INDEX IF NOT EXISTS idx_results_public_token_active
  ON results (public_token)
  WHERE is_public = TRUE;
