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

test('oscilação entre extremos (+2/−2) dispara tensão (stddev = 2, os dois extremos)', () => {
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

test('dispersão alta sem os dois extremos não é tensão', () => {
  // stddev exatamente 1,5, mas ninguém marcou −2: não houve oscilação entre extremos.
  const result = calculateConsistency([-1, -1, -1, 2, 2, 2].map(v => objectiveAnswer('O', v)));
  assert.deepEqual(result.O, { mean: 0.5, stddev: 1.5, tension: false, n: 6 });
});

test('os dois extremos com dispersão moderada não são tensão', () => {
  // +2 e −2 aparecem, mas o resto é coerente: stddev 1,25, abaixo de 1,5.
  const result = calculateConsistency([2, -2, 1, 1, 1, 1].map(v => objectiveAnswer('O', v)));
  assert.deepEqual(result.O, { mean: 0.67, stddev: 1.25, tension: false, n: 6 });
});

test('os dois extremos com dispersão alta são tensão', () => {
  const result = calculateConsistency([2, -2, 2, -2, 1, 1].map(v => objectiveAnswer('O', v)));
  assert.deepEqual(result.O, { mean: 0.33, stddev: 1.7, tension: true, n: 6 });
});

test('limiar é inclusivo: stddev exatamente 1,5 com os dois extremos é tensão', () => {
  // [−2, −2, −1, −1, 1, 2]: média −0,5; variância 2,25; stddev 1,5.
  const result = calculateConsistency([-2, -2, -1, -1, 1, 2].map(v => objectiveAnswer('A', v)));
  assert.equal(result.A.stddev, 1.5);
  assert.equal(result.A.tension, true);
});

test('o extremo conta depois da inversão da chave reversa', () => {
  // Item reverso respondido com −2 vira +2: junto de diretos −2, são os dois extremos.
  const answers = [
    objectiveAnswer('N', -2, true),
    objectiveAnswer('N', -2, true),
    objectiveAnswer('N', -2),
    objectiveAnswer('N', -2),
  ];
  const result = calculateConsistency(answers);
  assert.equal(result.N.stddev, 2);
  assert.equal(result.N.tension, true);
});

test('interpretativa com traço e impacto não entra no bucket do traço', () => {
  const leaked = {
    questions: { kind: 'interpretative', trait: 'O', reverse_key: false },
    alternatives: { impact_o: -2 },
  };
  const result = calculateConsistency([objectiveAnswer('O', 2), leaked]);
  assert.deepEqual(result.O, { mean: 2, stddev: 0, tension: false, n: 1 });
});
