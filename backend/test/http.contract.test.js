import assert from 'node:assert/strict';
import test, { after, before, beforeEach, mock } from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

// Contrato HTTP da API sobre o app Express REAL: roteamento, validação,
// sessionGuard, controllers, services e errorHandler rodam de verdade.
// Só a borda de I/O (queries do Supabase, RPC de arquétipo, LLM) é simulada.
// Requer `--experimental-test-module-mocks` (já incluso no npm test).

const db = {};
function resetDb() {
  Object.assign(db, {
    sessions: new Map([
      ['active', { id: 'active', status: 'active', question_order: [1, 2, 101] }],
      ['done', { id: 'done', status: 'completed', question_order: [] }],
    ]),
    questions: [
      { id: 1, kind: 'objective', trait: 'O', type: 'multiple_choice', text: 'Q1', alternatives: [{ id: 11, text: 'Concordo', sort_order: 0 }] },
      { id: 2, kind: 'objective', trait: 'C', type: 'multiple_choice', text: 'Q2', alternatives: [{ id: 21, text: 'Concordo', sort_order: 0 }] },
      { id: 101, kind: 'interpretative', trait: null, type: 'reflection', text: 'R', alternatives: [] },
    ],
    alternatives: new Map([[11, { id: 11, question_id: 1 }], [21, { id: 21, question_id: 2 }]]),
    answers: [],
    answerRows: [],
    result: null,
    persistedInterpretation: null,
    llm: { vibe_resumo: 'nova', referencias: [{ nome: 'Feynman' }], obras_culturais: [] },
    detail: { resumo: 'detalhe' },
    failNextQuery: null,
  });
}
resetDb();

function maybeFail() {
  if (db.failNextQuery) {
    const err = db.failNextQuery;
    db.failNextQuery = null;
    throw err;
  }
}

mock.module('../src/utils/logger.js', {
  namedExports: { logger: { error() {}, warn() {}, info() {}, debug() {} } },
});
mock.module('../src/database/queries/session.queries.js', {
  namedExports: {
    createSession: async (nickname, order) => ({ id: 'new-session', nickname, status: 'active', created_at: 'now', question_order: order }),
    getSessionById: async id => { maybeFail(); return db.sessions.get(id) ?? null; },
    updateSessionQuestionOrder: async () => ({}),
    updateSessionStatus: async (id, status) => ({ id, status }),
  },
});
mock.module('../src/database/queries/question.queries.js', {
  namedExports: {
    getAllActiveQuestions: async () => db.questions,
    getQuestionsWithAlternatives: async ids => db.questions.filter(q => ids.includes(q.id)),
    getQuestionKindById: async id => db.questions.find(q => q.id === id) ?? null,
    getAlternativeWithImpacts: async id => db.alternatives.get(id) ?? null,
  },
});
mock.module('../src/database/queries/answer.queries.js', {
  namedExports: {
    createAnswer: async (sessionId, questionId, alternativeId) => {
      if (db.answers.some(a => a.sessionId === sessionId && a.questionId === questionId)) {
        throw Object.assign(new Error('duplicate key'), { code: '23505' });
      }
      db.answers.push({ sessionId, questionId, alternativeId });
      return { id: `ans-${db.answers.length}`, answered_at: 'now' };
    },
    countAnswersBySessionId: async () => db.answers.length,
    countObjectiveAnswersBySessionId: async () => db.answers.filter(a => a.alternativeId).length,
    deleteLastAnswer: async () => {
      const last = db.answers.pop();
      return last ? { question_id: last.questionId } : null;
    },
    getAnsweredQuestionIds: async () => db.answers.map(a => a.questionId),
    getAnswersBySessionId: async () => [],
    getAnswerReviewBySessionId: async () => db.answerRows,
    getInterpretativeSignals: async () => [],
  },
});
mock.module('../src/database/queries/result.queries.js', {
  namedExports: {
    getResultBySessionId: async () => db.result,
    createResult: async () => ({}),
    updateResultInterpretation: async (_id, interpretation) => {
      db.persistedInterpretation = interpretation;
      return {};
    },
  },
});
mock.module('../src/services/archetype.service.js', {
  namedExports: {
    findClosestArchetype: async () => ({ id: 'near', name: 'Perto' }),
    findFarthestArchetype: async () => ({ id: 'far', name: 'Longe' }),
  },
});
mock.module('../src/services/llm.service.js', {
  namedExports: {
    generateInterpretation: async () => db.llm,
    generateReferenceDetail: async () => db.detail,
    getRegenLens: () => ({ id: 'lens' }),
  },
});

const { default: app } = await import('../src/app.js');

let server;
let baseUrl;
before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
beforeEach(resetDb);

