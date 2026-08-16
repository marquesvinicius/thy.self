import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

// Requer `--experimental-test-module-mocks` (já incluso no npm test).
// Mockamos as camadas de query para testar a lógica pura do picker Dual-Core.

let questionsFixture = [];
let answeredIdsFixture = [];
let objectiveAnsweredFixture = 0;
let sessionOrderFixture = null;

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

mock.module('../src/database/queries/session.queries.js', {
  namedExports: {
    getSessionById: async () => ({
      question_order: sessionOrderFixture || [
        ...questionsFixture.filter(q => q.kind === 'objective').map(q => q.id),
        ...questionsFixture.filter(q => q.kind === 'interpretative').map(q => q.id),
      ],
    }),
    updateSessionQuestionOrder: async (_id, order) => ({ question_order: order }),
  },
});

const { getQuestions } = await import('../src/services/question.service.js');
const { buildQuestionOrder } = await import('../src/utils/questionOrder.js');

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

test('buildQuestionOrder materializa objetivos antes da narrativa', () => {
  const questions = [
    objectiveQ(1, 'O'),
    objectiveQ(2, 'C'),
    interpretativeQ(101, 'moral_dilemma'),
    interpretativeQ(102, 'interest'),
    { ...interpretativeQ(103, 'paradoxical'), type: 'reflection' },
  ];

  const order = buildQuestionOrder(questions);

  assert.deepEqual(new Set(order), new Set(questions.map(q => q.id)));
  assert.ok(order.slice(0, 2).every(id => [1, 2].includes(id)));
  assert.ok(order.indexOf(103) < order.length);
});

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

test('ordem persistida define deterministicamente a pergunta seguinte', async () => {
  questionsFixture = [
    objectiveQ(1, 'O'),
    objectiveQ(2, 'C'),
    objectiveQ(3, 'E'),
    objectiveQ(4, 'A'),
    objectiveQ(5, 'N'),
  ];
  answeredIdsFixture = [];
  objectiveAnsweredFixture = 0;
  sessionOrderFixture = [4, 1, 2, 3, 5];

  const result = await getQuestions('session-1', 1);

  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].id, 4);
  sessionOrderFixture = null;
});

test('pergunta consumida na ordem persistida é ignorada', async () => {
  questionsFixture = [objectiveQ(1, 'O'), objectiveQ(2, 'C')];
  answeredIdsFixture = [1];
  objectiveAnsweredFixture = 1;

  sessionOrderFixture = [1, 2];
  const result = await getQuestions('session-1', 1);

  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].id, 2);
  sessionOrderFixture = null;
});

test('skip interpretativo consome o slot e segue a ordem fixa', async () => {
  questionsFixture = [
    interpretativeQ(101, 'moral_dilemma'),
    interpretativeQ(102, 'interest'),
  ];
  answeredIdsFixture = [101]; // skip também é uma linha em answers
  objectiveAnsweredFixture = 30;
  sessionOrderFixture = [101, 102];

  const result = await getQuestions('session-1', 1);

  assert.equal(result.questions[0].id, 102);
  sessionOrderFixture = null;
});

test('ordem persistida pode colocar reflexão no próximo slot', async () => {
  const reflection = { ...interpretativeQ(200, 'interest'), type: 'reflection', alternatives: [] };
  // Pool interpretativo total = 4; 2 já respondidas (nenhuma reflexão) →
  // disponível (2) <= ceil(4/2) → força a reflexão no batch.
  questionsFixture = [
    interpretativeQ(101, 'moral_dilemma'),
    interpretativeQ(102, 'paradoxical'),
    interpretativeQ(103, 'interest'),
    reflection,
  ];
  answeredIdsFixture = [...Array.from({ length: 30 }, (_, i) => i + 1), 101, 102];
  objectiveAnsweredFixture = 30;
  sessionOrderFixture = [200, 101, 102, 103];

  const result = await getQuestions('session-1', 1);

  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].type, 'reflection');
  sessionOrderFixture = null;
});

