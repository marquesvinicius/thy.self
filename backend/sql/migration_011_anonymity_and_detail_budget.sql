-- ============================================================
-- migration_011_anonymity_and_detail_budget.sql
--
-- Duas mudanças independentes, agrupadas por serem ambas pequenas e
-- ambas derivadas da auditoria de setembro/2026:
--
-- 1. REMOÇÃO DE `sessions.nickname` (RNF012).
--    O RNF012 afirma que "não existem campos de identificação pessoal no
--    modelo de dados" e que o anonimato é estrutural, não dependente de
--    consentimento ou opt-out. A coluna `nickname` contradizia essa
--    afirmação na letra: era o único campo de texto livre da sessão e
--    aceitava até 100 caracteres. Na prática nunca foi coletada — o
--    frontend chama `createSession()` sem argumento desde sempre —, mas
--    um campo que existe é um campo que pode ser preenchido. Removê-lo
--    torna o anonimato uma propriedade do schema, verificável por
--    inspeção, e não uma promessa da camada de aplicação.
--
-- 2. TETO DE DETALHAMENTOS POR SESSÃO (RF005).
--    `POST /interpret/reference-detail` também gasta uma chamada ao LLM,
--    mas só era limitado pelo orçamento diário global — uma única sessão
--    podia esgotar o dia inteiro. Espelha o desenho de `regen_count`
--    introduzido na migration_010.
--
-- Idempotente: pode ser reaplicada sem efeito colateral.
-- ============================================================

-- 1. Anonimato estrutural ------------------------------------------------
ALTER TABLE sessions
  DROP COLUMN IF EXISTS nickname;

-- 2. Orçamento de detalhamento por sessão --------------------------------
ALTER TABLE results
  ADD COLUMN IF NOT EXISTS detail_count INTEGER NOT NULL DEFAULT 0;

-- Incremento atômico do contador de detalhamento de uma sessão.
-- Devolve 0 quando a sessão ainda não tem resultado calculado.
CREATE OR REPLACE FUNCTION increment_session_detail(p_session_id UUID)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE results
     SET detail_count = detail_count + 1
   WHERE session_id = p_session_id
  RETURNING detail_count INTO new_count;

  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql;
