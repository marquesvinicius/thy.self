import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';

const { logger } = await import('../src/utils/logger.js');

afterEach(() => mock.restoreAll());

test('RNF015: cada entrada de log é uma linha JSON com horário, nível, mensagem e metadados', () => {
  const out = mock.method(console, 'log', () => {});
  logger.info('GET /api/v1/questions', { query: { session_id: 's' } });

  const entry = JSON.parse(out.mock.calls[0].arguments[0]);
  assert.equal(entry.level, 'info');
  assert.equal(entry.message, 'GET /api/v1/questions');
  assert.deepEqual(entry.query, { session_id: 's' });
  assert.ok(!Number.isNaN(Date.parse(entry.timestamp)));
});

test('erros vão para stderr; os demais níveis para stdout', () => {
  const out = mock.method(console, 'log', () => {});
  const err = mock.method(console, 'error', () => {});

  logger.error('falhou');
  logger.warn('cuidado');
  logger.debug('detalhe');

  assert.equal(err.mock.callCount(), 1);
  assert.equal(JSON.parse(err.mock.calls[0].arguments[0]).level, 'error');
  assert.deepEqual(out.mock.calls.map(c => JSON.parse(c.arguments[0]).level), ['warn', 'debug']);
});
