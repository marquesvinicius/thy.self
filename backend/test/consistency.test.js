import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const { calculateConsistency } = await import('../src/engine/consistency.js');

function objectiveAnswer(trait, likertValue, reverseKey = false) {
  return {
    questions: { kind: 'objective', trait, reverse_key: reverseKey },
    alternatives: { [`impact_${trait.toLowerCase()}`]: likertValue },
  };
}

function interpretativeAnswer() {
  return {
    questions: { kind: 'interpretative', trait: null, reverse_key: false },
    alternatives: { text: 'qualquer coisa' },
  };
}

test('respostas coerentes dentro do eixo não geram tensão', () => {
  const answers = [2, 2, 1, 2, 1, 2].map(v => objectiveAnswer('E', v));
  const result = calculateConsistency(answers);

  assert.equal(result.E.n, 6);
  assert.equal(result.E.tension, false);
  assert.ok(result.E.stddev <= 1.2);
});

test('oscilação entre extremos (+2/−2) dispara tensão (stddev = 2 > 1.2)', () => {
  const answers = [2, -2, 2, -2, 2, -2].map(v => objectiveAnswer('N', v));
  const result = calculateConsistency(answers);

  assert.equal(result.N.stddev, 2);
  assert.equal(result.N.tension, true);
});

test('eixo sem respostas retorna neutro com n = 0', () => {
  const result = calculateConsistency([]);

  for (const key of ['O', 'C', 'E', 'A', 'N']) {
    assert.deepEqual(result[key], { mean: 0, stddev: 0, tension: false, n: 0 });
  }
});

test('reverse_key inverte o sinal da contribuição', () => {
  // Item reverso respondido com +2 contribui −2; misturado com diretos +2,
  // a média cai e o stddev sobe em relação ao caso todo-direto.
  const direct = calculateConsistency([
    objectiveAnswer('C', 2),
    objectiveAnswer('C', 2),
  ]);
  const mixed = calculateConsistency([
    objectiveAnswer('C', 2),
    objectiveAnswer('C', 2, true),
  ]);

  assert.equal(direct.C.mean, 2);
  assert.equal(direct.C.stddev, 0);
  assert.equal(mixed.C.mean, 0);
  assert.equal(mixed.C.stddev, 2);
  assert.equal(mixed.C.tension, true);
});

test('respostas interpretativas são ignoradas no cálculo', () => {
  const answers = [
    objectiveAnswer('O', 1),
    interpretativeAnswer(),
    interpretativeAnswer(),
  ];
  const result = calculateConsistency(answers);

  assert.equal(result.O.n, 1);
  // Nenhum outro eixo recebe contribuição das interpretativas
  assert.equal(result.C.n, 0);
  assert.equal(result.E.n, 0);
});

test('valores não numéricos e traits inválidos são descartados', () => {
  const answers = [
    objectiveAnswer('A', 1),
    { questions: { kind: 'objective', trait: 'X', reverse_key: false }, alternatives: {} },
    { questions: { kind: 'objective', trait: 'A', reverse_key: false }, alternatives: { impact_a: 'NaN?' } },
  ];
  const result = calculateConsistency(answers);

  assert.equal(result.A.n, 1);
  assert.equal(result.A.mean, 1);
});
