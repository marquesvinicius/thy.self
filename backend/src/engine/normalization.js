import { IMPACT_RANGE, SCORE_SCALE_MAX } from '../config/constants.js';

/**
 * Converts a raw accumulated impact score to a 0-100 scale.
 *
 * Uses min-max normalization based on theoretical bounds:
 *   min = answerCount * -IMPACT_RANGE
 *   max = answerCount * +IMPACT_RANGE
 *
 * A perfectly neutral respondent scores 50.
 */
export function normalizeScore(rawScore, answerCount) {
  const theoreticalMin = answerCount * -IMPACT_RANGE;
  const theoreticalMax = answerCount * IMPACT_RANGE;
  const range = theoreticalMax - theoreticalMin;

  if (range === 0) return 50;

  const normalized = ((rawScore - theoreticalMin) / range) * SCORE_SCALE_MAX;
  return Math.round(Math.min(Math.max(normalized, 0), SCORE_SCALE_MAX) * 10) / 10;
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