async function call(method, path, body, { raw } = {}) {
  const init = { method, headers: {} };
  if (raw !== undefined) {
    init.body = raw;
    init.headers['content-type'] = 'application/json';
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  const res = await fetch(`${baseUrl}${path}`, init);
  return { status: res.status, body: await res.json() };
}

const RESULT_ROW = {
  score_o: 70, score_c: 50, score_e: 50, score_a: 50, score_n: 50,
  answer_count: 30, calculated_at: 't', consistency: null,
  llm_interpretation: {
    interpretacao: 'original', vibe_resumo: 'vibe',
    referencias: [{ nome: 'Arendt', categoria: 'Filósofa' }], obras_culturais: [],
  },
};

// ── infraestrutura ──────────────────────────────────────────────────────────

test('GET /health responde ok', async () => {
  const { status, body } = await call('GET', '/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
});

test('rota inexistente → 404 no envelope padrão', async () => {
  assert.deepEqual(await call('GET', '/api/v1/nada'), {
    status: 404,
    body: { success: false, error: { message: 'Route not found.', code: 'NOT_FOUND' } },
  });
});

test('JSON malformado → 400, não 500', async () => {
  const { status, body } = await call('POST', '/api/v1/answer', undefined, { raw: '{"session_id":' });
  assert.equal(status, 400);
  assert.equal(body.success, false);
});

test('erro inesperado do banco → 500 genérico, sem vazar a mensagem interna', async () => {
  db.failNextQuery = new Error('password=hunter2 connection refused');
  const { status, body } = await call('GET', '/api/v1/questions?session_id=active');
  assert.equal(status, 500);
  assert.deepEqual(body.error, { message: 'Internal server error', code: 'INTERNAL_ERROR' });
});

// ── sessão e perguntas ──────────────────────────────────────────────────────

test('POST /session sem corpo cria a sessão (201)', async () => {
  const res = await fetch(`${baseUrl}/api/v1/session`, { method: 'POST' });
  const body = await res.json();
  assert.equal(res.status, 201);
  assert.equal(body.data.session_id, 'new-session');
});

test('GET /questions: 400 sem sessão, 404 inexistente, 410 concluída (RN013)', async () => {
  assert.equal((await call('GET', '/api/v1/questions')).status, 400);
  assert.equal((await call('GET', '/api/v1/questions?session_id=ghost')).status, 404);
  const gone = await call('GET', '/api/v1/questions?session_id=done');
  assert.equal(gone.status, 410);
  assert.equal(gone.body.error.code, 'GONE');
});

test('GET /questions serve o lote na ordem da sessão e limita count a 20', async () => {
  const { status, body } = await call('GET', '/api/v1/questions?session_id=active&count=999');
  assert.equal(status, 200);
  assert.deepEqual(body.data.questions.map(q => q.id), [1, 2, 101]);
  assert.equal(body.data.can_analyze, false);
});

// ── respostas ───────────────────────────────────────────────────────────────

test('POST /answer valida obrigatoriedade e tipo antes de tocar o banco', async () => {
  const missing = await call('POST', '/api/v1/answer', { session_id: 'active' });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error.message, "Field 'question_id' is required.");

  const wrongType = await call('POST', '/api/v1/answer', { session_id: 'active', question_id: '1' });
  assert.equal(wrongType.body.error.message, "Field 'question_id' must be of type number.");
  assert.equal(db.answers.length, 0);
});

test('POST /answer grava (201), recusa duplicata (409) e recusa skip objetivo (400)', async () => {
  const ok = await call('POST', '/api/v1/answer', { session_id: 'active', question_id: 1, alternative_id: 11 });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.progress.objective_answered, 1);

  const dup = await call('POST', '/api/v1/answer', { session_id: 'active', question_id: 1, alternative_id: 11 });
  assert.equal(dup.status, 409);

  const skip = await call('POST', '/api/v1/answer', { session_id: 'active', question_id: 2 });
  assert.equal(skip.status, 400);
  assert.equal(skip.body.error.message, 'Objective (BFI-2-S) questions cannot be skipped.');
});

