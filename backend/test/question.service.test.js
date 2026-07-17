import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

// Requer `--experimental-test-module-mocks` (já incluso no npm test).
// Mockamos as camadas de query para testar a lógica pura do picker Dual-Core.

let questionsFixture = [];
let answeredIdsFixture = [];
let objectiveAnsweredFixture = 0;

mock.module('../src/database/queries/question.queries.js', {
  namedExports: {
    getAllActiveQuestions: async () => questionsFixture,
    getQuestionsWithAlternatives: async ids =>
      questionsFixture
        .filter(q => ids.includes(q.id))
        .map(q => ({ ...q, alternatives: q.alternatives || [] })),
  },
});

mock.module('../src/database/queries/answer.queries.js', {
  namedExports: {
    getAnsweredQuestionIds: async () => answeredIdsFixture,
    countObjectiveAnswersBySessionId: async () => objectiveAnsweredFixture,
  },
});

const { getQuestions } = await import('../src/services/question.service.js');

function objectiveQ(id, trait) {
  return {
    id,
    text: `BFI item ${id}`,
    context: null,
    type: 'multiple_choice',
    kind: 'objective',
    trait,
    reverse_key: false,
    question_categories: { slug: 'objective_bfi2s', name: 'BFI-2-S' },
    alternatives: [
      { id: id * 100, text: 'Discordo', sort_order: 0 },
      { id: id * 100 + 1, text: 'Concordo', sort_order: 1 },
    ],
  };
}

function interpretativeQ(id, slug) {
  return {
    id,
    text: `Interpretativa ${id}`,
    context: null,
    type: 'multiple_choice',
    kind: 'interpretative',
    trait: null,
    reverse_key: false,
    question_categories: { slug, name: slug },
    alternatives: [{ id: id * 100, text: 'Opção', sort_order: 0 }],
  };
}

test('picker prioriza itens objetivos enquanto houver BFI-2-S pendente', async () => {
  questionsFixture = [
    interpretativeQ(101, 'moral_dilemma'),
    interpretativeQ(102, 'paradoxical'),
    objectiveQ(1, 'O'),
    objectiveQ(2, 'C'),
    objectiveQ(3, 'E'),
  ];
  answeredIdsFixture = [];
  objectiveAnsweredFixture = 0;

  const result = await getQuestions('session-1', 3);

  assert.equal(result.questions.length, 3);
  assert.ok(result.questions.every(q => q.kind === 'objective'));
  assert.equal(result.can_analyze, false);
});

test('picker serve interpretativas quando as objetivas se esgotam', async () => {
  questionsFixture = [
    interpretativeQ(101, 'moral_dilemma'),
    interpretativeQ(102, 'paradoxical'),
    interpretativeQ(103, 'interest'),
  ];
  // Todas as 30 objetivas já respondidas
  answeredIdsFixture = Array.from({ length: 30 }, (_, i) => i + 1);
  objectiveAnsweredFixture = 30;

  const result = await getQuestions('session-1', 3);

  assert.ok(result.questions.length > 0);
  assert.ok(result.questions.every(q => q.kind === 'interpretative'));
  assert.equal(result.can_analyze, true);
});

test('can_analyze exige 30 respostas objetivas (29 não basta)', async () => {
  questionsFixture = [objectiveQ(30, 'N')];
  answeredIdsFixture = Array.from({ length: 29 }, (_, i) => i + 1);
  objectiveAnsweredFixture = 29;

  const result = await getQuestions('session-1', 1);

  assert.equal(result.can_analyze, false);
});

test('perguntas já respondidas não voltam no batch', async () => {
  questionsFixture = [objectiveQ(1, 'O'), objectiveQ(2, 'C'), objectiveQ(3, 'E')];
  answeredIdsFixture = [1, 2];
  objectiveAnsweredFixture = 2;

  const result = await getQuestions('session-1', 5);

  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].id, 3);
  assert.equal(result.total_available, 1);
});

test('itens objetivos preservam a ordem Likert das alternativas', async () => {
  const q = objectiveQ(1, 'O');
  q.alternatives = [
    { id: 105, text: 'Concordo totalmente', sort_order: 4 },
    { id: 101, text: 'Discordo totalmente', sort_order: 0 },
    { id: 103, text: 'Neutro', sort_order: 2 },
    { id: 102, text: 'Discordo', sort_order: 1 },
    { id: 104, text: 'Concordo', sort_order: 3 },
  ];
  questionsFixture = [q];
  answeredIdsFixture = [];
  objectiveAnsweredFixture = 0;

  const result = await getQuestions('session-1', 1);

  assert.deepEqual(
    result.questions[0].alternatives.map(a => a.text),
    ['Discordo totalmente', 'Discordo', 'Neutro', 'Concordo', 'Concordo totalmente']
  );
});

test('pool vazio retorna batch vazio sem erro', async () => {
  questionsFixture = [];
  answeredIdsFixture = [];
  objectiveAnsweredFixture = 0;

  const result = await getQuestions('session-1', 5);

  assert.deepEqual(result.questions, []);
  assert.equal(result.total_available, 0);
});

test('preferQuestionId força a pergunta desfeita no topo do batch', async () => {
  questionsFixture = [
    objectiveQ(1, 'O'),
    objectiveQ(2, 'C'),
    objectiveQ(3, 'E'),
    objectiveQ(4, 'A'),
    objectiveQ(5, 'N'),
  ];
  answeredIdsFixture = [];
  objectiveAnsweredFixture = 0;

  const result = await getQuestions('session-1', 1, { preferQuestionId: 4 });

  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].id, 4);
});

test('preferQuestionId já respondido é ignorado e o picker segue normal', async () => {
  questionsFixture = [objectiveQ(1, 'O'), objectiveQ(2, 'C')];
  answeredIdsFixture = [1];
  objectiveAnsweredFixture = 1;

  const result = await getQuestions('session-1', 1, { preferQuestionId: 1 });

  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].id, 2);
});
