-- Destructive reset for the Dual-Core pivot.
-- Wipes session data and the authorial question pool so the new seed can repopulate
-- with 30 BFI-2-S objective items + authorial interpretative items.
--
-- `question_categories` is preserved (slugs are referenced by the seed).
-- `archetypes` is preserved (independent, seeded via scripts/etl).

TRUNCATE results, answers, alternatives, questions, sessions
  RESTART IDENTITY CASCADE;

-- ─── Incremental cleanup (sem TRUNCATE) ──────────────────────────────────────
-- Se preferir NÃO truncar tudo (ex: ambiente com usuários reais), rode apenas
-- este bloco para zerar o impacto numérico das alternativas interpretativas.
-- Após o TRUNCATE acima + reseed, este UPDATE é desnecessário (o seed já
-- insere com impact_* = 0 explicitamente).
--
-- UPDATE alternatives
-- SET impact_o = 0, impact_c = 0, impact_e = 0, impact_a = 0, impact_n = 0
-- WHERE question_id IN (SELECT id FROM questions WHERE kind = 'interpretative');
