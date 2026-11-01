import { DIMENSION_KEYS } from '../config/constants.js';
import { readObjectiveLikert } from './likert.js';

/**
 * Threshold for flagging a trait as "internal tension".
 *
 * With BFI-2-S Likert values in [-2, +2] and 6 items per trait, the maximum
 * possible population stddev of the signed contributions is 2.0 (alternating
 * +2 / -2 across all items). The 6 items cover different facets of the trait,
 * so some spread is normal: with the old cut (stddev > 1.2) almost every
 * profile showed tension on most axes. Tension now requires a high spread
 * (>= 1.5) AND both endpoints on the same trait (a signed +2 and a signed -2),
 * which is what the user-facing text claims ("oscillated between extremes").
 */
const TENSION_THRESHOLD = 1.5;
const LIKERT_EXTREME = 2;

/**
 * Per-trait consistency (mean + population stddev of the signed Likert
 * contributions) over the objective BFI-2-S answers only. Interpretative
 * answers are skipped entirely.
 */
export function calculateConsistency(answers) {
  const buckets = Object.fromEntries(DIMENSION_KEYS.map(k => [k, []]));

  for (const answer of answers) {
    const likert = readObjectiveLikert(answer);
    if (likert) buckets[likert.trait].push(likert.signed);
  }

  const result = {};
  for (const key of DIMENSION_KEYS) {
    const values = buckets[key];
    const n = values.length;

    if (n === 0) {
      result[key] = { mean: 0, stddev: 0, tension: false, n: 0 };
      continue;
    }

    const sum = values.reduce((acc, v) => acc + v, 0);
    const mean = sum / n;
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / n;
    const stddev = Math.sqrt(variance);

    result[key] = {
      mean: Math.round(mean * 100) / 100,
      stddev: Math.round(stddev * 100) / 100,
      tension: stddev >= TENSION_THRESHOLD
        && values.includes(LIKERT_EXTREME)
        && values.includes(-LIKERT_EXTREME),
      n,
    };
  }

  return result;
}
