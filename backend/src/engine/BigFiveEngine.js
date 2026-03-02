import { DIMENSION_KEYS } from '../config/constants.js';
import { DIMENSIONS } from './dimensions.js';
import { normalizeScore, classifyScore } from './normalization.js';

export function resolveImpacts(answer) {
  const zeros = { impact_o: 0, impact_c: 0, impact_e: 0, impact_a: 0, impact_n: 0 };
  const type = answer.questions?.type || 'multiple_choice';

  if (!answer.alternatives) return zeros;

  if (type === 'multiple_choice' || type === 'binary' || type === 'ranking') {
    return {
      impact_o: answer.alternatives.impact_o || 0,
      impact_c: answer.alternatives.impact_c || 0,
      impact_e: answer.alternatives.impact_e || 0,
      impact_a: answer.alternatives.impact_a || 0,
      impact_n: answer.alternatives.impact_n || 0,
    };
  }

  if (type === 'slider') {
    const val = answer.slider_value ?? 50;
    // Scale from -1 to 1 based on 0-100 slider
    const modifier = (val - 50) / 50;

    return {
      impact_o: parseFloat(((answer.alternatives.impact_o || 0) * modifier).toFixed(2)),
      impact_c: parseFloat(((answer.alternatives.impact_c || 0) * modifier).toFixed(2)),
      impact_e: parseFloat(((answer.alternatives.impact_e || 0) * modifier).toFixed(2)),
      impact_a: parseFloat(((answer.alternatives.impact_a || 0) * modifier).toFixed(2)),
      impact_n: parseFloat(((answer.alternatives.impact_n || 0) * modifier).toFixed(2)),
    };
  }

  return zeros;
}

/**
 * Calculates a Big Five profile from a list of answers with their impacts.
 *
 * @param {Array} answers - Each answer must include questions and alternatives.
 *
 * @returns {Object} Profile with scores, rawImpacts, dimensions, answerCount
 */
export function calculateProfile(answers) {
  const rawImpacts = { O: 0, C: 0, E: 0, A: 0, N: 0 };
  let validAnswers = 0;

  for (const answer of answers) {
    if (answer.questions?.type === 'reflection') continue;
    validAnswers++;

    const impacts = resolveImpacts(answer);
    rawImpacts.O += Number(impacts.impact_o);
    rawImpacts.C += Number(impacts.impact_c);
    rawImpacts.E += Number(impacts.impact_e);
    rawImpacts.A += Number(impacts.impact_a);
    rawImpacts.N += Number(impacts.impact_n);
  }

  const answerCount = validAnswers;

  const scores = {};
  for (const key of DIMENSION_KEYS) {
    scores[key] = normalizeScore(rawImpacts[key], answerCount);
  }

  const dimensions = DIMENSIONS.map(dim => ({
    key: dim.key,
    name: dim.name,
    score: scores[dim.key],
    level: classifyScore(scores[dim.key]),
    description: dim.description,
    lowLabel: dim.lowLabel,
    highLabel: dim.highLabel,
  }));

  return {
    scores,
    rawImpacts,
    answerCount,
    dimensions,
  };
}
