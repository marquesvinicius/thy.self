import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

// Requer `--experimental-test-module-mocks` (já incluso no npm test).
const db = {
  alternative: null,
  question: null,
  insertError: null,
  inserted: [],
  total: 0,
  objective: 0,
  lastAnswer: null,
};

mock.module('../src/database/queries/answer.queries.js', {
  namedExports: {
    createAnswer: async (...args) => {
      if (db.insertError) throw db.insertError;
      db.inserted.push(args);
      return { id: 'ans-1', answered_at: '2026-09-24T10:00:00.000Z' };
    },
    countAnswersBySessionId: async () => db.total,
    countObjectiveAnswersBySessionId: async () => db.objective,
    deleteLastAnswer: async () => db.lastAnswer,
  },
});
mock.module('../src/database/queries/question.queries.js', {
  namedExports: {
    getAlternativeWithImpacts: async () => db.alternative,
    getQuestionKindById: async () => db.question,
  },
});

const { recordAnswer, undoLastAnswer } = await import('../src/services/answer.service.js');

function reset(overrides = {}) {
  Object.assign(db, {
    alternative: null, question: null, insertError: null, inserted: [],
    total: 0, objective: 0, lastAnswer: null,
  }, overrides);
}

test('registra resposta objetiva e devolve o progresso', async () => {
  reset({ alternative: { id: 11, question_id: 7 }, total: 5, objective: 4 });

  const result = await recordAnswer('sess', 7, 11);

  assert.deepEqual(db.inserted, [['sess', 7, 11, 'alternative_id', null]]);
  assert.deepEqual(result, {
    answer_id: 'ans-1',
    session_id: 'sess',
    question_id: 7,
    alternative_id: 11,
    answer_type: 'alternative_id',
    answered_at: '2026-09-24T10:00:00.000Z',
    progress: { answered: 5, objective_answered: 4, minimum_for_analysis: 30, can_analyze: false },
  });
});

test('can_analyze vira true exatamente na 30ª resposta objetiva', async () => {
  reset({ alternative: { id: 1, question_id: 1 }, total: 30, objective: 29 });
  assert.equal((await recordAnswer('s', 1, 1)).progress.can_analyze, false);

  reset({ alternative: { id: 1, question_id: 1 }, total: 30, objective: 30 });
  assert.equal((await recordAnswer('s', 1, 1)).progress.can_analyze, true);
});

test('alternativa inexistente → 404, nada é gravado', async () => {
  reset({ alternative: null });
  await assert.rejects(recordAnswer('s', 1, 99), { statusCode: 404, code: 'NOT_FOUND', message: 'Alternative not found.' });
  assert.equal(db.inserted.length, 0);
});

test('alternativa de outra pergunta → 400, nada é gravado', async () => {
  reset({ alternative: { id: 5, question_id: 2 } });
  await assert.rejects(recordAnswer('s', 1, 5), {
    statusCode: 400, code: 'VALIDATION_ERROR', message: 'Alternative does not belong to the specified question.',
  });
  assert.equal(db.inserted.length, 0);
});

test('pular item objetivo (BFI-2-S) é bloqueado na fonte → 400', async () => {
  // Um skip objetivo inflaria o contador de 30 itens sem valor Likert.
  reset({ question: { kind: 'objective' } });
  await assert.rejects(
    recordAnswer('s', 1, null, 'skip'),
    { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Objective (BFI-2-S) questions cannot be skipped.' }
  );
  assert.equal(db.inserted.length, 0);
});

test('pular pergunta inexistente → 404', async () => {
  reset({ question: null });
  await assert.rejects(recordAnswer('s', 1, null, 'skip'), { statusCode: 404, code: 'NOT_FOUND', message: 'Question not found.' });
});

test('pular item interpretativo é permitido e grava a observação', async () => {
  reset({ question: { kind: 'interpretative' }, total: 31, objective: 30 });

  const result = await recordAnswer('s', 101, null, 'reflection', 'texto livre');

  assert.deepEqual(db.inserted, [['s', 101, null, 'reflection', 'texto livre']]);
  assert.equal(result.alternative_id, null);
  assert.equal(result.progress.can_analyze, true);
});

test('reflexão com alternative_id não passa pela checagem de alternativa', async () => {
  // answerType diferente de 'alternative_id' → a alternativa não é validada.
  reset({ alternative: null });
  await recordAnswer('s', 101, 55, 'reflection', 'x');
  assert.equal(db.inserted.length, 1);
});

test('resposta duplicada (violação UNIQUE 23505) → 409 CONFLICT', async () => {
  reset({ alternative: { id: 1, question_id: 1 }, insertError: Object.assign(new Error('dup'), { code: '23505' }) });
  await assert.rejects(recordAnswer('s', 1, 1), {
    statusCode: 409, code: 'CONFLICT', message: 'This question has already been answered in this session.',
  });
});

test('outros erros do banco sobem sem ser mascarados', async () => {
  const boom = Object.assign(new Error('connection reset'), { code: '08006' });
  reset({ alternative: { id: 1, question_id: 1 }, insertError: boom });
  await assert.rejects(recordAnswer('s', 1, 1), err => err === boom);
});

test('undo sem respostas → 404', async () => {
  reset({ lastAnswer: null });
  await assert.rejects(undoLastAnswer('s'), { statusCode: 404, code: 'NOT_FOUND', message: 'Não há respostas para desfazer.' });
});

test('undo devolve a pergunta desfeita e o progresso recalculado', async () => {
  reset({ lastAnswer: { question_id: 42 }, total: 29, objective: 29 });
  assert.deepEqual(await undoLastAnswer('s'), {
    undone_question_id: 42,
    progress: { answered: 29, objective_answered: 29, minimum_for_analysis: 30, can_analyze: false },
  });

  reset({ lastAnswer: { question_id: 42 }, total: 31, objective: 30 });
  assert.equal((await undoLastAnswer('s')).progress.can_analyze, true);
});
