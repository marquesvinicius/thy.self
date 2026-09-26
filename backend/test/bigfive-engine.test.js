import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const { calculateProfile } = await import('../src/engine/BigFiveEngine.js');
const { calculateConsistency } = await import('../src/engine/consistency.js');

/**
 * Builds a Dual-Core answer fixture.
 *
 * For objective answers, only the `impact_<trait.lower()>` column is read
 * by the engine — the other trait columns must stay at zero to mirror the
 * seed format (one-trait-per-item BFI-2-S Likert).
 */
function makeObjective({ trait, value, reverseKey = false }) {
  const col = `impact_${trait.toLowerCase()}`;
  return {
    questions: { kind: 'objective', trait, reverse_key: reverseKey, type: 'multiple_choice' },
    alternatives: {
      impact_o: 0, impact_c: 0, impact_e: 0, impact_a: 0, impact_n: 0,
      [col]: value,
    },
  };
}

function makeInterpretative({ type = 'multiple_choice' } = {}) {
  return {
    questions: { kind: 'interpretative', trait: null, reverse_key: false, type },
    alternatives: { impact_o: 0, impact_c: 0, impact_e: 0, impact_a: 0, impact_n: 0 },
  };
}

/**
 * Builds 6 objective items for a single trait with the same Likert value.
 */
function sixItems(trait, value, reverseKey = false) {
  return Array.from({ length: 6 }, () => makeObjective({ trait, value, reverseKey }));
}

test('calculateProfile only reads objective (BFI-2-S) answers', () => {
  const answers = [
    ...sixItems('O', 2),
    ...sixItems('C', 2),
    ...sixItems('E', 2),
    ...sixItems('A', 2),
    ...sixItems('N', 2),
    // Interpretative noise that must be ignored:
    makeInterpretative({ type: 'binary' }),
    makeInterpretative({ type: 'multiple_choice' }),
    makeInterpretative({ type: 'reflection' }),
  ];

  const profile = calculateProfile(answers);

  assert.equal(profile.answerCount, 30);
  assert.deepEqual(profile.rawImpacts, { O: 12, C: 12, E: 12, A: 12, N: 12 });
  // Full agreement on all 6 items per trait → normalized 100
  assert.deepEqual(profile.scores, { O: 100, C: 100, E: 100, A: 100, N: 100 });
});

test('calculateProfile returns 50 for a perfectly neutral respondent', () => {
  const answers = [
    ...sixItems('O', 0),
    ...sixItems('C', 0),
    ...sixItems('E', 0),
    ...sixItems('A', 0),
    ...sixItems('N', 0),
  ];

  const profile = calculateProfile(answers);
  assert.deepEqual(profile.scores, { O: 50, C: 50, E: 50, A: 50, N: 50 });
  assert.deepEqual(profile.rawImpacts, { O: 0, C: 0, E: 0, A: 0, N: 0 });
});

test('reverse_key flips the signed contribution of the Likert value', () => {
  // One item answered +2 with reverse_key=true should count as -2.
  const answers = [
    makeObjective({ trait: 'C', value: 2, reverseKey: true }),
    makeObjective({ trait: 'C', value: 2, reverseKey: false }),
  ];

  const profile = calculateProfile(answers);
  assert.equal(profile.rawImpacts.C, 0, 'reverse + direct should cancel');
});

test('calculateProfile ignores interpretative answers entirely', () => {
  const answers = [
    makeInterpretative(),
    makeInterpretative({ type: 'binary' }),
    makeInterpretative({ type: 'reflection' }),
  ];

  const profile = calculateProfile(answers);
  assert.equal(profile.answerCount, 0);
  assert.deepEqual(profile.rawImpacts, { O: 0, C: 0, E: 0, A: 0, N: 0 });
  // With no objective items the scores fall back to the neutral midpoint.
  assert.deepEqual(profile.scores, { O: 50, C: 50, E: 50, A: 50, N: 50 });
});

