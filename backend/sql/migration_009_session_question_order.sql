-- Congela a ordem de perguntas no momento em que a sessão é criada.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS question_order INTEGER[];

CREATE INDEX IF NOT EXISTS idx_sessions_question_order
  ON sessions USING GIN (question_order);
