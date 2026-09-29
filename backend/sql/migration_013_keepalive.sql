-- migration_013 — Manter o servidor do Render acordado no plano gratuito
--
-- No plano gratuito, o Render desliga o servidor depois de 15 minutos sem
-- receber acesso, e o próximo visitante espera cerca de um minuto. Aqui o
-- próprio banco chama o servidor a cada 10 minutos (folga de 5 minutos para
-- qualquer atraso), com pg_cron + pg_net, ambos disponíveis no Supabase.
--
-- Custo: zero. O plano gratuito do Render dá 750 horas por mês por conta, e
-- um mês tem no máximo 744 horas, então o servidor pode ficar ligado o mês
-- inteiro, desde que seja o ÚNICO serviço gratuito da conta no Render.
--
-- A chamada usa /health?deep=1: além de acordar o servidor, faz o servidor
-- consultar o banco, o que também conta como atividade para o Supabase.
--
-- ANTES DE RODAR: troque a URL abaixo pela URL real do serviço no Render
-- (painel do Render > thyself-api > endereço no topo).
-- Aplicar no SQL Editor do Supabase, depois da migration_012.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove um agendamento anterior com o mesmo nome, para a migração poder ser
-- rodada de novo (por exemplo, depois de trocar a URL).
SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname = 'thyself-keepalive';

SELECT cron.schedule(
  'thyself-keepalive',
  '*/10 * * * *',
  $$SELECT net.http_get(
      url := 'https://thyself-api.onrender.com/health?deep=1',
      timeout_milliseconds := 60000
    );$$
);

-- Para conferir depois de uns 20 minutos:
--   SELECT status_code, created FROM net._http_response ORDER BY created DESC LIMIT 5;
--   (200 = servidor respondeu; o pg_net guarda as respostas por 6 horas)
-- Para desligar:
--   SELECT cron.unschedule('thyself-keepalive');