test('calculateConsistency flags high-variance traits as tension', () => {
  // Alternating +2 / -2 across 6 items for O → stddev = 2.0 > 1.2
  const alternating = [
    makeObjective({ trait: 'O', value:  2 }),
    makeObjective({ trait: 'O', value: -2 }),
    makeObjective({ trait: 'O', value:  2 }),
    makeObjective({ trait: 'O', value: -2 }),
    makeObjective({ trait: 'O', value:  2 }),
    makeObjective({ trait: 'O', value: -2 }),
  ];
  // Consistent +2 across 6 items for C → stddev = 0, no tension
  const consistent = sixItems('C', 2);

  const consistency = calculateConsistency([...alternating, ...consistent]);

  assert.equal(consistency.O.tension, true);
  assert.equal(consistency.O.n, 6);
  assert.equal(consistency.C.tension, false);
  assert.equal(consistency.C.n, 6);
  assert.equal(consistency.E.n, 0);
});

test('calculateConsistency ignores interpretative answers', () => {
  const answers = [makeInterpretative(), makeInterpretative({ type: 'reflection' })];
  const consistency = calculateConsistency(answers);

  for (const key of ['O', 'C', 'E', 'A', 'N']) {
    assert.equal(consistency[key].n, 0);
    assert.equal(consistency[key].tension, false);
  }
});

test('interpretativa com traço preenchido continua fora do escore (Dual-Core)', () => {
  const leaked = {
    questions: { kind: 'interpretative', trait: 'O', reverse_key: false, type: 'binary' },
    alternatives: { impact_o: 2, impact_c: 0, impact_e: 0, impact_a: 0, impact_n: 0 },
  };
  const profile = calculateProfile([...sixItems('O', -2), leaked, leaked]);

  assert.equal(profile.answerCount, 6);
  assert.equal(profile.rawImpacts.O, -12);
  assert.equal(profile.scores.O, 0);
});

test('normaliza pelo nº real de itens do traço, não pelo canônico 6', () => {
  // 3 itens em +2 → soma 6 sobre limites [−6, +6] → 100 (e não 75).
  const profile = calculateProfile([
    makeObjective({ trait: 'A', value: 2 }),
    makeObjective({ trait: 'A', value: 2 }),
    makeObjective({ trait: 'A', value: 2 }),
  ]);
  assert.deepEqual(profile.itemsPerTrait, { O: 0, C: 0, E: 0, A: 3, N: 0 });
  assert.equal(profile.scores.A, 100);
});

test('respostas inválidas (traço desconhecido, Likert não numérico) são descartadas', () => {
  const profile = calculateProfile([
    makeObjective({ trait: 'E', value: 1 }),
    { questions: { kind: 'objective', trait: 'Z', reverse_key: false }, alternatives: { impact_z: 2 } },
    { questions: { kind: 'objective', trait: 'E', reverse_key: false }, alternatives: { impact_e: 'x' } },
  ]);
  assert.equal(profile.answerCount, 1);
  assert.equal(profile.itemsPerTrait.E, 1);
  assert.equal(profile.rawImpacts.E, 1);
});

test('dimensions traz os 5 traços em ordem OCEAN com nível e metadados de exibição', () => {
  const profile = calculateProfile([
    ...sixItems('O', 2),   // 100 → muito_alto
    ...sixItems('C', 1),   // 75  → alto
    ...sixItems('E', 0),   // 50  → moderado
    ...sixItems('A', -1),  // 25  → baixo
    ...sixItems('N', -2),  // 0   → muito_baixo
  ]);

  assert.deepEqual(
    profile.dimensions.map(d => [d.key, d.score, d.level]),
    [['O', 100, 'muito_alto'], ['C', 75, 'alto'], ['E', 50, 'moderado'], ['A', 25, 'baixo'], ['N', 0, 'muito_baixo']]
  );
  assert.deepEqual(profile.dimensions[4], {
    key: 'N',
    name: 'Neuroticismo',
    score: 0,
    level: 'muito_baixo',
    description: 'Reflete a tendência a experimentar emoções negativas como ansiedade, raiva e tristeza.',
    lowLabel: 'Estável / Calmo',
    highLabel: 'Sensível / Reativo',
  });
});
