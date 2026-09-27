import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

// Requer `--experimental-test-module-mocks` (já incluso no npm test).
// O cliente Supabase e a configuração são trocados por dublês controláveis:
// o objetivo é exercitar os ramos do health check sem depender da rede.

const envFixture = { supabaseUrl: 'https://abc123.supabase.co' };

// Cada teste define o que a consulta `head` do Supabase devolve (ou lança).
let probeBehavior = async () => ({ error: null });
const probeCalls = { signals: [] };

mock.module('../src/config/environment.js', {
  namedExports: { env: envFixture },
});

mock.module('../src/config/supabase.js', {
  namedExports: {
    supabase: {
      from() {
        return {
          select() {
            return {
              abortSignal(signal) {
                probeCalls.signals.push(signal);
                return probeBehavior();
              },
            };
          },
        };
      },
    },
  },
});

const {
  classifySupabaseFailure,
  checkSupabaseHealth,
  describeSupabaseRuntimeFailure,
} = await import('../src/services/supabase-health.service.js');

// ------------------------------------------------------------------
// classifySupabaseFailure — mapeamento puro de erro → código + dica
// ------------------------------------------------------------------

test('classifySupabaseFailure maps fetch failed to unreachable/paused hint', () => {
  const result = classifySupabaseFailure(new TypeError('fetch failed'));
  assert.equal(result.code, 'SUPABASE_UNREACHABLE');
  assert.match(result.hint, /pausado/i);
});

test('classifySupabaseFailure maps connection refused cause codes', () => {
  const err = new Error('connect error');
  err.cause = { code: 'ECONNREFUSED' };
  const result = classifySupabaseFailure(err);
  assert.equal(result.code, 'SUPABASE_UNREACHABLE');
});

test('classifySupabaseFailure maps DNS failure codes (projeto pausado some do DNS)', () => {
  // Caso real observado: projeto pausado no free tier some do DNS (ENOTFOUND).
  const result = classifySupabaseFailure({ message: 'getaddrinfo', code: 'enotfound' });
  assert.equal(result.code, 'SUPABASE_UNREACHABLE');
});

test('classifySupabaseFailure maps Cloudflare origin errors (521-523) to unreachable', () => {
  for (const status of [521, 522, 523]) {
    const result = classifySupabaseFailure({ message: 'origin down', status });
    assert.equal(result.code, 'SUPABASE_UNREACHABLE', `status ${status}`);
  }
});

test('classifySupabaseFailure maps auth failures', () => {
  const result = classifySupabaseFailure({ message: 'Invalid API key', status: 401 });
  assert.equal(result.code, 'SUPABASE_AUTH');
  assert.match(result.hint, /SERVICE_ROLE_KEY/i);
});

test('classifySupabaseFailure maps 403 and JWT messages to auth, via statusCode too', () => {
  assert.equal(classifySupabaseFailure({ message: 'forbidden', statusCode: 403 }).code, 'SUPABASE_AUTH');
  assert.equal(classifySupabaseFailure(new Error('JWT expired')).code, 'SUPABASE_AUTH');
});

test('classifySupabaseFailure checks reachability before auth', () => {
  // Uma mensagem com "jwt" mas causa de rede é problema de rede, não de credencial.
  const err = new Error('jwt verification: fetch failed');
  assert.equal(classifySupabaseFailure(err).code, 'SUPABASE_UNREACHABLE');
});

test('classifySupabaseFailure falls back to generic SUPABASE_ERROR', () => {
  const result = classifySupabaseFailure(new Error('relation "questions" does not exist'));
  assert.equal(result.code, 'SUPABASE_ERROR');
  assert.match(result.hint, /relation "questions" does not exist/);
});

test('classifySupabaseFailure tolerates non-Error inputs', () => {
  assert.equal(classifySupabaseFailure(undefined).code, 'SUPABASE_ERROR');
  assert.equal(classifySupabaseFailure('fetch failed').code, 'SUPABASE_UNREACHABLE');
  assert.match(classifySupabaseFailure(null).hint, /erro desconhecido/);
});

test('classifySupabaseFailure returns independent objects (callers may mutate)', () => {
  const a = classifySupabaseFailure(new Error('fetch failed'));
  a.hint = 'mutado';
  const b = classifySupabaseFailure(new Error('fetch failed'));
  assert.notEqual(b.hint, 'mutado');
});

