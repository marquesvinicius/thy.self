import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { mulberry32 } from './support/prng.js';

const { shuffle } = await import('../src/utils/shuffle.js');

test('shuffle preserva todos os elementos (mesmo multiset)', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const output = shuffle(input);

  assert.equal(output.length, input.length);
  assert.deepEqual([...output].sort((a, b) => a - b), input);
});

test('shuffle não muta o array original', () => {
  const input = ['a', 'b', 'c', 'd'];
  const snapshot = [...input];
  shuffle(input);

  assert.deepEqual(input, snapshot);
});

test('shuffle de array vazio e unitário é estável', () => {
  assert.deepEqual(shuffle([]), []);
  assert.deepEqual(shuffle([42]), [42]);
});

test('shuffle é uniforme: as 24 permutações de 4 itens saem com a mesma frequência', t => {
  // Fisher–Yates correto dá 1/24 para cada permutação. Um embaralhamento
  // viciado (ex.: sort(() => Math.random() - 0.5), ou j fora de [0, i])
  // concentra ou elimina permutações e estoura a faixa de ±15%.
  t.after(() => mock.restoreAll());
  mock.method(Math, 'random', mulberry32(2026));

  const runs = 24_000;
  const counts = new Map();
  for (let i = 0; i < runs; i += 1) {
    const key = shuffle(['a', 'b', 'c', 'd']).join('');
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  assert.equal(counts.size, 24);
  for (const [perm, n] of counts) {
    assert.ok(n > 850 && n < 1150, `permutação ${perm} saiu ${n} vezes (esperado ~1000)`);
  }
});
