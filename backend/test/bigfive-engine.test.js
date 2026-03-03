import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const { resolveImpacts, calculateProfile } = await import('../src/engine/BigFiveEngine.js');
const { calculateConsistency } = await import('../src/engine/consistency.js');

function makeAnswer({
  type = 'multiple_choice',
  impacts = {},
  sliderValue = null,
} = {}) {
  return {
    questions: { type },
    alternatives: {
      impact_o: 0,
      impact_c: 0,
      impact_e: 0,
      impact_a: 0,
      impact_n: 0,
      ...impacts,
    },
    ...(sliderValue !== null ? { slider_value: sliderValue } : {}),
  };
}

test('resolveImpacts returns direct impacts for multiple_choice', () => {
  const answer = makeAnswer({
    type: 'multiple_choice',
    impacts: { impact_o: 2.5, impact_c: -1.5, impact_e: 1, impact_a: 0.5, impact_n: -2 },
  });
  assert.deepEqual(resolveImpacts(answer), answer.alternatives);
});

test('resolveImpacts scales slider impacts between -1 and 1', () => {
  const top = resolveImpacts(makeAnswer({
    type: 'slider',
    impacts: { impact_o: 3, impact_c: -3 },
    sliderValue: 100,
  }));
  const middle = resolveImpacts(makeAnswer({
    type: 'slider',
    impacts: { impact_o: 3, impact_c: -3 },
    sliderValue: 50,
  }));
  const bottom = resolveImpacts(makeAnswer({
    type: 'slider',
    impacts: { impact_o: 3, impact_c: -3 },
    sliderValue: 0,
  }));

  assert.equal(top.impact_o, 3);
  assert.equal(top.impact_c, -3);
  assert.equal(middle.impact_o, 0);
  assert.equal(middle.impact_c, 0);
  assert.equal(bottom.impact_o, -3);
  assert.equal(bottom.impact_c, 3);
});

test('calculateProfile ignores reflection answers and computes normalized scores', () => {
  const answers = [
    makeAnswer({ impacts: { impact_o: 3, impact_c: 3, impact_e: 3, impact_a: 3, impact_n: 3 } }),
    makeAnswer({ impacts: { impact_o: -3, impact_c: -3, impact_e: -3, impact_a: -3, impact_n: -3 } }),
    makeAnswer({ type: 'reflection', impacts: { impact_o: 3, impact_c: 3 } }),
  ];

  const profile = calculateProfile(answers);

  assert.equal(profile.answerCount, 2);
  assert.deepEqual(profile.rawImpacts, { O: 0, C: 0, E: 0, A: 0, N: 0 });
  assert.deepEqual(profile.scores, { O: 50, C: 50, E: 50, A: 50, N: 50 });
  assert.ok(profile.dimensions.every(dim => dim.level === 'moderado'));
});

test('calculateConsistency flags high-variance dimensions as tension', () => {
  const answers = [
    makeAnswer({ impacts: { impact_o: 3 } }),
    makeAnswer({ impacts: { impact_o: -3 } }),
    makeAnswer({ impacts: { impact_o: 3 } }),
    makeAnswer({ impacts: { impact_o: -3 } }),
  ];

  const consistency = calculateConsistency(answers);
  assert.equal(consistency.O.tension, true);
  assert.equal(consistency.O.n, 4);
  assert.equal(consistency.C.tension, false);
});
