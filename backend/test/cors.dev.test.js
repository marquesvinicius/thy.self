import assert from 'node:assert/strict';
import test from 'node:test';

// Desenvolvimento: o Next pode servir em localhost, 127.0.0.1 ou IP de rede,
// então qualquer origem é aceita. (Produção: ver cors.test.js.)
process.env.NODE_ENV = 'development';
process.env.ALLOWED_ORIGINS = '';
process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const { corsOptions } = await import('../src/config/cors.js');

test('em desenvolvimento qualquer origem é aceita', () => {
  let outcome;
  corsOptions.origin('http://100.64.0.7:3001', (err, allowed) => { outcome = { err, allowed }; });
  assert.deepEqual(outcome, { err: null, allowed: true });
});
