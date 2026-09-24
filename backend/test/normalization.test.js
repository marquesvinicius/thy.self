import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const { normalizeByTrait, classifyScore } = await import('../src/engine/normalization.js');

test('normalizeByTrait returns 50 for a neutral per-trait sum', () => {
  assert.equal(normalizeByTrait(0, 6), 50);
});

test('normalizeByTrait maps BFI-2-S theoretical bounds to 0 and 100', () => {
  // 6 items per trait × Likert −2…+2 → bounds [−12, +12]
  assert.equal(normalizeByTrait(-12, 6), 0);
  assert.equal(normalizeByTrait(12, 6), 100);
});

test('normalizeByTrait clamps values outside the theoretical window', () => {
  assert.equal(normalizeByTrait(999, 6), 100);
  assert.equal(normalizeByTrait(-999, 6), 0);
});

test('normalizeByTrait returns 50 when itemsForTrait is zero, negative or missing', () => {
  assert.equal(normalizeByTrait(5, 0), 50);
  assert.equal(normalizeByTrait(5, -3), 50);
  assert.equal(normalizeByTrait(5, undefined), 50);
});

test('normalizeByTrait é linear entre os limites e arredonda para 1 casa', () => {
  assert.equal(normalizeByTrait(1, 6), 54.2);   // 13/24 = 54,1666…
  assert.equal(normalizeByTrait(-5, 6), 29.2);  // 7/24  = 29,1666…
  assert.equal(normalizeByTrait(4, 2), 100);    // limites dependem do nº de itens: [−4, +4]
  assert.equal(normalizeByTrait(2, 2), 75);
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
