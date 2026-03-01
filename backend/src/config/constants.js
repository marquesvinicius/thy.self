import { env } from './environment.js';

export const MIN_ANSWERS_FOR_ANALYSIS = env.minAnswersForAnalysis;
export const MAX_QUESTIONS_PER_SESSION = env.maxQuestionsPerSession;

export const SCORE_SCALE_MAX = 100;
export const IMPACT_RANGE = 3.0;

export const SESSION_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
};

export const DIMENSION_KEYS = ['O', 'C', 'E', 'A', 'N'];

export const QUESTION_CATEGORIES = {
  STRUCTURAL: 'structural',
  MORAL_DILEMMA: 'moral_dilemma',
  PARADOXICAL: 'paradoxical',
  INTEREST: 'interest',
};

// Proportional distribution when fetching a batch of questions
export const CATEGORY_WEIGHTS = {
  structural: 0.50,
  moral_dilemma: 0.20,
  paradoxical: 0.15,
  interest: 0.15,
};
