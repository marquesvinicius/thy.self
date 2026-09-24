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
let sessionMissing = false;
const persistedOrders = [];

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
    getSessionById: async () => (sessionMissing ? null : {
      question_order: sessionOrderFixture === undefined ? null : sessionOrderFixture || [
        ...questionsFixture.filter(q => q.kind === 'objective').map(q => q.id),
        ...questionsFixture.filter(q => q.kind === 'interpretative').map(q => q.id),
      ],
    }),
    updateSessionQuestionOrder: async (id, order) => {
      persistedOrders.push({ id, order });
      return { question_order: order };
    },
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

test('reflexão na ordem persistida é servida sem alternativas', async () => {
  const reflection = { ...interpretativeQ(200, 'interest'), type: 'reflection' };
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
  // A fixture traz alternativas; reflexão é texto livre e não as expõe.
  assert.deepEqual(result.questions[0].alternatives, []);
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

function reset({ questions = [], answered = [], objective = 0, order = null } = {}) {
  questionsFixture = questions;
  answeredIdsFixture = answered;
  objectiveAnsweredFixture = objective;
  sessionOrderFixture = order;
  sessionMissing = false;
  persistedOrders.length = 0;
}

const thirtyAnswered = () => Array.from({ length: 30 }, (_, i) => i + 1);

test('sessão inexistente devolve lote vazio, sem progresso por etapa', async () => {
  reset({ questions: [objectiveQ(1, 'O')] });
  sessionMissing = true;

  assert.deepEqual(await getQuestions('ghost', 5), {
    questions: [], total_answered: 0, total_available: 0, can_analyze: false,
  });
});

test('sessão sem ordem materializa e persiste a ordem uma única vez', async () => {
  reset({ questions: [objectiveQ(1, 'O'), interpretativeQ(101, 'interest')] });
  sessionOrderFixture = undefined; // sessão recém-criada: question_order nulo no banco

  const result = await getQuestions('sess-new', 5);

  assert.equal(persistedOrders.length, 1);
  assert.equal(persistedOrders[0].id, 'sess-new');
  assert.deepEqual(persistedOrders[0].order, [1, 101]);
  assert.deepEqual(result.questions.map(q => q.id), [1, 101]);
});

test('sessão com ordem já persistida não regrava a ordem', async () => {
  reset({ questions: [objectiveQ(1, 'O')], order: [1] });
  await getQuestions('sess', 5);
  assert.equal(persistedOrders.length, 0);
});

test('orçamento narrativo limita as interpretativas DENTRO do lote', async () => {
  // Teto 3, 1 já respondida → cabem 2, mesmo pedindo 5.
  reset({
    questions: [100, 101, 102, 103, 104, 105].map(id => interpretativeQ(id, 'paradoxical')),
    answered: [...thirtyAnswered(), 100],
    objective: 30,
    order: [100, 101, 102, 103, 104, 105],
  });

  const result = await getQuestions('s', 5, { narrativeLimit: 3 });

  assert.deepEqual(result.questions.map(q => q.id), [101, 102]);
  assert.equal(result.total_available, 2);
  assert.deepEqual(result.stage_progress, {
    objective_answered: 30, objective_total: 0, interpretative_answered: 1, interpretative_total: 3,
  });
});

test('teto narrativo 0 encerra a narrativa, mas objetivas pendentes seguem', async () => {
  reset({
    questions: [objectiveQ(1, 'O'), interpretativeQ(101, 'interest')],
    order: [101, 1],
  });

  const result = await getQuestions('s', 5, { narrativeLimit: 0 });

  assert.deepEqual(result.questions.map(q => q.id), [1]);
  assert.equal(result.total_available, 1);
});

test('teto narrativo negativo é ignorado (vale o catálogo inteiro)', async () => {
  reset({ questions: [101, 102].map(id => interpretativeQ(id, 'interest')), answered: thirtyAnswered(), objective: 30 });
  const result = await getQuestions('s', 5, { narrativeLimit: -1 });
  assert.equal(result.stage_progress.interpretative_total, 2);
  assert.equal(result.questions.length, 2);
});

test('teto narrativo fracionário é truncado', async () => {
  reset({ questions: [101, 102, 103].map(id => interpretativeQ(id, 'interest')), answered: thirtyAnswered(), objective: 30 });
  const result = await getQuestions('s', 5, { narrativeLimit: '2.9' });
  assert.equal(result.stage_progress.interpretative_total, 2);
});

test('lote respeita o count pedido e o progresso por etapa soma as camadas', async () => {
  reset({
    questions: [objectiveQ(1, 'O'), objectiveQ(2, 'C'), objectiveQ(3, 'E'), interpretativeQ(101, 'interest')],
    answered: [1],
    objective: 1,
  });

  const result = await getQuestions('s', 1);

  assert.deepEqual(result.questions.map(q => q.id), [2]);
  assert.equal(result.total_answered, 1);
  assert.equal(result.total_available, 3);
  assert.deepEqual(result.stage_progress, {
    objective_answered: 1, objective_total: 3, interpretative_answered: 0, interpretative_total: 1,
  });
});

test('formato público da pergunta: objetiva × interpretativa', async () => {
  const bare = { ...interpretativeQ(101, 'interest'), kind: undefined, type: undefined, trait: undefined };
  reset({ questions: [objectiveQ(1, 'O'), bare], order: [1, 101] });

  const [obj, interp] = (await getQuestions('s', 5)).questions;

  assert.deepEqual(obj, {
    id: 1, text: 'BFI item 1', context: null, category: 'objective_bfi2s',
    kind: 'objective', trait: 'O', type: 'multiple_choice',
    alternatives: [{ id: 100, text: 'Discordo' }, { id: 101, text: 'Concordo' }],
  });
  // Sem kind/type/trait no banco → defaults seguros (interpretativa, múltipla escolha, sem traço).
  assert.deepEqual(interp, {
    id: 101, text: 'Interpretativa 101', context: null, category: 'interest',
    kind: 'interpretative', trait: null, type: 'multiple_choice',
    alternatives: [{ id: 10100, text: 'Opção' }],
  });
});

test('alternativas de interpretativas são as mesmas, só embaralhadas', async () => {
  const q = interpretativeQ(101, 'interest');
  q.alternatives = [0, 1, 2, 3, 4, 5].map(i => ({ id: i, text: `alt ${i}`, sort_order: i }));
  reset({ questions: [q], answered: thirtyAnswered(), objective: 30 });

  const seen = new Set();
  for (let i = 0; i < 20; i += 1) {
    const [served] = (await getQuestions('s', 1)).questions;
    assert.deepEqual(served.alternatives.map(a => a.id).sort(), [0, 1, 2, 3, 4, 5]);
    seen.add(served.alternatives.map(a => a.id).join());
  }
  assert.ok(seen.size > 1, 'a ordem das alternativas interpretativas deveria variar');
});

test('pergunta da ordem que não voltou do join de alternativas é descartada', async () => {
  reset({ questions: [objectiveQ(1, 'O'), objectiveQ(2, 'C')], order: [1, 2, 999] });
  const result = await getQuestions('s', 5);
  assert.deepEqual(result.questions.map(q => q.id), [1, 2]);
});
