import assert from 'node:assert/strict';
import test, { after, before, beforeEach, mock } from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

// Contrato HTTP da API sobre o app Express REAL: roteamento, validação,
// sessionGuard, controllers, services e errorHandler rodam de verdade.
// Só a borda de I/O (queries do Supabase, RPC de arquétipo, LLM) é simulada.
// Requer `--experimental-test-module-mocks` (já incluso no npm test).

const SID = {
  active: '11111111-1111-4111-8111-111111111111',
  done: '22222222-2222-4222-8222-222222222222',
  ghost: '33333333-3333-4333-8333-333333333333',
  leak: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  noResult: '55555555-5555-4555-8555-555555555555',
  llmDown: '66666666-6666-4666-8666-666666666666',
  regenArgs: '77777777-7777-4777-8777-777777777777',
  regenRestart: '88888888-8888-4888-8888-888888888888',
  regenEmpty: '99999999-9999-4999-8999-999999999999',
  regenPersistFail: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  regenOk: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  regenLimit: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  detail: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  detailOk: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  detailLimit: '13131313-1313-4131-8131-131313131313',
  fresh: '12121212-1212-4121-8121-121212121212',
};

const db = {};
function resetDb() {
  Object.assign(db, {
    sessions: new Map([
      [SID.active, { id: SID.active, status: 'active', question_order: [1, 2, 101] }],
      [SID.done, { id: SID.done, status: 'completed', question_order: [] }],
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
    failPersist: null,
    failResultQuery: null,
    llmCalls: [],
    detailCalls: [],
    lensCalls: [],
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
    getSessionById: async id => db.sessions.get(id) ?? null,
    updateSessionQuestionOrder: async () => ({}),
    updateSessionStatus: async (id, status) => ({ id, status }),
  },
});
mock.module('../src/database/queries/question.queries.js', {
  namedExports: {
    getAllActiveQuestions: async () => { maybeFail(); return db.questions; },
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
    getResultBySessionId: async () => {
      if (db.failResultQuery) throw db.failResultQuery;
      return db.result;
    },
    createResult: async () => ({}),
    updateResultInterpretation: async (_id, interpretation) => {
      if (db.failPersist) throw db.failPersist;
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
    generateInterpretation: async (...args) => { db.llmCalls.push(args); return db.llm; },
    generateReferenceDetail: async (...args) => { db.detailCalls.push(args); return db.detail; },
    getRegenLens: used => { db.lensCalls.push(used); return { id: `lens-${used}` }; },
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

test('respostas de sucesso usam o envelope { success: true, data }', async () => {
  const { body } = await call('GET', `/api/v1/questions?session_id=${SID.active}`);
  assert.equal(body.success, true);
  assert.ok(body.data);
});

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
  assert.equal(body.error.code, 'ERROR', 'erro do parser não traz código próprio');
});

test('erro inesperado do banco → 500 genérico, sem vazar a mensagem interna', async () => {
  const leak = () => new Error('password=hunter2 connection refused');
  const attempts = [
    () => { db.failNextQuery = leak(); return call('GET', `/api/v1/questions?session_id=${SID.active}`); },
    () => { db.failNextQuery = leak(); return call('POST', '/api/v1/session', {}); },
    () => { db.failResultQuery = leak(); return call('GET', `/api/v1/result/${SID.leak}`); },
    () => { db.failResultQuery = null; db.answerRows = null; return call('GET', `/api/v1/result/${SID.leak}/review`); },
  ];
  for (const attempt of attempts) {
    const { status, body } = await attempt();
    assert.equal(status, 500);
    assert.deepEqual(body.error, { message: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
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
  assert.equal((await call('GET', `/api/v1/questions?session_id=${SID.ghost}`)).status, 404);
  const gone = await call('GET', `/api/v1/questions?session_id=${SID.done}`);
  assert.equal(gone.status, 410);
  assert.equal(gone.body.error.code, 'GONE');
});

test('GET /questions serve o lote na ordem da sessão', async () => {
  const { status, body } = await call('GET', `/api/v1/questions?session_id=${SID.active}`);
  assert.equal(status, 200);
  assert.deepEqual(body.data.questions.map(q => q.id), [1, 2, 101]);
  assert.equal(body.data.can_analyze, false);
});

test('GET /questions: count padrão 10, teto 20, inválido volta ao padrão', async () => {
  db.questions = Array.from({ length: 25 }, (_, i) => ({
    id: i + 1, kind: 'objective', trait: 'O', type: 'multiple_choice', text: `Q${i + 1}`, alternatives: [],
  }));
  db.sessions.get(SID.active).question_order = db.questions.map(q => q.id);
  const size = async qs => (await call('GET', `/api/v1/questions?session_id=${SID.active}${qs}`)).body.data.questions.length;

  assert.equal(await size(''), 10);
  assert.equal(await size('&count=3'), 3);
  assert.equal(await size('&count=999'), 20);
  assert.equal(await size('&count=abc'), 10, 'antes: NaN devolvia as 25');
  assert.equal(await size('&count=0'), 10);
  assert.equal(await size('&count=-5'), 10);
});

test('GET /questions repassa o teto narrativo da versão curta', async () => {
  const { body } = await call('GET', `/api/v1/questions?session_id=${SID.active}&narrative_limit=0`);
  assert.deepEqual(body.data.questions.map(q => q.id), [1, 2]);
  assert.equal(body.data.stage_progress.interpretative_total, 0);
});

// ── respostas ───────────────────────────────────────────────────────────────

test('POST /answer valida obrigatoriedade e tipo antes de tocar o banco', async () => {
  const missing = await call('POST', '/api/v1/answer', { session_id: SID.active });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error.message, "Field 'question_id' is required.");

  const wrongType = await call('POST', '/api/v1/answer', { session_id: SID.active, question_id: '1' });
  assert.equal(wrongType.body.error.message, "Field 'question_id' must be of type number.");
  assert.equal(db.answers.length, 0);
});

test('POST /answer grava (201), recusa duplicata (409) e recusa skip objetivo (400)', async () => {
  const ok = await call('POST', '/api/v1/answer', { session_id: SID.active, question_id: 1, alternative_id: 11 });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.progress.objective_answered, 1);

  const dup = await call('POST', '/api/v1/answer', { session_id: SID.active, question_id: 1, alternative_id: 11 });
  assert.equal(dup.status, 409);

  const skip = await call('POST', '/api/v1/answer', { session_id: SID.active, question_id: 2 });
  assert.equal(skip.status, 400);
  assert.equal(skip.body.error.message, 'Objective (BFI-2-S) questions cannot be skipped.');
});

test('POST /answer recusa alternativa de outra pergunta (400)', async () => {
  const res = await call('POST', '/api/v1/answer', { session_id: SID.active, question_id: 1, alternative_id: 21 });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('POST /answer/undo: 404 sem respostas; depois desfaz a última', async () => {
  assert.equal((await call('POST', '/api/v1/answer/undo', { session_id: SID.active })).status, 404);
  await call('POST', '/api/v1/answer', { session_id: SID.active, question_id: 1, alternative_id: 11 });
  const undo = await call('POST', '/api/v1/answer/undo', { session_id: SID.active });
  assert.equal(undo.status, 200);
  assert.equal(undo.body.data.undone_question_id, 1);
});

// ── análise e resultado ─────────────────────────────────────────────────────

test('POST /analyze com respostas insuficientes → 422 INSUFFICIENT_DATA', async () => {
  const res = await call('POST', '/api/v1/analyze', { session_id: SID.active });
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'INSUFFICIENT_DATA');
});

test('GET /result/:id → 404 sem resultado; 200 com perfil, arquétipos e orçamento', async () => {
  const missing = await call('GET', `/api/v1/result/${SID.active}`);
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body.error, { message: 'Result not found', code: 'RESULT_NOT_FOUND' });

  db.result = RESULT_ROW;
  const { status, body } = await call('GET', `/api/v1/result/${SID.fresh}`);
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
    { kind: 'objective', trait: 'X', question_id: 4 },  // traço inválido: fora dos grupos
    { kind: 'objective', trait: null, question_id: 5 },
    { kind: 'interpretative', trait: null, question_id: 101 },
  ];
  const { body } = await call('GET', `/api/v1/result/${SID.active}/review`);
  assert.deepEqual(body.data.totals, { answered: 6, objective: 5, interpretative: 1 });
  const ids = rows => rows.map(r => r.question_id);
  assert.deepEqual(
    Object.fromEntries(Object.entries(body.data.by_trait).map(([k, rows]) => [k, ids(rows)])),
    { O: [1, 2], C: [], E: [], A: [], N: [3] }
  );
  assert.equal(body.data.interpretative[0].question_id, 101);
});

// ── regeneração e detalhamento ──────────────────────────────────────────────

test('POST /interpret: 400 sem sessão, 404 sem resultado, 503 com IA fora', async () => {
  assert.deepEqual((await call('POST', '/api/v1/interpret', {})).body.error,
    { message: 'session_id is required', code: 'MISSING_SESSION_ID' });
  const noResult = await call('POST', '/api/v1/interpret', { session_id: SID.noResult });
  assert.equal(noResult.status, 404);
  assert.deepEqual(noResult.body.error,
    { message: 'No result found for this session. Run /analyze first.', code: 'RESULT_NOT_FOUND' });

  db.result = RESULT_ROW;
  db.llm = null;
  const down = await call('POST', '/api/v1/interpret', { session_id: SID.llmDown });
  assert.equal(down.status, 503);
  assert.deepEqual(down.body.error,
    { message: 'Interpretação indisponível. Limite diário pode ter sido atingido.', code: 'LLM_UNAVAILABLE' });
});

test('POST /interpret entrega à IA o perfil reconstruído, as exclusões e a lente', async () => {
  db.result = { ...RESULT_ROW, consistency: { O: { tension: true, stddev: 1.5 } } };
  await call('POST', '/api/v1/interpret', { session_id: SID.regenArgs, exclude_reference_names: ['Chaplin'] });

  const [profile, consistency, , archetype, options] = db.llmCalls[0];
  assert.deepEqual(profile.scores, { O: 70, C: 50, E: 50, A: 50, N: 50 });
  // Mesma escala da primeira geração (antes: 'moderado-alto' só na regeneração).
  assert.equal(profile.dimensions.find(d => d.key === 'O').level, 'alto');
  assert.deepEqual(consistency, { O: { tension: true, stddev: 1.5 } });
  assert.equal(archetype.id, 'near');
  assert.equal(options.temperature, 1.2);
  assert.deepEqual(options.excludedReferenceNames, ['Chaplin', 'Arendt']);
  assert.deepEqual(options.excludedCategories, ['Filósofa']);
  assert.deepEqual(options.regenLens, { id: 'lens-0' });
});

test('POST /interpret: lente estimada pelas referências persistidas após restart', async () => {
  const nine = Array.from({ length: 9 }, (_, i) => ({ nome: `Ref ${i}` }));
  db.result = { ...RESULT_ROW, llm_interpretation: { ...RESULT_ROW.llm_interpretation, referencias: nine } };
  await call('POST', '/api/v1/interpret', { session_id: SID.regenRestart });
  assert.deepEqual(db.lensCalls, [2]);

  // Resultado sem interpretação persistida: tudo parte do zero, sem erro.
  db.lensCalls.length = 0;
  db.result = { ...RESULT_ROW, llm_interpretation: null };
  const fresh = await call('POST', '/api/v1/interpret', { session_id: SID.regenEmpty });
  assert.equal(fresh.status, 200);
  assert.deepEqual(db.lensCalls, [0]);
  assert.deepEqual(fresh.body.data.llm_interpretation.referencias, [{ nome: 'Feynman' }]);
});

test('POST /interpret: falha ao persistir não derruba a resposta ao usuário', async () => {
  db.result = RESULT_ROW;
  db.failPersist = new Error('db down');
  const res = await call('POST', '/api/v1/interpret', { session_id: SID.regenPersistFail });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.llm_interpretation.referencias.map(r => r.nome), ['Arendt', 'Feynman']);
});

test('POST /interpret acumula referências, preserva o texto e persiste o resultado', async () => {
  db.result = RESULT_ROW;
  const { status, body } = await call('POST', '/api/v1/interpret', { session_id: SID.regenOk });

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
    assert.equal((await call('POST', '/api/v1/interpret', { session_id: SID.regenLimit })).status, 200);
  }
  const blocked = await call('POST', '/api/v1/interpret', { session_id: SID.regenLimit });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, 'REGEN_LIMIT_REACHED');
});

test('POST /interpret/reference-detail valida a referência antes de chamar a IA', async () => {
  const codes = [];
  for (const body of [{}, { session_id: SID.detail }, { session_id: SID.detail, reference: 'x' }, { session_id: SID.detail, reference: { nome: 3 } }]) {
    codes.push((await call('POST', '/api/v1/interpret/reference-detail', body)).body.error.code);
  }
  assert.deepEqual(codes, ['MISSING_SESSION_ID', 'MISSING_REFERENCE', 'MISSING_REFERENCE', 'MISSING_REFERENCE_NAME']);
  const messages = [];
  for (const body of [{}, { session_id: SID.detail }, { session_id: SID.detail, reference: {} }]) {
    messages.push((await call('POST', '/api/v1/interpret/reference-detail', body)).body.error.message);
  }
  assert.deepEqual(messages, ['session_id is required', 'reference is required', 'reference.nome is required']);
  assert.equal(db.detailCalls.length, 0);
});

test('POST /interpret/reference-detail informa à IA o texto já entregue e as outras referências', async () => {
  db.result = {
    ...RESULT_ROW,
    llm_interpretation: {
      interpretacao: 'texto entregue',
      referencias: [
        { nome: 'Arendt', motivo: 'pensa só', categoria: 'Filósofa' },
        { nome: 'Feynman', motivo: 'curioso' },
        null,
        { motivo: 'sem nome' },
      ],
    },
  };
  await call('POST', '/api/v1/interpret/reference-detail', {
    session_id: SID.detail, reference: { nome: 'Feynman', categoria: 'Cientista', motivo: 'm', extra: 'ignorado' },
  });

  const [, , , , reference, options] = db.detailCalls[0];
  assert.deepEqual(reference, { nome: 'Feynman', categoria: 'Cientista', motivo: 'm' });
  assert.deepEqual(options, {
    priorInterpretation: 'texto entregue',
    otherReferences: [{ nome: 'Arendt', motivo: 'pensa só' }],
  });

  db.result = { ...RESULT_ROW, llm_interpretation: null };
  await call('POST', '/api/v1/interpret/reference-detail', { session_id: SID.detail, reference: { nome: 'X' } });
  assert.deepEqual(db.detailCalls[1][5], { priorInterpretation: '', otherReferences: [] });
});

test('POST /interpret/reference-detail: o 7º detalhamento da mesma sessão → 429', async () => {
  // Cada detalhamento gasta uma chamada ao LLM; sem teto por sessão, uma
  // única sessão poderia esgotar o orçamento diário de todos (RF005).
  db.result = RESULT_ROW;
  const body = { session_id: SID.detailLimit, reference: { nome: 'Arendt' } };
  for (let i = 0; i < 6; i += 1) {
    assert.equal((await call('POST', '/api/v1/interpret/reference-detail', body)).status, 200, `detalhamento ${i + 1}`);
  }
  const callsBefore = db.detailCalls.length;
  const blocked = await call('POST', '/api/v1/interpret/reference-detail', body);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, 'DETAIL_LIMIT_REACHED');
  assert.match(blocked.body.error.message, /6\/6/);
  assert.equal(db.detailCalls.length, callsBefore, 'bloqueado antes de chamar a IA');
});

