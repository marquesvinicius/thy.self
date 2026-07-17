import assert from 'node:assert/strict';
import test from 'node:test';

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
