import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const { toAnswerReview, toInterpretativeSignal, toInterpretativeSignals } = await import('../src/engine/answer-mappers.js');

const objectiveRow = (overrides = {}) => ({
  id: 'a1',
  question_id: 7,
  answered_at: '2026-09-24T10:00:00Z',
  answer_type: 'alternative_id',
  user_observation: null,
  alternatives: { text: 'Concordo', impact_c: 2, impact_o: 0 },
  questions: {
    kind: 'objective', trait: 'C', reverse_key: true, type: 'multiple_choice',
    text: 'É alguém que tende a ser desorganizado.', question_categories: { slug: 'objective_bfi2s' },
  },
  ...overrides,
});

test('revisão de item BFI-2-S mostra a contribuição assinada que o motor usou', () => {
  assert.deepEqual(toAnswerReview(objectiveRow()), {
    id: 'a1',
    question_id: 7,
    question_text: 'É alguém que tende a ser desorganizado.',
    kind: 'objective',
    type: 'multiple_choice',
    trait: 'C',
    reverse_key: true,
    category_slug: 'objective_bfi2s',
    answered_at: '2026-09-24T10:00:00Z',
    answer_text: 'Concordo',
    user_observation: null,
    answer_type: 'alternative_id',
    likert_value: 2,
    contribution: { trait: 'C', delta: -2 }, // reverso: concordar reduz C
  });
});

test('revisão de item interpretativo não tem contribuição Likert', () => {
  const review = toAnswerReview({
    id: 'b', question_id: 101, answer_type: 'reflection', user_observation: 'texto livre',
    alternatives: null,
    questions: { kind: 'interpretative', trait: null, type: 'reflection', text: 'R?', question_categories: null },
  });
  assert.equal(review.likert_value, null);
  assert.equal(review.contribution, null);
  assert.equal(review.answer_text, null);
  assert.equal(review.category_slug, null);
  assert.equal(review.user_observation, 'texto livre');
});

test('revisão descarta o que o motor descarta (valor não numérico)', () => {
  // Antes a revisão mostrava contribuição 0 para um valor que o motor ignorava.
  const review = toAnswerReview(objectiveRow({ alternatives: { text: 'x', impact_c: 'n/a' } }));
  assert.equal(review.likert_value, null);
  assert.equal(review.contribution, null);
});

test('revisão tolera linha sem pergunta associada', () => {
  const review = toAnswerReview({ id: 'z', question_id: 1, questions: null, alternatives: null });
  assert.equal(review.kind, 'interpretative');
  assert.equal(review.question_text, '');
  assert.equal(review.trait, null);
  assert.equal(review.type, null);
  assert.equal(review.reverse_key, false);
});

const interpretativeRow = (overrides = {}) => ({
  user_observation: null,
  alternatives: { text: 'Conto a verdade' },
  questions: {
    text: 'Seu amigo errou…', context: 'No trabalho', type: 'multiple_choice',
    question_categories: { slug: 'moral_dilemma' },
  },
  ...overrides,
});

test('sinal interpretativo leva pergunta, cenário e escolha', () => {
  assert.deepEqual(toInterpretativeSignal(interpretativeRow()), {
    category_slug: 'moral_dilemma',
    question_text: 'Seu amigo errou…',
    question_context: 'No trabalho',
    question_type: 'multiple_choice',
    is_reflection: false,
    alternative_text: 'Conto a verdade',
    user_observation: null,
  });
});

test('reflexão: pelo tipo da pergunta ou por texto livre sem alternativa', () => {
  assert.equal(toInterpretativeSignal(interpretativeRow({
    questions: { type: 'reflection', text: 'R' },
  })).is_reflection, true);
  assert.equal(toInterpretativeSignal(interpretativeRow({
    alternatives: null, user_observation: 'escrevi isto',
  })).is_reflection, true);
  assert.equal(toInterpretativeSignal(interpretativeRow({
    user_observation: 'comentário junto da escolha',
  })).is_reflection, false);
});

test('sinal sem categoria nem pergunta usa valores neutros', () => {
  const signal = toInterpretativeSignal({ user_observation: 'x', alternatives: null, questions: null });
  assert.equal(signal.category_slug, 'unknown');
  assert.equal(signal.question_text, '');
  assert.equal(signal.question_context, null);
  assert.equal(signal.question_type, null);
});

test('pulos sem escolha nem texto não viram sinal', () => {
  const signals = toInterpretativeSignals([
    interpretativeRow(),
    interpretativeRow({ alternatives: null, user_observation: null }),
    interpretativeRow({ alternatives: null, user_observation: 'só texto' }),
  ]);
  assert.equal(signals.length, 2);
  assert.deepEqual(toInterpretativeSignals(null), []);
});
