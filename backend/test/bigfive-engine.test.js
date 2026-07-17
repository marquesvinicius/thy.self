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
