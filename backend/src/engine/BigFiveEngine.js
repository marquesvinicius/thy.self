import { DIMENSION_KEYS } from '../config/constants.js';
import { DIMENSIONS } from './dimensions.js';
import { normalizeScore, classifyScore } from './normalization.js';

/**
 * Calculates a Big Five profile from a list of answers with their impacts.
 *
 * @param {Array} answers - Each answer must include:
 *   { alternatives: { impact_o, impact_c, impact_e, impact_a, impact_n } }
 *
 * @returns {Object} Profile with scores, rawImpacts, dimensions, answerCount
 */
export function calculateProfile(answers) {
  const rawImpacts = { O: 0, C: 0, E: 0, A: 0, N: 0 };

  for (const answer of answers) {
    const impacts = answer.alternatives;
    rawImpacts.O += Number(impacts.impact_o);
    rawImpacts.C += Number(impacts.impact_c);
    rawImpacts.E += Number(impacts.impact_e);
    rawImpacts.A += Number(impacts.impact_a);
    rawImpacts.N += Number(impacts.impact_n);
  }

  const answerCount = answers.length;

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
