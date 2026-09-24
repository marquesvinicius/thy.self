import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

// Requer `--experimental-test-module-mocks` (já incluso no npm test).
// Mockamos as camadas de I/O (queries, arquétipo, LLM); o motor de cálculo
// (BigFiveEngine, consistency, normalization) roda de verdade — é puro.

const calls = {
  createResult: [],
  updateSessionStatus: [],
  generateInterpretation: 0,
  llmArgs: null,
};
let savedRowFixture = { calculated_at: '2026-07-16T12:00:00.000Z' };

let answersFixture = [];
let existingResultFixture = null;
let llmFixture = null;

const SIGNALS = [{ category: 'interest', question: 'Q?', answer: 'A' }];
mock.module('../src/database/queries/answer.queries.js', {
  namedExports: {
    getAnswersBySessionId: async () => answersFixture,
    getInterpretativeSignals: async () => SIGNALS,
  },
});

mock.module('../src/database/queries/result.queries.js', {
  namedExports: {
    getResultBySessionId: async () => existingResultFixture,
    createResult: async (sessionId, profile, consistency, llm) => {
      calls.createResult.push({ sessionId, profile, consistency, llm });
      return savedRowFixture;
    },
  },
});

mock.module('../src/database/queries/session.queries.js', {
  namedExports: {
    updateSessionStatus: async (sessionId, status) => {
      calls.updateSessionStatus.push({ sessionId, status });
      return { id: sessionId, status };
    },
  },
});

mock.module('../src/services/archetype.service.js', {
  namedExports: {
    findClosestArchetype: async () => ({
      id: 'arch-1', name: 'Arquétipo Teste', universe: 'Testes', distance: 12.3,
    }),
    findFarthestArchetype: async () => ({
      id: 'arch-far', name: 'Anti Teste', universe: 'Testes', distance: 88.8,
    }),
  },
});

mock.module('../src/services/llm.service.js', {
  namedExports: {
    generateInterpretation: async (...args) => {
      calls.generateInterpretation += 1;
      calls.llmArgs = args;
      return llmFixture;
    },
  },
});

const { analyzeSession } = await import('../src/services/analyze.service.js');

function resetCalls() {
  calls.createResult = [];
  calls.updateSessionStatus = [];
  calls.generateInterpretation = 0;
  calls.llmArgs = null;
  savedRowFixture = { calculated_at: '2026-07-16T12:00:00.000Z' };
}

/** 30 respostas objetivas (6 por eixo), todas +1 → escore 75 em cada eixo. */
function thirtyObjectiveAnswers() {
  const answers = [];
  for (const trait of ['O', 'C', 'E', 'A', 'N']) {
    for (let i = 0; i < 6; i++) {
      answers.push({
        questions: { kind: 'objective', trait, reverse_key: false },
        alternatives: { [`impact_${trait.toLowerCase()}`]: 1 },
      });
    }
  }
  return answers;
}

test('retorna resultado persistido sem novo cálculo nem nova chamada LLM (idempotência)', async () => {
  resetCalls();
  existingResultFixture = {
    score_o: 70, score_c: 55, score_e: 40, score_a: 60, score_n: 30,
    answer_count: 30,
    calculated_at: '2026-07-01T10:00:00.000Z',
    consistency: null,
    llm_interpretation: { vibe_resumo: 'já existia' },
  };

  const result = await analyzeSession('sess-idem');

  assert.equal(result.profile.llm_interpretation.vibe_resumo, 'já existia');
  assert.deepEqual(result.profile.scores, { O: 70, C: 55, E: 40, A: 60, N: 30 });
  assert.equal(result.profile.calculated_at, '2026-07-01T10:00:00.000Z');
  assert.equal(result.profile.consistency, null);
  // Arquétipos não são persistidos: recomputados do escore salvo (RF005).
  assert.equal(result.profile.archetype.id, 'arch-1');
  assert.equal(result.profile.anti_archetype.id, 'arch-far');
  assert.equal(calls.generateInterpretation, 0);
  assert.equal(calls.createResult.length, 0);
  assert.equal(calls.updateSessionStatus.length, 0);
});

test('rejeita análise com menos de 30 respostas objetivas (INSUFFICIENT_DATA)', async () => {
  resetCalls();
  existingResultFixture = null;
  answersFixture = thirtyObjectiveAnswers().slice(0, 29);

  await assert.rejects(
    () => analyzeSession('sess-short'),
    {
      code: 'INSUFFICIENT_DATA',
      statusCode: 422,
      message: 'Not enough BFI-2-S answers. Current: 29, minimum: 30.',
    }
  );
  assert.equal(calls.createResult.length, 0);
});

