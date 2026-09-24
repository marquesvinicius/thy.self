import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';
import { createFakeSupabase, NO_ROWS } from './support/fake-supabase.js';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

// Requer `--experimental-test-module-mocks` (já incluso no npm test).
const fake = createFakeSupabase();
mock.module('../src/config/supabase.js', { namedExports: { supabase: fake.client } });
mock.module('../src/utils/logger.js', {
  namedExports: { logger: { error() {}, warn() {}, info() {}, debug() {} } },
});

const sessions = await import('../src/database/queries/session.queries.js');
const questions = await import('../src/database/queries/question.queries.js');
const answers = await import('../src/database/queries/answer.queries.js');
const results = await import('../src/database/queries/result.queries.js');
const archetypes = await import('../src/services/archetype.service.js');

beforeEach(() => fake.reset());

const boom = { code: '08006', message: 'connection failure' };

test('"nenhuma linha" (PGRST116) vira null nas buscas por id; outros erros sobem', async () => {
  const lookups = [
    () => sessions.getSessionById('s'),
    () => questions.getQuestionKindById(1),
    () => questions.getAlternativeWithImpacts(1),
    () => results.getResultBySessionId('s'),
    () => results.updateResultInterpretation('s', {}),
  ];
  for (const lookup of lookups) {
    fake.respond({ data: null, error: NO_ROWS });
    assert.equal(await lookup(), null);

    fake.respond({ data: null, error: boom });
    await assert.rejects(lookup(), err => err === boom);
  }
});

test('escritas e listagens propagam qualquer erro do banco', async () => {
  const writes = [
    () => sessions.createSession(null, []),
    () => sessions.updateSessionQuestionOrder('s', []),
    () => sessions.updateSessionStatus('s', 'active'),
    () => questions.getAllActiveQuestions(),
    () => questions.getQuestionsWithAlternatives([1]),
    () => answers.createAnswer('s', 1, 2),
    () => answers.getAnswersBySessionId('s'),
    () => answers.getAnsweredQuestionIds('s'),
    () => answers.countAnswersBySessionId('s'),
    () => answers.countObjectiveAnswersBySessionId('s'),
    () => answers.getInterpretativeSignals('s'),
    () => results.createResult('s', { scores: {} }),
  ];
  for (const write of writes) {
    fake.respond({ data: null, error: boom });
    await assert.rejects(write(), err => err === boom);
  }
});

test('sessão criada sem apelido grava null, com a ordem materializada', async () => {
  fake.respond({ data: { id: 's1' }, error: null });
  await sessions.createSession('', [3, 1, 2]);
  const [, row] = fake.calls(0).find(([m]) => m === 'insert');
  assert.deepEqual(row, { nickname: null, question_order: [3, 1, 2] });
});

test('concluir a sessão carimba completed_at; outros status não', async () => {
  fake.respond({ data: {}, error: null }, { data: {}, error: null });
  await sessions.updateSessionStatus('s', 'completed');
  await sessions.updateSessionStatus('s', 'active');

  const completed = fake.calls(0).find(([m]) => m === 'update')[1];
  const active = fake.calls(1).find(([m]) => m === 'update')[1];
  assert.equal(completed.status, 'completed');
  assert.ok(!Number.isNaN(Date.parse(completed.completed_at)));
  assert.deepEqual(active, { status: 'active' });
});

test('resultado é gravado com upsert por sessão e colunas vindas do perfil', async () => {
  fake.respond({ data: { id: 'r' }, error: null });
  const profile = {
    scores: { O: 1, C: 2, E: 3, A: 4, N: 5 }, answerCount: 30, rawImpacts: { O: -12 },
  };
  await results.createResult('s', profile, { O: {} }, { vibe_resumo: 'v' });

  const [, row, options] = fake.calls(0).find(([m]) => m === 'upsert');
  assert.deepEqual(row, {
    session_id: 's', score_o: 1, score_c: 2, score_e: 3, score_a: 4, score_n: 5,
    answer_count: 30, raw_impacts: { O: -12 }, consistency: { O: {} }, llm_interpretation: { vibe_resumo: 'v' },
  });
  assert.deepEqual(options, { onConflict: 'session_id' });
});

