import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { mulberry32 } from './support/prng.js';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const { buildQuestionOrder } = await import('../src/utils/questionOrder.js');

const objective = id => ({ id, kind: 'objective', type: 'multiple_choice' });
const narrative = (id, slug, type = 'multiple_choice') => ({
  id, kind: 'interpretative', type, question_categories: slug ? { slug } : null,
});

const ROTATION = ['moral_dilemma', 'interest', 'paradoxical'];

/** Roda `fn` com Math.random semeado, para o teste ser reprodutível. */
function seeded(seed, fn) {
  mock.method(Math, 'random', mulberry32(seed));
  try { return fn(); } finally { mock.restoreAll(); }
}

function catalog() {
  const questions = Array.from({ length: 30 }, (_, i) => objective(i + 1));
  let id = 100;
  for (const slug of ROTATION) {
    for (let i = 0; i < 4; i += 1) questions.push(narrative(id++, slug));
  }
  questions.push(narrative(id++, 'interest', 'reflection'));
  return questions;
}

test('a ordem é uma permutação de todas as perguntas objetivas e interpretativas', () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const questions = catalog();
    const order = seeded(seed, () => buildQuestionOrder(questions));
    assert.deepEqual([...order].sort((a, b) => a - b), questions.map(q => q.id).sort((a, b) => a - b));
  }
});

test('as 30 objetivas vêm todas antes do ato narrativo, em ordem sorteada', () => {
  const questions = catalog();
  const order = seeded(7, () => buildQuestionOrder(questions));
  const objectiveIds = questions.filter(q => q.kind === 'objective').map(q => q.id);

  assert.deepEqual(new Set(order.slice(0, 30)), new Set(objectiveIds));
  assert.notDeepEqual(order.slice(0, 30), objectiveIds, 'objetivas deveriam ser embaralhadas');
});

test('itens de tipo desconhecido não entram na ordem', () => {
  const order = buildQuestionOrder([objective(1), { id: 2, kind: 'legacy' }, narrative(3, 'interest')]);
  assert.deepEqual(order, [1, 3]);
});

test('rotação emocional: dilema → interesse → paradoxo enquanto houver das três', () => {
  const byId = new Map();
  const questions = [];
  let id = 1;
  for (const slug of ROTATION) {
    for (let i = 0; i < 3; i += 1) {
      const q = narrative(id++, slug);
      byId.set(q.id, slug);
      questions.push(q);
    }
  }
  for (let seed = 1; seed <= 20; seed += 1) {
    const order = seeded(seed, () => buildQuestionOrder(questions));
    assert.deepEqual(order.map(qid => byId.get(qid)), [...ROTATION, ...ROTATION, ...ROTATION]);
  }
});

test('categoria esgotada: o slot é preenchido com qualquer interpretativa restante', () => {
  // Sem 'interest': os slots dele recebem o que sobrou; nada se perde.
  const questions = [
    narrative(1, 'moral_dilemma'),
    narrative(2, 'paradoxical'), narrative(3, 'paradoxical'), narrative(4, 'paradoxical'),
    narrative(5, null), // sem categoria → balde 'other'
  ];
  for (let seed = 1; seed <= 20; seed += 1) {
    const order = seeded(seed, () => buildQuestionOrder(questions));
    assert.equal(order[0], 1, 'slot 0 é do dilema moral');
    assert.deepEqual([...order].sort(), [1, 2, 3, 4, 5]);
  }
});

test('reflexão depois da metade troca de lugar com o primeiro item narrativo', () => {
  // dilema, interesse, paradoxo e, no slot 3, a reflexão (única restante):
  // índice 3 > floor(4/2) → vai para a frente, e o dilema vai para o slot 3.
  const order = buildQuestionOrder([
    narrative(1, 'moral_dilemma'), narrative(2, 'interest'), narrative(3, 'paradoxical'),
    narrative(9, null, 'reflection'),
  ]);
  assert.deepEqual(order, [9, 2, 3, 1]);
});

test('reflexão exatamente na metade fica onde está', () => {
  const order = buildQuestionOrder([
    narrative(1, 'moral_dilemma'), narrative(2, 'interest'),
    narrative(9, 'paradoxical', 'reflection'), narrative(4, null),
  ]);
  assert.deepEqual(order, [1, 2, 9, 4]);
});

test('em qualquer sorteio a primeira reflexão cai na primeira metade da narrativa', () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const questions = catalog();
    const order = seeded(seed, () => buildQuestionOrder(questions)).slice(30);
    const reflection = questions.find(q => q.type === 'reflection').id;
    assert.ok(order.indexOf(reflection) <= Math.floor(order.length / 2), `seed ${seed}`);
  }
});

test('sem interpretativas a ordem é só a camada objetiva', () => {
  assert.deepEqual(buildQuestionOrder([objective(1)]), [1]);
  assert.deepEqual(buildQuestionOrder([]), []);
});
