import assert from 'node:assert/strict';
import test from 'node:test';

// Produção: env é lido no import, por isso o ambiente é fixado antes.
process.env.NODE_ENV = 'production';
process.env.ALLOWED_ORIGINS = 'https://thyself.app, https://www.thyself.app';
process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const { corsOptions } = await import('../src/config/cors.js');

function decide(origin) {
  let outcome;
  corsOptions.origin(origin, (err, allowed) => { outcome = { err, allowed }; });
  return outcome;
}

test('RNF009: em produção só origens configuradas são aceitas', () => {
  assert.deepEqual(decide('https://thyself.app'), { err: null, allowed: true });
  assert.deepEqual(decide('https://www.thyself.app'), { err: null, allowed: true });
});

test('requisição sem Origin (curl, servidor) é aceita', () => {
  assert.deepEqual(decide(undefined), { err: null, allowed: true });
});

test('origem não autorizada é recusada com 403 (e não 500)', () => {
  const { err } = decide('https://evil.example');
  assert.equal(err.statusCode, 403);
  assert.equal(err.code, 'CORS_FORBIDDEN');
});
