import { DIMENSION_KEYS, QUESTION_KIND } from '../config/constants.js';

/**
 * Threshold for flagging a trait as "internal tension".
 *
 * With BFI-2-S Likert values in [-2, +2] and 6 items per trait, the maximum
 * possible population stddev of the signed contributions is 2.0 (alternating
 * +2 / -2 across all items). An stddev > 1.2 therefore means the respondent
 * oscillated strongly between endpoints on this trait, which is the signal
 * we want to surface as "internal contradiction" to the LLM.
 */
const TENSION_THRESHOLD = 1.2;

/**
 * Per-trait consistency (mean + population stddev of the signed Likert
 * contributions) over the objective BFI-2-S answers only. Interpretative
 * answers are skipped entirely.
 */
export function calculateConsistency(answers) {
  const buckets = Object.fromEntries(DIMENSION_KEYS.map(k => [k, []]));

  for (const answer of answers) {
    if (answer?.questions?.kind !== QUESTION_KIND.OBJECTIVE) continue;

    const trait = answer.questions.trait;
    if (!trait || !DIMENSION_KEYS.includes(trait)) continue;

    const col = `impact_${trait.toLowerCase()}`;
    const likertValue = Number(answer.alternatives?.[col] ?? 0);
    if (!Number.isFinite(likertValue)) continue;

    const signed = answer.questions.reverse_key ? -likertValue : likertValue;
    buckets[trait].push(signed);
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
      tension: stddev > TENSION_THRESHOLD,
      n,
    };
  }

  return result;
}
