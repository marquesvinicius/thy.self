import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const { profilePayloadFromRow, buildDimensions, scoresFromRow } = await import('../src/engine/profile-payload.js');

const ROW = {
  score_o: '80', score_c: '79.9', score_e: 40, score_a: '19.9', score_n: 0,
  answer_count: 30,
  calculated_at: '2026-07-01T10:00:00.000Z',
};

test('escores numéricos vêm da linha mesmo quando o banco devolve texto (numeric)', () => {
  assert.deepEqual(scoresFromRow(ROW), { O: 80, C: 79.9, E: 40, A: 19.9, N: 0 });
});

test('níveis seguem a escala canônica do motor (classifyScore)', () => {
  // Esta é a mesma escala usada na primeira geração e na regeneração da IA.
  assert.deepEqual(
    buildDimensions(scoresFromRow(ROW)).map(d => [d.key, d.level]),
    [['O', 'muito_alto'], ['C', 'alto'], ['E', 'moderado'], ['A', 'muito_baixo'], ['N', 'muito_baixo']]
  );
});

test('dimensão carrega nome e rótulos de exibição', () => {
  const [openness] = buildDimensions({ O: 50, C: 50, E: 50, A: 50, N: 50 });
  assert.deepEqual(openness, {
    key: 'O',
    name: 'Abertura a Experiências',
    description: 'Reflete criatividade, curiosidade intelectual e disposição para novas ideias e experiências.',
    lowLabel: 'Convencional / Prático',
    highLabel: 'Inventivo / Curioso',
    score: 50,
    level: 'moderado',
  });
});

test('campos opcionais ausentes viram null, presentes passam intactos', () => {
  const bare = profilePayloadFromRow(ROW);
  assert.equal(bare.answer_count, 30);
  assert.equal(bare.calculated_at, '2026-07-01T10:00:00.000Z');
  for (const key of ['consistency', 'llm_interpretation', 'archetype', 'anti_archetype']) {
    assert.equal(bare[key], null, key);
  }

  const extras = {
    consistency: { O: {} }, llm_interpretation: { vibe_resumo: 'v' },
    archetype: { id: 'a' }, anti_archetype: { id: 'b' },
  };
  const full = profilePayloadFromRow({ ...ROW, ...extras });
  for (const [key, value] of Object.entries(extras)) {
    assert.equal(full[key], value, key);
  }
});
