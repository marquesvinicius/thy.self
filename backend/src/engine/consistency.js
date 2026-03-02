import { DIMENSION_KEYS, IMPACT_RANGE } from '../config/constants.js';
import { resolveImpacts } from './BigFiveEngine.js';

/**
 * Threshold for flagging a dimension as having internal tension.
 * With IMPACT_RANGE = 3.0, stddev > 1.5 means answers span more than
 * half the scale — a clear sign of contradictory responses.
 */
const TENSION_THRESHOLD = 1.5;

/**
 * Mapping from dimension key to the impact column name in alternatives.
 */
const IMPACT_COLUMNS = {
  O: 'impact_o',
  C: 'impact_c',
  E: 'impact_e',
  A: 'impact_a',
  N: 'impact_n',
};

/**
 * Calculates per-dimension consistency (standard deviation) from answers.
 * Detects whether a moderate score is genuine balance or masked contradiction.
 *
 * @param {Array} answers - Answers with fully formed schema
 *
 * @returns {Object} Consistency per dimension:
 *   { O: { mean, stddev, tension, n }, C: { ... }, ... }
 */
export function calculateConsistency(answers) {
  const validAnswers = answers.filter(a => a.questions?.type !== 'reflection');
  const n = validAnswers.length;
  if (n === 0) {
    return Object.fromEntries(
      DIMENSION_KEYS.map(key => [key, { mean: 0, stddev: 0, tension: false, n: 0 }])
    );
  }

  const result = {};

  for (const key of DIMENSION_KEYS) {
    const col = IMPACT_COLUMNS[key];

    // Collect individual impact values for this dimension
    const values = validAnswers.map(a => Number(resolveImpacts(a)[col]));

    // Calculate mean
    const sum = values.reduce((acc, v) => acc + v, 0);
    const mean = sum / n;

    // Calculate variance (population variance)
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / n;
    const stddev = Math.sqrt(variance);

    // Round for readability
    result[key] = {
      mean: Math.round(mean * 100) / 100,
      stddev: Math.round(stddev * 100) / 100,
      tension: stddev > TENSION_THRESHOLD,
      n,
    };
  }

  return result;
}
