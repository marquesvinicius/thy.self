import {
  LIKERT_MIN,
  LIKERT_MAX,
  SCORE_SCALE_MAX,
} from '../config/constants.js';

/**
 * Min-max normalization of a single-trait raw score onto the 0–100 scale.
 *
 * Theoretical bounds per trait (BFI-2-S, 6 items × Likert −2…+2):
 *   min = itemsForTrait * LIKERT_MIN
 *   max = itemsForTrait * LIKERT_MAX
 *
 * A perfectly neutral respondent (sum = 0) scores exactly 50.
 */
export function normalizeByTrait(rawScore, itemsForTrait) {
  if (!itemsForTrait || itemsForTrait <= 0) return 50;

  const theoreticalMin = itemsForTrait * LIKERT_MIN;
  const theoreticalMax = itemsForTrait * LIKERT_MAX;
  const range = theoreticalMax - theoreticalMin;

  if (range === 0) return 50;

  const normalized = ((rawScore - theoreticalMin) / range) * SCORE_SCALE_MAX;
  return Math.round(Math.min(Math.max(normalized, 0), SCORE_SCALE_MAX) * 10) / 10;
}

/**
 * Back-compat alias used by legacy callers. Delegates to normalizeByTrait.
 */
export function normalizeScore(rawScore, itemsForTrait) {
  return normalizeByTrait(rawScore, itemsForTrait);
}

/**
 * Classifies a normalized score (0-100) into a level label.
 */
export function classifyScore(score) {
  if (score < 20) return 'muito_baixo';
  if (score < 40) return 'baixo';
  if (score < 60) return 'moderado';
  if (score < 80) return 'alto';
  return 'muito_alto';
}
