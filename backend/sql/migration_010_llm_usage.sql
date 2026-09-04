-- ============================================================
-- migration_010_llm_usage.sql
--
-- Persiste os contadores de uso do LLM, que antes viviam apenas em
-- memória no processo Node (`llm-limiter.js`). O efeito prático do
-- estado em memória era que **qualquer restart do servidor zerava as
-- proteções**: o orçamento diário voltava a zero e o teto de
-- regenerações por sessão (RF005) deixava de valer.
--
-- Idempotente: pode ser reaplicada sem efeito colateral.
-- ============================================================

-- Orçamento diário de chamadas ao LLM.
CREATE TABLE IF NOT EXISTS llm_daily_usage (
  day        DATE PRIMARY KEY,
  call_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Teto de regenerações por sessão: mora junto do resultado, que já é
-- 1:1 com a sessão e já é apagado em cascata com ela.
ALTER TABLE results
  ADD COLUMN IF NOT EXISTS regen_count INTEGER NOT NULL DEFAULT 0;

-- Incremento atômico do contador diário (evita corrida entre requisições
-- concorrentes, que um read-modify-write no Node não evitaria).
-- Devolve o total já incrementado.
CREATE OR REPLACE FUNCTION increment_llm_daily_usage()
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  INSERT INTO llm_daily_usage (day, call_count, updated_at)
  VALUES (CURRENT_DATE, 1, NOW())
  ON CONFLICT (day) DO UPDATE
    SET call_count = llm_daily_usage.call_count + 1,
        updated_at = NOW()
  RETURNING call_count INTO new_count;

  RETURN new_count;
END;
$$ LANGUAGE plpgsql;

-- Incremento atômico do contador de regeneração de uma sessão.
-- Devolve 0 quando a sessão ainda não tem resultado calculado.
CREATE OR REPLACE FUNCTION increment_session_regen(p_session_id UUID)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE results
     SET regen_count = regen_count + 1
   WHERE session_id = p_session_id
  RETURNING regen_count INTO new_count;

  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql;
