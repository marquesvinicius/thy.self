-- migration_012 — Retenção e descarte de dados (RN016)
--
-- As sessões são anônimas, mas o campo de texto livre das perguntas narrativas
-- (answers.user_observation) pode receber qualquer coisa que a pessoa digite.
-- Guardar tudo para sempre não tem justificativa; esta migração define prazos:
--   * sessão não concluída: apagada 30 dias após a criação;
--   * sessão concluída: apagada 12 meses após a conclusão.
-- Respostas e resultado saem junto, pelo ON DELETE CASCADE de answers e results.
-- O contador diário de uso da IA (llm_daily_usage) não tem dado de pessoa, mas
-- também não precisa de histórico longo: fica 12 meses.
--
-- Aplicar no SQL Editor do Supabase, depois da migration_011.

CREATE OR REPLACE FUNCTION purge_expired_data()
RETURNS TABLE (sessoes_nao_concluidas INTEGER, sessoes_concluidas INTEGER, dias_de_uso_ia INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_active INTEGER;
  n_done INTEGER;
  n_usage INTEGER;
BEGIN
  DELETE FROM sessions
   WHERE status <> 'completed'
     AND created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS n_active = ROW_COUNT;

  DELETE FROM sessions
   WHERE status = 'completed'
     AND COALESCE(completed_at, created_at) < NOW() - INTERVAL '12 months';
  GET DIAGNOSTICS n_done = ROW_COUNT;

  DELETE FROM llm_daily_usage
   WHERE day < (NOW() - INTERVAL '12 months')::date;
  GET DIAGNOSTICS n_usage = ROW_COUNT;

  RETURN QUERY SELECT n_active, n_done, n_usage;
END;
$$;

-- Só o banco (e quem tem a service role) pode rodar o descarte.
REVOKE ALL ON FUNCTION purge_expired_data() FROM PUBLIC, anon, authenticated;

-- Agendamento diário às 03:00 (UTC) com pg_cron, disponível no Supabase.
-- Se a extensão não estiver habilitada, habilite em Database > Extensions > pg_cron
-- ou rode a linha abaixo.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'thyself-purge-expired-data',
  '0 3 * * *',
  $$SELECT purge_expired_data();$$
);