// ------------------------------------------------------------------
// checkSupabaseHealth — sonda usada pelo /health e pelo startup
// ------------------------------------------------------------------

test('checkSupabaseHealth reports ok with host and latency when the probe succeeds', async () => {
  envFixture.supabaseUrl = 'https://abc123.supabase.co';
  probeBehavior = async () => ({ error: null });

  const result = await checkSupabaseHealth();

  assert.equal(result.status, 'ok');
  assert.equal(result.host, 'abc123.supabase.co');
  assert.equal(typeof result.latency_ms, 'number');
  assert.ok(result.latency_ms >= 0);
  assert.equal(result.code, undefined);
});

test('checkSupabaseHealth passes an abort signal so a hung probe can time out', async () => {
  probeCalls.signals.length = 0;
  probeBehavior = async () => ({ error: null });

  await checkSupabaseHealth({ timeoutMs: 50 });

  assert.equal(probeCalls.signals.length, 1);
  assert.ok(probeCalls.signals[0] instanceof AbortSignal);
});

test('checkSupabaseHealth aborts the probe after timeoutMs', async () => {
  probeCalls.signals.length = 0;
  // Sonda que só termina quando é abortada — simula o Supabase travado.
  probeBehavior = () => new Promise((_, reject) => {
    const signal = probeCalls.signals.at(-1);
    signal.addEventListener('abort', () => reject(new Error('This operation was aborted: timeout')));
  });

  const result = await checkSupabaseHealth({ timeoutMs: 20 });

  assert.equal(result.status, 'error');
  assert.equal(result.code, 'SUPABASE_UNREACHABLE');
  assert.match(result.detail, /aborted/);
});

test('checkSupabaseHealth classifies an error returned by the client', async () => {
  probeBehavior = async () => ({ error: { message: 'Invalid API key', status: 401 } });

  const result = await checkSupabaseHealth();

  assert.equal(result.status, 'error');
  assert.equal(result.code, 'SUPABASE_AUTH');
  assert.equal(result.detail, 'Invalid API key');
  assert.equal(result.host, 'abc123.supabase.co');
});

test('checkSupabaseHealth classifies an exception thrown by the client (never throws)', async () => {
  probeBehavior = async () => { throw new TypeError('fetch failed'); };

  const result = await checkSupabaseHealth();

  assert.equal(result.status, 'error');
  assert.equal(result.code, 'SUPABASE_UNREACHABLE');
  assert.equal(result.detail, 'fetch failed');
});

test('checkSupabaseHealth stringifies non-Error throws in detail', async () => {
  probeBehavior = async () => { throw 'boom'; };

  const result = await checkSupabaseHealth();

  assert.equal(result.status, 'error');
  assert.equal(result.detail, 'boom');
});

test('checkSupabaseHealth reports a config error for an unparseable SUPABASE_URL', async () => {
  envFixture.supabaseUrl = 'isso não é uma url';

  const result = await checkSupabaseHealth();

  assert.equal(result.status, 'error');
  assert.equal(result.code, 'SUPABASE_CONFIG');
  assert.equal(result.host, null);
  assert.equal(result.latency_ms, null);
  assert.equal(result.detail, 'unparseable URL');
  envFixture.supabaseUrl = 'https://abc123.supabase.co';
});

test('checkSupabaseHealth reports a missing SUPABASE_URL distinctly', async () => {
  envFixture.supabaseUrl = '';

  const result = await checkSupabaseHealth();

  assert.equal(result.code, 'SUPABASE_CONFIG');
  assert.equal(result.detail, 'missing URL');
  envFixture.supabaseUrl = 'https://abc123.supabase.co';
});

// ------------------------------------------------------------------
// describeSupabaseRuntimeFailure — payload para o errorHandler
// ------------------------------------------------------------------

test('describeSupabaseRuntimeFailure maps to a 503 with the classified code and hint', () => {
  const result = describeSupabaseRuntimeFailure(new TypeError('fetch failed'));

  assert.equal(result.statusCode, 503);
  assert.equal(result.code, 'SUPABASE_UNREACHABLE');
  assert.match(result.message, /pausado/i);
  assert.equal(result.detail, 'fetch failed');
});

test('describeSupabaseRuntimeFailure stringifies non-Error inputs', () => {
  const result = describeSupabaseRuntimeFailure('falha crua');
  assert.equal(result.detail, 'falha crua');
  assert.equal(result.code, 'SUPABASE_ERROR');
});
