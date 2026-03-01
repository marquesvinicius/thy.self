import { getAllActiveQuestions, getQuestionsWithAlternatives } from '../database/queries/question.queries.js';
import { getAnsweredQuestionIds, countAnswersBySessionId } from '../database/queries/answer.queries.js';
import { CATEGORY_WEIGHTS, MIN_ANSWERS_FOR_ANALYSIS } from '../config/constants.js';
import { shuffle } from '../utils/shuffle.js';

/**
 * Returns a balanced, randomized batch of questions for a session,
 * excluding already-answered questions.
 */
export async function getQuestions(sessionId, count = 10) {
  const [allQuestions, answeredIds] = await Promise.all([
    getAllActiveQuestions(),
    getAnsweredQuestionIds(sessionId),
  ]);

  const answeredSet = new Set(answeredIds);
  const available = allQuestions.filter(q => !answeredSet.has(q.id));

  if (available.length === 0) {
    return {
      questions: [],
      total_answered: answeredIds.length,
      total_available: 0,
      can_analyze: answeredIds.length >= MIN_ANSWERS_FOR_ANALYSIS,
    };
  }

  // Group by category
  const byCategory = {};
  for (const q of available) {
    const slug = q.question_categories?.slug || 'structural';
    if (!byCategory[slug]) byCategory[slug] = [];
    byCategory[slug].push(q);
  }

  // Pick proportionally from each category
  const selected = [];
  const remaining = count;

  for (const [category, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    const pool = byCategory[category] || [];
    const target = Math.max(1, Math.round(remaining * weight));
    const shuffled = shuffle(pool);
    selected.push(...shuffled.slice(0, target));
  }

  // If we have fewer than requested, fill from any category
  if (selected.length < count) {
    const selectedIds = new Set(selected.map(q => q.id));
    const extras = shuffle(available.filter(q => !selectedIds.has(q.id)));
    selected.push(...extras.slice(0, count - selected.length));
  }

  // Trim to requested count and shuffle final order
  const batch = shuffle(selected.slice(0, count));
  const batchIds = batch.map(q => q.id);

  // Fetch full questions with alternatives (without impacts)
  const questionsWithAlts = await getQuestionsWithAlternatives(batchIds);

  // Shuffle alternatives within each question
  const formatted = questionsWithAlts.map(q => ({
    id: q.id,
    text: q.text,
    context: q.context,
    category: q.question_categories?.slug,
    alternatives: shuffle(q.alternatives).map(a => ({
      id: a.id,
      text: a.text,
    })),
  }));

  return {
    questions: shuffle(formatted),
    total_answered: answeredIds.length,
    total_available: available.length,
    can_analyze: answeredIds.length >= MIN_ANSWERS_FOR_ANALYSIS,
  };
}
