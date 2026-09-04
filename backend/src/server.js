import { env } from './config/environment.js';
import app from './app.js';
import { checkSupabaseHealth } from './services/supabase-health.service.js';
import { logger } from './utils/logger.js';

async function logDependencyHealth() {
  const supabase = await checkSupabaseHealth();

  if (supabase.status === 'ok') {
    logger.info('Supabase connectivity OK', {
      host: supabase.host,
      latency_ms: supabase.latency_ms,
    });
    return;
  }

  logger.error('Supabase connectivity FAILED at startup', {
    host: supabase.host,
    code: supabase.code,
    latency_ms: supabase.latency_ms,
    detail: supabase.detail,
    hint: supabase.hint,
  });

  // Banner human-readable — JSON logger escapes newlines; keep this visible in the terminal.
  const banner = '─'.repeat(72);
  console.error(`\n${banner}`);
  console.error('[STARTUP] Dependência crítica indisponível: Supabase');
  console.error(`host: ${supabase.host || 'desconhecido'}`);
  console.error(`code: ${supabase.code}`);
  if (supabase.detail) console.error(`detail: ${supabase.detail}`);
  console.error(`hint: ${supabase.hint}`);
  console.error(banner);
  console.error(
    'O servidor HTTP subiu, mas rotas que usam o banco vão falhar até o Supabase voltar.\n'
  );
}

app.listen(env.port, () => {
  logger.info(`thy.self backend running on port ${env.port}`, {
    environment: env.nodeEnv,
  });

  // Non-blocking: never delay listen() on a paused free-tier project.
  logDependencyHealth().catch((err) => {
    logger.error('Startup health check crashed', { error: err.message });
  });
});