test('POST /answer recusa alternativa de outra pergunta (400)', async () => {
  const res = await call('POST', '/api/v1/answer', { session_id: 'active', question_id: 1, alternative_id: 21 });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('POST /answer/undo: 404 sem respostas; depois desfaz a última', async () => {
  assert.equal((await call('POST', '/api/v1/answer/undo', { session_id: 'active' })).status, 404);
  await call('POST', '/api/v1/answer', { session_id: 'active', question_id: 1, alternative_id: 11 });
  const undo = await call('POST', '/api/v1/answer/undo', { session_id: 'active' });
  assert.equal(undo.status, 200);
  assert.equal(undo.body.data.undone_question_id, 1);
});

// ── análise e resultado ─────────────────────────────────────────────────────

test('POST /analyze com respostas insuficientes → 422 INSUFFICIENT_DATA', async () => {
  const res = await call('POST', '/api/v1/analyze', { session_id: 'active' });
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'INSUFFICIENT_DATA');
});

test('GET /result/:id → 404 sem resultado; 200 com perfil, arquétipos e orçamento', async () => {
  const missing = await call('GET', '/api/v1/result/active');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, 'RESULT_NOT_FOUND');

  db.result = RESULT_ROW;
  const { status, body } = await call('GET', '/api/v1/result/fresh-session');
  assert.equal(status, 200);
  assert.equal(body.data.profile.dimensions[0].level, 'alto');
  assert.equal(body.data.profile.archetype.id, 'near');
  assert.equal(body.data.profile.anti_archetype.id, 'far');
  assert.deepEqual(body.data._regen, { used: 0, remaining: 3, limit: 3 });
});

test('GET /result/:id/review agrupa as objetivas por traço', async () => {
  db.answerRows = [
    { kind: 'objective', trait: 'O', question_id: 1 },
    { kind: 'objective', trait: 'O', question_id: 2 },
    { kind: 'objective', trait: 'N', question_id: 3 },
    { kind: 'interpretative', trait: null, question_id: 101 },
  ];
  const { body } = await call('GET', '/api/v1/result/active/review');
  assert.deepEqual(body.data.totals, { answered: 4, objective: 3, interpretative: 1 });
  assert.deepEqual(body.data.by_trait.O.map(r => r.question_id), [1, 2]);
  assert.deepEqual(body.data.by_trait.C, []);
  assert.equal(body.data.interpretative[0].question_id, 101);
});

// ── regeneração e detalhamento ──────────────────────────────────────────────

test('POST /interpret: 400 sem sessão, 404 sem resultado, 503 com IA fora', async () => {
  assert.equal((await call('POST', '/api/v1/interpret', {})).body.error.code, 'MISSING_SESSION_ID');
  assert.equal((await call('POST', '/api/v1/interpret', { session_id: 'no-result' })).status, 404);

  db.result = RESULT_ROW;
  db.llm = null;
  const down = await call('POST', '/api/v1/interpret', { session_id: 'llm-down' });
  assert.equal(down.status, 503);
  assert.equal(down.body.error.code, 'LLM_UNAVAILABLE');
});

test('POST /interpret acumula referências, preserva o texto e persiste o resultado', async () => {
  db.result = RESULT_ROW;
  const { status, body } = await call('POST', '/api/v1/interpret', { session_id: 'regen-ok' });

  assert.equal(status, 200);
  const merged = body.data.llm_interpretation;
  assert.equal(merged.interpretacao, 'original');
  assert.equal(merged.vibe_resumo, 'vibe');
  assert.deepEqual(merged.referencias.map(r => r.nome), ['Arendt', 'Feynman']);
  // O que foi persistido é exatamente o que o cliente recebeu.
  assert.deepEqual(JSON.parse(JSON.stringify(db.persistedInterpretation)), merged);
  assert.deepEqual(body.data._regen, { remaining: 2, limit: 3 });
});

test('POST /interpret: a 4ª regeneração da mesma sessão → 429', async () => {
  db.result = RESULT_ROW;
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await call('POST', '/api/v1/interpret', { session_id: 'regen-limit' })).status, 200);
  }
  const blocked = await call('POST', '/api/v1/interpret', { session_id: 'regen-limit' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, 'REGEN_LIMIT_REACHED');
});

test('POST /interpret/reference-detail valida a referência antes de chamar a IA', async () => {
  const codes = [];
  for (const body of [{}, { session_id: 's' }, { session_id: 's', reference: 'x' }, { session_id: 's', reference: { nome: 3 } }]) {
    codes.push((await call('POST', '/api/v1/interpret/reference-detail', body)).body.error.code);
  }
  assert.deepEqual(codes, ['MISSING_SESSION_ID', 'MISSING_REFERENCE', 'MISSING_REFERENCE', 'MISSING_REFERENCE_NAME']);
});

test('POST /interpret/reference-detail: 200 com detalhe; 503 com IA fora', async () => {
  db.result = RESULT_ROW;
  const ok = await call('POST', '/api/v1/interpret/reference-detail', { session_id: 's', reference: { nome: 'Arendt' } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.data, { session_id: 's', reference_detail: { resumo: 'detalhe' } });

  db.detail = null;
  const down = await call('POST', '/api/v1/interpret/reference-detail', { session_id: 's', reference: { nome: 'Arendt' } });
  assert.equal(down.status, 503);
});