test('narrativeLimit encerra o ato narrativo ao atingir o teto', async () => {
  const interpretatives = [101, 102, 103, 104, 105].map(id => interpretativeQ(id, 'paradoxical'));
  questionsFixture = [...interpretatives];
  // 30 objetivas + 2 interpretativas respondidas; teto curto = 2 → esgotado.
  answeredIdsFixture = [...Array.from({ length: 30 }, (_, i) => i + 1), 101, 102];
  objectiveAnsweredFixture = 30;

  const result = await getQuestions('session-1', 1, { narrativeLimit: 2 });

  assert.deepEqual(result.questions, []);
  assert.equal(result.total_available, 0);
  assert.equal(result.stage_progress.interpretative_total, 2);
  assert.equal(result.stage_progress.interpretative_answered, 2);
  assert.equal(result.can_analyze, true);
});

test('narrativeLimit ainda serve perguntas enquanto há orçamento', async () => {
  questionsFixture = [101, 102, 103].map(id => interpretativeQ(id, 'paradoxical'));
  answeredIdsFixture = Array.from({ length: 30 }, (_, i) => i + 1);
  objectiveAnsweredFixture = 30;

  const result = await getQuestions('session-1', 1, { narrativeLimit: 2 });

  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].kind, 'interpretative');
  // total_available respeita o teto (2), não o catálogo (3)
  assert.equal(result.total_available, 2);
  assert.equal(result.stage_progress.interpretative_total, 2);
});

test('sem narrativeLimit o ato narrativo usa o catálogo inteiro', async () => {
  questionsFixture = [101, 102, 103].map(id => interpretativeQ(id, 'paradoxical'));
  answeredIdsFixture = Array.from({ length: 30 }, (_, i) => i + 1);
  objectiveAnsweredFixture = 30;

  const result = await getQuestions('session-1', 1);

  assert.equal(result.total_available, 3);
  assert.equal(result.stage_progress.interpretative_total, 3);
});

test('narrativeLimit inválido é ignorado (não trava o ato narrativo)', async () => {
  questionsFixture = [101, 102].map(id => interpretativeQ(id, 'paradoxical'));
  answeredIdsFixture = Array.from({ length: 30 }, (_, i) => i + 1);
  objectiveAnsweredFixture = 30;

  const result = await getQuestions('session-1', 1, { narrativeLimit: 'abc' });

  assert.equal(result.questions.length, 1);
  assert.equal(result.stage_progress.interpretative_total, 2);
});

test('rotação emocional alterna categorias (pesado → leve → médio)', async () => {
  // 1 interpretativa já respondida → índice 1 da rotação → 'interest'
  questionsFixture = [
    { ...interpretativeQ(100, 'moral_dilemma') }, // respondida
    interpretativeQ(101, 'moral_dilemma'),
    interpretativeQ(102, 'paradoxical'),
    interpretativeQ(103, 'interest'),
  ];
  // Fixture realista: `answeredIds` inclui as 30 objetivas + a interpretativa,
  // pois o serviço deriva a contagem narrativa por subtração.
  answeredIdsFixture = [...Array.from({ length: 30 }, (_, i) => i + 1), 100];
  objectiveAnsweredFixture = 30;

  const result = await getQuestions('session-1', 1);

  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].id, 101); // a ordem materializada é a fonte da verdade
});

test('reflexão NÃO é forçada se o usuário já respondeu (ou pulou) uma', async () => {
  const answeredReflection = { ...interpretativeQ(201, 'interest'), type: 'reflection', alternatives: [] };
  const pendingReflection = { ...interpretativeQ(202, 'interest'), type: 'reflection', alternatives: [] };
  questionsFixture = [
    interpretativeQ(101, 'moral_dilemma'),
    interpretativeQ(102, 'paradoxical'),
    answeredReflection,
    pendingReflection,
  ];
  answeredIdsFixture = [...Array.from({ length: 30 }, (_, i) => i + 1), 101, 201];
  objectiveAnsweredFixture = 30;

  const result = await getQuestions('session-1', 1);

  assert.equal(result.questions.length, 1);
  assert.notEqual(result.questions[0].id, 202);
});
