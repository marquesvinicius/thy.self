import {
  DIMENSION_KEYS,
  ITEMS_PER_TRAIT,
  QUESTION_KIND,
} from '../config/constants.js';
import { DIMENSIONS } from './dimensions.js';
import { normalizeByTrait, classifyScore } from './normalization.js';

/**
 * @typedef {Object} Question
 * @property {number} id
 * @property {'objective'|'interpretative'} kind
 * @property {'O'|'C'|'E'|'A'|'N'|null} trait      non-null only if kind === 'objective'
 * @property {boolean} reverse_key                  always false if kind === 'interpretative'
 * @property {'binary'|'reflection'|'multiple_choice'} type
 * @property {string} text
 * @property {string|null} context
 */

/**
 * Dual-Core engine.
 *
 * Only answers whose question is `kind === 'objective'` (BFI-2-S items) feed
 * the Big Five calculation. Each objective answer contributes a Likert value
 * in [-2, +2] to the item's single trait column, with the sign flipped when
 * the item is reverse-keyed. Interpretative answers are ignored here and are
 * consumed downstream as qualitative LLM context only.
 */
export function calculateProfile(answers) {
  const rawImpacts = { O: 0, C: 0, E: 0, A: 0, N: 0 };
  const itemsPerTrait = { O: 0, C: 0, E: 0, A: 0, N: 0 };
  let objectiveCount = 0;

  for (const answer of answers) {
    if (answer?.questions?.kind !== QUESTION_KIND.OBJECTIVE) continue;

    const trait = answer.questions.trait;
    if (!trait || !DIMENSION_KEYS.includes(trait)) continue;

    const col = `impact_${trait.toLowerCase()}`;
    const likertValue = Number(answer.alternatives?.[col] ?? 0);
    if (!Number.isFinite(likertValue)) continue;

    const signed = answer.questions.reverse_key ? -likertValue : likertValue;

    rawImpacts[trait] += signed;
    itemsPerTrait[trait] += 1;
    objectiveCount += 1;
  }

  const scores = {};
  for (const key of DIMENSION_KEYS) {
    // Fall back to the canonical 6 items per trait when we have none yet,
    // so normalization remains well-defined for partially filled fixtures.
    const n = itemsPerTrait[key] || ITEMS_PER_TRAIT;
    scores[key] = normalizeByTrait(rawImpacts[key], n);
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
    itemsPerTrait,
    answerCount: objectiveCount,
    dimensions,
  };
}
