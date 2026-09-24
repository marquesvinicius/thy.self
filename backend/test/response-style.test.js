import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const { calculateResponseStyle } = await import('../src/engine/response-style.js');

function objAnswer(trait, value, { reverse = false, at = null, text = `item ${trait}` } = {}) {
  return {
    answered_at: at,
    questions: { kind: 'objective', trait, reverse_key: reverse, text },
    alternatives: { [`impact_${trait.toLowerCase()}`]: value },
  };
}

const repeat = (n, make) => Array.from({ length: n }, (_, i) => make(i));

/**
 * Linha do tempo de respostas: a primeira em T0 e cada seguinte `deltas[i]`
 * segundos depois da anterior. A pergunta i+1 recebe o texto `q{i+1}`.
 */
function timeline(deltas) {
  const t0 = Date.parse('2026-07-17T10:00:00Z');
  let t = t0;
  const answers = [objAnswer('O', 1, { at: new Date(t).toISOString(), text: 'q0' })];
  deltas.forEach((seconds, i) => {
    t += seconds * 1000;
    answers.push(objAnswer('O', 1, { at: new Date(t).toISOString(), text: `q${i + 1}` }));
  });
  return answers;
}

// ── taxas ───────────────────────────────────────────────────────────────────

test('taxas de extremos, neutros e concordância por sentido do item', () => {
  const style = calculateResponseStyle([
    objAnswer('O', 2), objAnswer('O', -2), objAnswer('C', 1), objAnswer('E', 0),
    objAnswer('A', 0, { reverse: true }), objAnswer('N', -1, { reverse: true }),
  ]);

  assert.deepEqual(style, {
    answer_count: 6,
    extreme_count: 2,        // só ±2
    extreme_rate: 0.33,
    neutral_count: 2,
    neutral_rate: 0.33,
    agree_direct_rate: 0.5,  // 2 de 4 diretos são > 0 (o 0 não conta como concordar)
    agree_reverse_rate: 0,   // 0 e −1 não concordam
    acquiescence: false,
    hesitation: null,
  });
});

test('sem respostas objetivas tudo é zero, sem divisão por zero', () => {
  for (const input of [[], null, undefined, [{ questions: { kind: 'interpretative' }, alternatives: {} }]]) {
    assert.deepEqual(calculateResponseStyle(input), {
      answer_count: 0, extreme_count: 0, extreme_rate: 0, neutral_count: 0, neutral_rate: 0,
      agree_direct_rate: 0, agree_reverse_rate: 0, acquiescence: false, hesitation: null,
    });
  }
});

test('respostas inválidas não entram no denominador', () => {
  const style = calculateResponseStyle([
    objAnswer('O', 2),
    { questions: { kind: 'objective', trait: 'Q' }, alternatives: { impact_q: 2 } },
    { questions: { kind: 'objective', trait: 'O' }, alternatives: { impact_o: 'x' } },
  ]);
  assert.equal(style.answer_count, 1);
  assert.equal(style.extreme_rate, 1);
});

// ── aquiescência ────────────────────────────────────────────────────────────

test('aquiescência: concordar com afirmações diretas E invertidas', () => {
  const style = calculateResponseStyle([
    ...repeat(4, () => objAnswer('O', 2)),
    ...repeat(4, () => objAnswer('O', 1, { reverse: true })),
  ]);
  assert.equal(style.acquiescence, true);
});

test('respondente coerente (concorda com diretos, discorda de invertidos) não é aquiescente', () => {
  const style = calculateResponseStyle([
    ...repeat(4, () => objAnswer('C', 2)),
    ...repeat(4, () => objAnswer('C', -2, { reverse: true })),
  ]);
  assert.equal(style.acquiescence, false);
});

test('aquiescência exige ≥ 3 itens de cada sentido', () => {
  const agree = n => repeat(n, () => objAnswer('E', 2));
  const agreeReverse = n => repeat(n, () => objAnswer('E', 2, { reverse: true }));

  assert.equal(calculateResponseStyle([...agree(3), ...agreeReverse(3)]).acquiescence, true);
  assert.equal(calculateResponseStyle([...agree(2), ...agreeReverse(5)]).acquiescence, false);
  assert.equal(calculateResponseStyle([...agree(5), ...agreeReverse(2)]).acquiescence, false);
});

test('aquiescência dispara em exatamente 70% de concordância nos dois sentidos', () => {
  const block = (agreeing, reverse) => [
    ...repeat(agreeing, () => objAnswer('A', 1, { reverse })),
    ...repeat(10 - agreeing, () => objAnswer('A', -1, { reverse })),
  ];
  assert.equal(calculateResponseStyle([...block(7, false), ...block(7, true)]).acquiescence, true);
  assert.equal(calculateResponseStyle([...block(6, false), ...block(7, true)]).acquiescence, false);
  assert.equal(calculateResponseStyle([...block(7, false), ...block(6, true)]).acquiescence, false);
});

// ── hesitação ───────────────────────────────────────────────────────────────

test('hesitação aponta o item mais lento quando ≥ 3× a mediana do próprio ritmo', () => {
  // 10 intervalos: nove de 5 s e um de 15 s → mediana 5 s, 15 = 3× → hesitação.
  const style = calculateResponseStyle(timeline([5, 5, 5, 5, 15, 5, 5, 5, 5, 5]));
  assert.deepEqual(style.hesitation, { question_text: 'q5', seconds: 15, median_seconds: 5 });
});

test('abaixo de 3× a mediana não é hesitação', () => {
  const style = calculateResponseStyle(timeline([5, 5, 5, 5, 14.9, 5, 5, 5, 5, 5]));
  assert.equal(style.hesitation, null);
});

test('hesitação exige ao menos 10 intervalos válidos', () => {
  // 9 intervalos (10 respostas) → amostra insuficiente mesmo com outlier gritante.
  assert.equal(calculateResponseStyle(timeline([5, 5, 5, 5, 60, 5, 5, 5, 5])).hesitation, null);
  // 10 intervalos, mas um é 0 s (mesmo carimbo) → só 9 válidos.
  assert.equal(calculateResponseStyle(timeline([5, 5, 5, 5, 60, 5, 5, 5, 0, 5])).hesitation, null);
});

test('pausa acima de 5 min é interrupção, não hesitação; exatamente 5 min ainda conta', () => {
  const base = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  assert.equal(calculateResponseStyle(timeline([...base, 300.001])).hesitation, null);
  assert.deepEqual(calculateResponseStyle(timeline([...base, 300])).hesitation, {
    question_text: 'q11', seconds: 300, median_seconds: 5,
  });
});

test('a ordem de chegada não importa: as respostas são ordenadas pelo horário', () => {
  const answers = timeline([5, 5, 5, 5, 15, 5, 5, 5, 5, 5]).reverse();
  assert.equal(calculateResponseStyle(answers).hesitation.question_text, 'q5');
});

test('respostas sem horário são ignoradas e texto ausente vira string vazia', () => {
  const answers = timeline([5, 5, 5, 5, 5, 5, 5, 5, 5, 20]);
  delete answers.at(-1).questions.text;
  answers.push(objAnswer('O', 1, { at: null }), objAnswer('O', 1, { at: 'data inválida' }), null);
  answers.push({ answered_at: answers[0].answered_at }); // sem pergunta: não quebra
  assert.deepEqual(calculateResponseStyle(answers).hesitation, {
    question_text: '', seconds: 20, median_seconds: 5,
  });
});
