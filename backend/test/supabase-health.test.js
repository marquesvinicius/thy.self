import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const { classifySupabaseFailure } = await import('../src/services/supabase-health.service.js');

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

test('classifySupabaseFailure maps auth failures', () => {
  const result = classifySupabaseFailure({ message: 'Invalid API key', status: 401 });
  assert.equal(result.code, 'SUPABASE_AUTH');
  assert.match(result.hint, /SERVICE_ROLE_KEY/i);
});

test('classifySupabaseFailure falls back to generic SUPABASE_ERROR', () => {
  const result = classifySupabaseFailure(new Error('relation "questions" does not exist'));
  assert.equal(result.code, 'SUPABASE_ERROR');
});
