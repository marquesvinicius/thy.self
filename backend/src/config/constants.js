import { env } from './environment.js';

// Minimum objective (BFI-2-S) answers required before the Big Five profile
// can be computed. The BFI-2-S short form defines 30 items (6 per trait),
// so all 30 must be answered for the calculation to be defensible.
export const MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS = 30;

// Back-compat alias still consumed by some callers / env overrides.
export const MIN_ANSWERS_FOR_ANALYSIS = env.minAnswersForAnalysis ?? MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS;

export const MAX_QUESTIONS_PER_SESSION = env.maxQuestionsPerSession;

export const SCORE_SCALE_MAX = 100;

// Dual-Core (BFI-2-S): each answered item contributes a Likert value in
// [LIKERT_MIN, LIKERT_MAX] to the item's trait, with sign flipped when the
// item is reverse-keyed. Replaces the legacy per-alternative IMPACT_RANGE.
export const LIKERT_MIN = -2;
export const LIKERT_MAX = 2;

// Number of objective items per trait in the BFI-2-S short form (6 each).
export const ITEMS_PER_TRAIT = 6;

export const SESSION_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
};

export const DIMENSION_KEYS = ['O', 'C', 'E', 'A', 'N'];

export const QUESTION_KIND = {
  OBJECTIVE: 'objective',
  INTERPRETATIVE: 'interpretative',
};

export const INTERPRETATIVE_CATEGORIES = {
  MORAL_DILEMMA: 'moral_dilemma',
  PARADOXICAL: 'paradoxical',
  INTEREST: 'interest',
};

// Proportional distribution used by the picker when sampling interpretative
// items. The objective layer always returns all 30 BFI-2-S items, so it is
// NOT included here.
export const INTERPRETATIVE_CATEGORY_WEIGHTS = {
  moral_dilemma: 0.45,
  paradoxical: 0.30,
  interest: 0.25,
};
