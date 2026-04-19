-- Destructive reset for the Dual-Core pivot.
-- Wipes session data and the authorial question pool so the new seed can repopulate
-- with 30 BFI-2-S objective items + authorial interpretative items.
--
-- `question_categories` is preserved (slugs are referenced by the seed).
-- `archetypes` is preserved (independent, seeded via scripts/etl).

TRUNCATE results, answers, alternatives, questions, sessions
  RESTART IDENTITY CASCADE;