test('interpretativas não completam o mínimo: 29 objetivas + 10 narrativas → 422', async () => {
  resetCalls();
  existingResultFixture = null;
  const narrative = Array.from({ length: 10 }, () => ({
    questions: { kind: 'interpretative', trait: null, reverse_key: false },
    alternatives: {},
  }));
  // Linha sem pergunta associada (join vazio) também não conta.
  answersFixture = [...thirtyObjectiveAnswers().slice(0, 29), ...narrative, { questions: null, alternatives: null }];

  await assert.rejects(() => analyzeSession('sess-narr'), { code: 'INSUFFICIENT_DATA' });
  assert.equal(calls.generateInterpretation, 0);
});

test('pipeline completo: calcula, persiste e marca a sessão como completed', async () => {
  resetCalls();
  existingResultFixture = null;
  answersFixture = thirtyObjectiveAnswers();
  llmFixture = { schema_version: '1.3.0', vibe_resumo: 'gerado agora' };

  const result = await analyzeSession('sess-full');

  // +1 em todos os itens → raw +6 por eixo → (6+12)/24 × 100 = 75
  for (const key of ['O', 'C', 'E', 'A', 'N']) {
    assert.equal(result.profile.scores[key], 75);
  }
  assert.equal(result.profile.answer_count, 30);
  assert.equal(result.profile.llm_interpretation.vibe_resumo, 'gerado agora');
  assert.equal(calls.generateInterpretation, 1);
  assert.equal(calls.createResult.length, 1);
  assert.deepEqual(calls.updateSessionStatus[0], { sessionId: 'sess-full', status: 'completed' });
});

test('LLM indisponível não bloqueia o resultado (graceful null)', async () => {
  resetCalls();
  existingResultFixture = null;
  answersFixture = thirtyObjectiveAnswers();
  llmFixture = null;

  const result = await analyzeSession('sess-nollm');

  assert.equal(result.profile.llm_interpretation, null);
  assert.equal(result.profile.scores.O, 75);
  // Resultado é persistido mesmo sem interpretação (RN: escores primeiro)
  assert.equal(calls.createResult.length, 1);
  assert.equal(calls.createResult[0].llm, null);
  assert.equal(calls.updateSessionStatus[0].status, 'completed');
});

test('resultado persistido sem llm_interpretation dispara recomputação', async () => {
  resetCalls();
  // Existe linha em results, mas sem interpretação — o service tenta de novo
  // (cobre o caso de análise anterior com LLM fora do ar).
  existingResultFixture = {
    score_o: 50, score_c: 50, score_e: 50, score_a: 50, score_n: 50,
    answer_count: 30,
    calculated_at: '2026-07-01T10:00:00.000Z',
    consistency: null,
    llm_interpretation: null,
  };
  answersFixture = thirtyObjectiveAnswers();
  llmFixture = { schema_version: '1.3.0', vibe_resumo: 'segunda tentativa' };

  const result = await analyzeSession('sess-retry');

  assert.equal(calls.generateInterpretation, 1);
  assert.equal(result.profile.llm_interpretation.vibe_resumo, 'segunda tentativa');
});

test('a IA recebe perfil, consistência, sinais, arquétipo e o estilo de resposta', async () => {
  resetCalls();
  existingResultFixture = null;
  answersFixture = thirtyObjectiveAnswers();
  llmFixture = { vibe_resumo: 'x' };

  const result = await analyzeSession('sess-args');

  const [profile, consistency, signals, archetype, options] = calls.llmArgs;
  assert.equal(profile.answerCount, 30);
  assert.deepEqual(consistency.O, { mean: 1, stddev: 0, tension: false, n: 6 });
  assert.equal(signals, SIGNALS);
  assert.equal(archetype.id, 'arch-1');
  assert.equal(options.antiArchetype.id, 'arch-far');
  assert.equal(options.responseStyle.answer_count, 30);
  assert.equal(options.responseStyle.agree_direct_rate, 1);

  // O que foi calculado é o que foi persistido e devolvido.
  assert.equal(calls.createResult[0].sessionId, 'sess-args');
  assert.equal(calls.createResult[0].consistency, consistency);
  assert.deepEqual(result.profile.consistency, consistency);
  assert.equal(result.profile.archetype.name, 'Arquétipo Teste');
  assert.equal(result.profile.anti_archetype.name, 'Anti Teste');
  assert.equal(result.profile.calculated_at, '2026-07-16T12:00:00.000Z');
  assert.equal(result.session_id, 'sess-args');
});

test('sem calculated_at na linha salva, o payload usa o instante atual', async () => {
  resetCalls();
  existingResultFixture = null;
  answersFixture = thirtyObjectiveAnswers();
  savedRowFixture = null;

  const before = Date.now();
  const result = await analyzeSession('sess-now');
  const stamped = Date.parse(result.profile.calculated_at);

  assert.ok(stamped >= before && stamped <= Date.now());
});