test('contagem de prontidão considera só itens objetivos (Dual-Core) e trata null como 0', async () => {
  fake.respond({ count: null, error: null });
  assert.equal(await answers.countObjectiveAnswersBySessionId('s'), 0);
  assert.ok(fake.calls(0).some(([m, col, val]) => m === 'eq' && col === 'questions.kind' && val === 'objective'));
});

test('sinais para a IA vêm só de respostas interpretativas, já mapeados', async () => {
  fake.respond({
    data: [
      { user_observation: null, alternatives: { text: 'Conto' }, questions: { type: 'multiple_choice', question_categories: { slug: 'moral_dilemma' } } },
      { user_observation: null, alternatives: null, questions: { type: 'multiple_choice' } }, // pulo
    ],
    error: null,
  });
  const signals = await answers.getInterpretativeSignals('s');

  assert.ok(fake.calls(0).some(([m, col, val]) => m === 'eq' && col === 'questions.kind' && val === 'interpretative'));
  assert.deepEqual(signals.map(s => [s.category_slug, s.alternative_text]), [['moral_dilemma', 'Conto']]);
});

test('respostas saem em ordem cronológica (a hesitação depende disso)', async () => {
  fake.respond({ data: [], error: null });
  await answers.getAnswersBySessionId('s');
  assert.ok(fake.calls(0).some(([m, col, opt]) => m === 'order' && col === 'answered_at' && opt.ascending === true));
});

test('revisão de respostas usa o mapper do motor sobre as respostas da sessão', async () => {
  fake.respond({ data: [{ id: 'a', questions: { kind: 'objective', trait: 'E', reverse_key: false }, alternatives: { impact_e: -1 } }], error: null });
  const [review] = await answers.getAnswerReviewBySessionId('s');
  assert.deepEqual(review.contribution, { trait: 'E', delta: -1 });
});

test('desfazer: apaga a resposta MAIS RECENTE e devolve a pergunta liberada', async () => {
  fake.respond(
    { data: [{ id: 'ans-9', question_id: 42, answered_at: 't9' }], error: null },
    { error: null },
  );
  assert.deepEqual(await answers.deleteLastAnswer('s'), { question_id: 42, answered_at: 't9' });

  const select = fake.calls(0);
  assert.ok(select.some(([m, col, opt]) => m === 'order' && col === 'answered_at' && opt.ascending === false));
  assert.ok(select.some(([m, n]) => m === 'limit' && n === 1));
  assert.ok(fake.calls(1).some(([m, col, val]) => m === 'eq' && col === 'id' && val === 'ans-9'));
});

test('desfazer sem respostas → null; erro ao apagar sobe', async () => {
  fake.respond({ data: [], error: null });
  assert.equal(await answers.deleteLastAnswer('s'), null);

  fake.respond({ data: [{ id: 'x', question_id: 1 }], error: null }, { error: boom });
  await assert.rejects(answers.deleteLastAnswer('s'), err => err === boom);
});

test('ids respondidos e contagem total', async () => {
  fake.respond({ data: [{ question_id: 3 }, { question_id: 1 }], error: null }, { count: 7, error: null });
  assert.deepEqual(await answers.getAnsweredQuestionIds('s'), [3, 1]);
  assert.equal(await answers.countAnswersBySessionId('s'), 7);
});

test('arquétipo: escores OCEAN viram argumentos da função no Postgres', async () => {
  fake.respond({ data: [{ id: 'a1', name: 'Hermione' }, { id: 'a2' }], error: null });
  const found = await archetypes.findClosestArchetype({ O: 70, C: 60, E: 30, A: 55, N: 20 });

  assert.deepEqual(found, { id: 'a1', name: 'Hermione' });
  assert.deepEqual(fake.log[0], {
    rpc: 'find_closest_archetype',
    args: { user_o: 70, user_c: 60, user_e: 30, user_a: 55, user_n: 20 },
  });
});

test('arquétipo: sem resultado ou com erro degrada para null (anti-arquétipo exige migration_008)', async () => {
  fake.respond({ data: [], error: null }, { data: null, error: { message: 'function does not exist' } });
  assert.equal(await archetypes.findClosestArchetype({}), null);
  assert.equal(await archetypes.findFarthestArchetype({}), null);
  assert.equal(fake.log[1].rpc, 'find_farthest_archetype');
});