test('identificador de sessão malformado → 400 antes de consultar o banco, em toda rota por id', async () => {
  // Sem essa checagem, o Postgres recusa o texto como UUID (erro 22P02) e a
  // API responderia 500 — erro do usuário virando falha interna.
  db.result = RESULT_ROW;
  const bad = 'nao-e-um-uuid';
  const responses = [
    await call('GET', `/api/v1/result/${bad}`),
    await call('GET', `/api/v1/result/${bad}/review`),
    await call('POST', '/api/v1/interpret', { session_id: bad }),
    await call('POST', '/api/v1/interpret/reference-detail', { session_id: bad, reference: { nome: 'Arendt' } }),
  ];
  for (const res of responses) {
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error, { message: 'session_id must be a valid UUID', code: 'VALIDATION_ERROR' });
  }
  assert.equal(db.detailCalls.length, 0);
  assert.equal(db.llmCalls.length, 0);
});

test('POST /interpret/reference-detail: 200 com detalhe; 503 com IA fora', async () => {
  db.result = RESULT_ROW;
  const ok = await call('POST', '/api/v1/interpret/reference-detail', { session_id: SID.detailOk, reference: { nome: 'Arendt' } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.data, {
    session_id: SID.detailOk,
    reference_detail: { resumo: 'detalhe' },
    _detail: { remaining: 5, limit: 6 },
  });

  db.detail = null;
  const down = await call('POST', '/api/v1/interpret/reference-detail', { session_id: SID.detailOk, reference: { nome: 'Arendt' } });
  assert.equal(down.status, 503);
  assert.deepEqual(down.body.error,
    { message: 'Detalhamento indisponível. Limite diário pode ter sido atingido.', code: 'LLM_UNAVAILABLE' });
});
