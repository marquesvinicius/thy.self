import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const { calculateResponseStyle } = await import('../src/engine/response-style.js');

function objAnswer(trait, value, { reverse = false, at = null } = {}) {
  return {
    answered_at: at,
    questions: { kind: 'objective', trait, reverse_key: reverse, text: `item ${trait}` },
    alternatives: { [`impact_${trait.toLowerCase()}`]: value },
  };
}

test('taxas de extremos e neutros são calculadas corretamente', () => {
  const answers = [
    objAnswer('O', 2), objAnswer('O', -2), objAnswer('C', 2),
    objAnswer('E', 0), objAnswer('A', 1), objAnswer('N', -1),
  ];
  const style = calculateResponseStyle(answers);

  assert.equal(style.answer_count, 6);
  assert.equal(style.extreme_count, 3);
  assert.equal(style.extreme_rate, 0.5);
  assert.equal(style.neutral_count, 1);
  assert.equal(style.neutral_rate, 0.17);
});

test('aquiescência detecta concordância nos dois sentidos', () => {
  // Concorda (+) com 4 itens diretos e 4 invertidos — contradição de formato
  const answers = [
    ...Array.from({ length: 4 }, () => objAnswer('O', 2, { reverse: false })),
    ...Array.from({ length: 4 }, () => objAnswer('O', 1, { reverse: true })),
  ];
  const style = calculateResponseStyle(answers);
  assert.equal(style.acquiescence, true);
});

test('respondente coerente NÃO é aquiescente', () => {
  // Concorda com diretos, discorda de invertidos — perfil coerente
  const answers = [
    ...Array.from({ length: 4 }, () => objAnswer('C', 2, { reverse: false })),
    ...Array.from({ length: 4 }, () => objAnswer('C', -2, { reverse: true })),
  ];
  const style = calculateResponseStyle(answers);
  assert.equal(style.acquiescence, false);
});

test('respostas interpretativas são ignoradas', () => {
  const answers = [
    objAnswer('O', 2),
    { questions: { kind: 'interpretative', trait: null }, alternatives: {} },
  ];
  const style = calculateResponseStyle(answers);
  assert.equal(style.answer_count, 1);
});

test('hesitação identifica o outlier acima de 3× a mediana', () => {
  const base = Date.parse('2026-07-17T10:00:00Z');
  const answers = [];
  // 12 respostas em ritmo de ~5s + 1 resposta que demorou 60s
  for (let i = 0; i < 12; i += 1) {
    answers.push(objAnswer('O', 1, { at: new Date(base + i * 5000).toISOString() }));
  }
  const slow = objAnswer('N', -1, { at: new Date(base + 12 * 5000 + 60000).toISOString() });
  slow.questions.text = 'Eu sou alguém que… se preocupa bastante.';
  answers.push(slow);

  const style = calculateResponseStyle(answers);
  assert.ok(style.hesitation);
  // Última resposta em base+60s: delta = 5s do passo + 60s extras
  assert.equal(style.hesitation.seconds, 65);
  assert.match(style.hesitation.question_text, /se preocupa bastante/);
});

test('hesitação retorna null com amostra insuficiente', () => {
  const base = Date.parse('2026-07-17T10:00:00Z');
  const answers = Array.from({ length: 5 }, (_, i) =>
    objAnswer('O', 1, { at: new Date(base + i * 5000).toISOString() })
  );
  const style = calculateResponseStyle(answers);
  assert.equal(style.hesitation, null);
});
