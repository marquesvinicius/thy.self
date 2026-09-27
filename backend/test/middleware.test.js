import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

// Requer `--experimental-test-module-mocks` (já incluso no npm test).
let sessionFixture = null;
const lookups = [];
mock.module('../src/database/queries/session.queries.js', {
  namedExports: {
    getSessionById: async id => {
      lookups.push(id);
      return sessionFixture;
    },
  },
});
const logged = [];
mock.module('../src/utils/logger.js', {
  namedExports: {
    logger: { error: (message, meta) => logged.push({ message, meta }), warn() {}, info() {}, debug() {} },
  },
});

const { validateRequest } = await import('../src/middleware/validateRequest.js');
const { sessionGuard } = await import('../src/middleware/sessionGuard.js');
const { errorHandler } = await import('../src/middleware/errorHandler.js');
const { AppError } = await import('../src/utils/AppError.js');

/** Executa um middleware e devolve o que ele passou para `next`. */
async function run(middleware, req) {
  let forwarded = 'next-not-called';
  await middleware(req, {}, err => { forwarded = err; });
  return forwarded;
}

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

// ── validateRequest ─────────────────────────────────────────────────────────

const answerSchema = {
  session_id: { required: true, type: 'string' },
  question_id: { required: true, type: 'number' },
  note: { required: false, type: 'string', maxLength: 5 },
};

test('validateRequest aceita corpo válido e chama next() sem erro', async () => {
  const err = await run(validateRequest(answerSchema), {
    body: { session_id: 'abc', question_id: 3, note: '12345' },
  });
  assert.equal(err, undefined);
});

test('validateRequest trata undefined, null e "" como ausentes', async () => {
  for (const missing of [undefined, null, '']) {
    const err = await run(validateRequest(answerSchema), {
      body: { session_id: missing, question_id: 1 },
    });
    assert.ok(err instanceof AppError);
    assert.equal(err.statusCode, 400);
    assert.equal(err.code, 'VALIDATION_ERROR');
    assert.equal(err.message, "Field 'session_id' is required.");
  }
});

test('validateRequest não exige campo opcional ausente', async () => {
  const err = await run(validateRequest(answerSchema), {
    body: { session_id: 'abc', question_id: 1 },
  });
  assert.equal(err, undefined);
});

test('validateRequest rejeita tipo errado, inclusive em campo opcional presente', async () => {
  const err = await run(validateRequest(answerSchema), {
    body: { session_id: 'abc', question_id: '1', note: 7 },
  });
  assert.equal(
    err.message,
    "Field 'question_id' must be of type number. Field 'note' must be of type string."
  );
});

test('validateRequest aplica maxLength no limite exato (5 passa, 6 não)', async () => {
  const ok = await run(validateRequest(answerSchema), {
    body: { session_id: 'a', question_id: 1, note: '12345' },
  });
  const tooLong = await run(validateRequest(answerSchema), {
    body: { session_id: 'a', question_id: 1, note: '123456' },
  });
  assert.equal(ok, undefined);
  assert.equal(tooLong.message, "Field 'note' must be 5 characters or fewer.");
});

test('validateRequest acumula todos os erros numa única mensagem', async () => {
  const err = await run(validateRequest(answerSchema), { body: {} });
  assert.equal(
    err.message,
    "Field 'session_id' is required. Field 'question_id' is required."
  );
});

test('validateRequest responde 400 (não 500) quando a requisição não tem corpo JSON', async () => {
  // Express 5: sem Content-Type JSON, req.body fica undefined.
  const err = await run(validateRequest(answerSchema), { body: undefined });
  assert.equal(err.statusCode, 400);
});

// ── sessionGuard ────────────────────────────────────────────────────────────

test('sessionGuard exige session_id (400) sem consultar o banco', async () => {
  lookups.length = 0;
  for (const req of [{ body: {}, query: {} }, { body: {} }, {}]) {
    const err = await run(sessionGuard, req);
    assert.equal(err.statusCode, 400);
    assert.equal(err.code, 'VALIDATION_ERROR');
    assert.equal(err.message, 'session_id is required.');
  }
  assert.equal(lookups.length, 0);
});

const SID_BODY = '11111111-1111-4111-8111-111111111111';
const SID_QUERY = '22222222-2222-4222-8222-222222222222';

test('sessionGuard rejeita identificador que não é UUID sem consultar o banco', async () => {
  lookups.length = 0;
  const err = await run(sessionGuard, { body: { session_id: 'from-body' } });
  assert.equal(err.statusCode, 400);
  assert.equal(err.code, 'VALIDATION_ERROR');
  assert.equal(lookups.length, 0);
});

test('sessionGuard lê session_id do corpo ou da query string', async () => {
  sessionFixture = { id: SID_BODY, status: 'active' };
  lookups.length = 0;
  await run(sessionGuard, { body: { session_id: SID_BODY }, query: {} });
  await run(sessionGuard, { query: { session_id: SID_QUERY } });
  assert.deepEqual(lookups, [SID_BODY, SID_QUERY]);
});

test('sessionGuard responde 404 para sessão inexistente', async () => {
  sessionFixture = null;
  const err = await run(sessionGuard, { body: { session_id: SID_BODY } });
  assert.equal(err.statusCode, 404);
  assert.equal(err.code, 'NOT_FOUND');
  assert.equal(err.message, 'Session not found.');
});

test('sessionGuard responde 410 para sessão já concluída (RN013)', async () => {
  sessionFixture = { id: SID_BODY, status: 'completed' };
  const err = await run(sessionGuard, { body: { session_id: SID_BODY } });
  assert.equal(err.statusCode, 410);
  assert.equal(err.code, 'GONE');
  assert.equal(err.message, 'Session already completed.');
});

test('sessionGuard anexa a sessão ativa à requisição e segue', async () => {
  sessionFixture = { id: SID_BODY, status: 'active' };
  const req = { body: { session_id: SID_BODY } };
  const err = await run(sessionGuard, req);
  assert.equal(err, undefined);
  assert.equal(req.session, sessionFixture);
});

// ── errorHandler ────────────────────────────────────────────────────────────

test('errorHandler preserva status e código de um AppError', () => {
  const res = fakeRes();
  errorHandler(new AppError('Não achei.', 404, 'NOT_FOUND'), { path: '/x' }, res, () => {});
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { success: false, error: { message: 'Não achei.', code: 'NOT_FOUND' } });
});

test('RNF015/016: errorHandler registra mensagem, stack e caminho em log estruturado', () => {
  logged.length = 0;
  const err = new AppError('Não achei.', 404, 'NOT_FOUND');
  errorHandler(err, { path: '/api/v1/result/x' }, fakeRes(), () => {});
  assert.deepEqual(logged, [{ message: 'Não achei.', meta: { stack: err.stack, path: '/api/v1/result/x' } }]);
});

test('AppError sem status/código explícitos vira 400 ERROR', () => {
  const err = new AppError('x');
  assert.equal(err.statusCode, 400);
  assert.equal(err.code, 'ERROR');
  assert.ok(err instanceof Error);
});

test('errorHandler esconde a mensagem de erros inesperados (500 genérico)', () => {
  const res = fakeRes();
  errorHandler(new Error('senha do banco vazou aqui'), { path: '/x' }, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    error: { message: 'Internal server error', code: 'INTERNAL_ERROR' },
  });
});
