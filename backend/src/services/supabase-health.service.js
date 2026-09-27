import { env } from '../config/environment.js';
import { supabase } from '../config/supabase.js';

const DEFAULT_TIMEOUT_MS = 6000;

// Sinais de falha de rede. Ficam em listas (e não numa cadeia de `||`) para a
// função de classificação ter complexidade baixa: antes eram 31 ramos, acima
// do limite do gate de CRAP, sem nenhum ganho de legibilidade.
const NETWORK_MESSAGE_HINTS = [
  'fetch failed', 'network', 'econnrefused', 'enotfound', 'etimedout', 'timeout', 'socket',
];
const NETWORK_CAUSE_CODES = [
  'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET',
];
// 521–523: erros do Cloudflare na frente do Supabase quando a origem não responde.
const UNREACHABLE_STATUSES = [521, 522, 523];

const AUTH_MESSAGE_HINTS = ['jwt', 'invalid api key', 'invalid authentication'];
const AUTH_STATUSES = [401, 403];

const UNREACHABLE = {
  code: 'SUPABASE_UNREACHABLE',
  hint:
    'Não foi possível alcançar o Supabase. Causas comuns: projeto pausado no dashboard (free tier), VPN/firewall ou SUPABASE_URL incorreta. Reative o projeto em https://supabase.com/dashboard e reinicie o backend.',
};

const AUTH = {
  code: 'SUPABASE_AUTH',
  hint:
    'Credenciais rejeitadas pelo Supabase. Confira SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no backend/.env.',
};

function mentionsAny(message, hints) {
  return hints.some(hint => message.includes(hint));
}

/**
 * Classifies a Supabase/network failure into a stable code + actionable hint.
 * Kept pure so tests can cover the mapping without hitting the network.
 *
 * @param {unknown} err
 * @returns {{ code: string, hint: string }}
 */
export function classifySupabaseFailure(err) {
  const message = `${err?.message || err || ''}`.toLowerCase();
  const causeCode = `${err?.cause?.code || err?.code || ''}`.toUpperCase();
  const status = Number(err?.status || err?.statusCode || 0);

  const unreachable =
    mentionsAny(message, NETWORK_MESSAGE_HINTS)
    || NETWORK_CAUSE_CODES.includes(causeCode)
    || UNREACHABLE_STATUSES.includes(status);
  if (unreachable) return { ...UNREACHABLE };

  if (AUTH_STATUSES.includes(status) || mentionsAny(message, AUTH_MESSAGE_HINTS)) {
    return { ...AUTH };
  }

  return {
    code: 'SUPABASE_ERROR',
    hint: `Falha ao consultar o Supabase: ${err?.message || 'erro desconhecido'}.`,
  };
}

/**
 * Lightweight connectivity probe against Supabase (head select on questions).
 * Does not throw — returns a structured dependency status for /health and startup logs.
 *
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{
 *   status: 'ok' | 'error',
 *   latency_ms: number | null,
 *   host: string | null,
 *   code?: string,
 *   hint?: string,
 *   detail?: string,
 * }>}
 */
export async function checkSupabaseHealth(options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const started = Date.now();

  let host;
  try {
    host = new URL(env.supabaseUrl).hostname;
  } catch {
    return {
      status: 'error',
      latency_ms: null,
      host: null,
      code: 'SUPABASE_CONFIG',
      hint: 'SUPABASE_URL inválida no backend/.env.',
      detail: env.supabaseUrl ? 'unparseable URL' : 'missing URL',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // head:true avoids transferring rows — enough to prove Auth + PostgREST are up.
    const { error } = await supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .abortSignal(controller.signal);

    if (error) {
      const classified = classifySupabaseFailure(error);
      return {
        status: 'error',
        latency_ms: Date.now() - started,
        host,
        code: classified.code,
        hint: classified.hint,
        detail: error.message,
      };
    }

    return {
      status: 'ok',
      latency_ms: Date.now() - started,
      host,
    };
  } catch (err) {
    const classified = classifySupabaseFailure(err);
    return {
      status: 'error',
      latency_ms: Date.now() - started,
      host,
      code: classified.code,
      hint: classified.hint,
      detail: err?.message || String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Maps raw errors (often opaque "fetch failed") into an AppError-friendly payload
 * for request handlers and the global error middleware.
 */
export function describeSupabaseRuntimeFailure(err) {
  const classified = classifySupabaseFailure(err);
  return {
    message: classified.hint,
    statusCode: 503,
    code: classified.code,
    detail: err?.message || String(err),
  };
}
