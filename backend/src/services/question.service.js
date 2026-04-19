import {
  getAllActiveQuestions,
  getQuestionsWithAlternatives,
} from '../database/queries/question.queries.js';
import {
  getAnsweredQuestionIds,
  countObjectiveAnswersBySessionId,
} from '../database/queries/answer.queries.js';
import {
  INTERPRETATIVE_CATEGORY_WEIGHTS,
  MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS,
  QUESTION_KIND,
} from '../config/constants.js';
import { shuffle } from '../utils/shuffle.js';

/**
 * Dual-Core picker.
 *
 * The objective layer (BFI-2-S, 30 items) is ALWAYS offered in full — its
 * items are the only ones that feed the OCEAN calculation, so we never
 * randomly sub-sample it. Within the requested batch, objective items take
 * priority; any leftover slots are filled from the interpretative pool using
 * proportional category weights.
 */
export async function getQuestions(sessionId, count = 10) {
  const [allQuestions, answeredIds, objectiveAnswered] = await Promise.all([
    getAllActiveQuestions(),
    getAnsweredQuestionIds(sessionId),
    countObjectiveAnswersBySessionId(sessionId),
  ]);

  const answeredSet = new Set(answeredIds);
  const available = allQuestions.filter(q => !answeredSet.has(q.id));

  const canAnalyze = objectiveAnswered >= MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS;

  if (available.length === 0) {
    return {
      questions: [],
      total_answered: answeredIds.length,
      total_available: 0,
      can_analyze: canAnalyze,
    };
  }

  const objectiveAvailable = available.filter(q => q.kind === QUESTION_KIND.OBJECTIVE);
  const interpretativeAvailable = available.filter(q => q.kind === QUESTION_KIND.INTERPRETATIVE);

  const selected = [];

  // 1) Always prefer objective (BFI-2-S) items first, shuffled.
  const shuffledObjective = shuffle(objectiveAvailable);
  selected.push(...shuffledObjective.slice(0, count));

  // 2) Fill remaining slots from the interpretative pool, balanced by category.
  let remaining = count - selected.length;
  if (remaining > 0 && interpretativeAvailable.length > 0) {
    const byCategory = {};
    for (const q of interpretativeAvailable) {
      const slug = q.question_categories?.slug || 'other';
      (byCategory[slug] ||= []).push(q);
    }

    for (const [category, weight] of Object.entries(INTERPRETATIVE_CATEGORY_WEIGHTS)) {
      const pool = byCategory[category] || [];
      const target = Math.max(1, Math.round(remaining * weight));
      selected.push(...shuffle(pool).slice(0, target));
    }

    if (selected.length < count) {
      const already = new Set(selected.map(q => q.id));
      const extras = shuffle(interpretativeAvailable.filter(q => !already.has(q.id)));
      selected.push(...extras.slice(0, count - selected.length));
    }
  }

  const batch = shuffle(selected.slice(0, count));
  const batchIds = batch.map(q => q.id);

  const questionsWithAlts = await getQuestionsWithAlternatives(batchIds);

  const formatted = questionsWithAlts.map(q => {
    const widgetType = q.type || 'multiple_choice';
    let alternatives = [];

    if (widgetType !== 'slider' && widgetType !== 'reflection') {
      // Objective items must preserve Likert order; interpretative items
      // are shuffled to keep answers less anchored on position.
      const sortedAlts = [...(q.alternatives || [])].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      );
      const display = q.kind === QUESTION_KIND.OBJECTIVE
        ? sortedAlts
        : shuffle(sortedAlts);

      alternatives = display.map(a => ({ id: a.id, text: a.text }));
    }

    return {
      id: q.id,
      text: q.text,
      context: q.context,
      category: q.question_categories?.slug,
      kind: q.kind || QUESTION_KIND.INTERPRETATIVE,
      trait: q.trait || null,
      type: widgetType,
      lowLabel: widgetType === 'slider' ? 'Discordo Totalmente' : undefined,
      highLabel: widgetType === 'slider' ? 'Concordo Totalmente' : undefined,
      alternatives,
    };
  });

  return {
    questions: shuffle(formatted),
    total_answered: answeredIds.length,
    total_available: available.length,
    can_analyze: canAnalyze,
  };
}
