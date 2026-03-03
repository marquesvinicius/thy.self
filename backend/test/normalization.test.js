import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const { normalizeScore, classifyScore } = await import('../src/engine/normalization.js');

test('normalizeScore returns 50 for neutral raw score', () => {
  const score = normalizeScore(0, 10);
  assert.equal(score, 50);
});

test('normalizeScore maps theoretical bounds to 0 and 100', () => {
  assert.equal(normalizeScore(-30, 10), 0);
  assert.equal(normalizeScore(30, 10), 100);
});

test('normalizeScore clamps out-of-range inputs', () => {
  assert.equal(normalizeScore(999, 10), 100);
  assert.equal(normalizeScore(-999, 10), 0);
});

test('normalizeScore returns 50 when answerCount is zero', () => {
  assert.equal(normalizeScore(5, 0), 50);
});

test('classifyScore classifies threshold ranges correctly', () => {
  assert.equal(classifyScore(0), 'muito_baixo');
  assert.equal(classifyScore(19.9), 'muito_baixo');
  assert.equal(classifyScore(20), 'baixo');
  assert.equal(classifyScore(39.9), 'baixo');
  assert.equal(classifyScore(40), 'moderado');
  assert.equal(classifyScore(59.9), 'moderado');
  assert.equal(classifyScore(60), 'alto');
  assert.equal(classifyScore(79.9), 'alto');
  assert.equal(classifyScore(80), 'muito_alto');
});
