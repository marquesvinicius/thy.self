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
 *
 * @param {string} sessionId
 * @param {number} count
 * @param {{ preferQuestionId?: string|number|null }} [options]
 *   When set (e.g. after undo), that question is forced to the front of the
 *   batch if it is still unanswered — avoids reshuffling into a never-seen item.
 */
export async function getQuestions(sessionId, count = 10, options = {}) {
  const preferQuestionId = options.preferQuestionId != null
    ? String(options.preferQuestionId)
    : null;

  const [allQuestions, answeredIds, objectiveAnswered] = await Promise.all([
    getAllActiveQuestions(),
    getAnsweredQuestionIds(sessionId),
    countObjectiveAnswersBySessionId(sessionId),
  ]);

  const answeredSet = new Set(answeredIds);
  const available = allQuestions.filter(q => !answeredSet.has(q.id));

  const canAnalyze = objectiveAnswered >= MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS;

  // Progresso por etapa (camada objetiva × interpretativa) — permite ao
  // frontend mostrar "12/30 · BFI-2-S" em vez de só o total agregado.
  const objectiveTotal = allQuestions.filter(q => q.kind === QUESTION_KIND.OBJECTIVE).length;
  const stageProgress = {
    objective_answered: objectiveAnswered,
    objective_total: objectiveTotal,
    interpretative_answered: Math.max(0, answeredIds.length - objectiveAnswered),
    interpretative_total: allQuestions.length - objectiveTotal,
  };

  if (available.length === 0) {
    return {
      questions: [],
      total_answered: answeredIds.length,
      total_available: 0,
      can_analyze: canAnalyze,
      stage_progress: stageProgress,
    };
  }

  const preferred = preferQuestionId
    ? available.find(q => String(q.id) === preferQuestionId) || null
    : null;

  const pool = preferred
    ? available.filter(q => String(q.id) !== preferQuestionId)
    : available;

  const objectiveAvailable = pool.filter(q => q.kind === QUESTION_KIND.OBJECTIVE);
  const interpretativeAvailable = pool.filter(q => q.kind === QUESTION_KIND.INTERPRETATIVE);

  const selected = [];
  if (preferred) {
    selected.push(preferred);
  }

  // 1) Always prefer objective (BFI-2-S) items first, shuffled.
  let remaining = count - selected.length;
  if (remaining > 0) {
    const shuffledObjective = shuffle(objectiveAvailable);
    selected.push(...shuffledObjective.slice(0, remaining));
  }

  // 2) Fill remaining slots from the interpretative pool, balanced by category.
  remaining = count - selected.length;
  if (remaining > 0 && interpretativeAvailable.length > 0) {
    const byCategory = {};
    for (const q of interpretativeAvailable) {
      const slug = q.question_categories?.slug || 'other';
      (byCategory[slug] ||= []).push(q);
    }

    for (const [category, weight] of Object.entries(INTERPRETATIVE_CATEGORY_WEIGHTS)) {
      const catPool = byCategory[category] || [];
      const target = Math.max(1, Math.round(remaining * weight));
      selected.push(...shuffle(catPool).slice(0, target));
    }

    if (selected.length < count) {
      const already = new Set(selected.map(q => q.id));
      const extras = shuffle(interpretativeAvailable.filter(q => !already.has(q.id)));
      selected.push(...extras.slice(0, count - selected.length));
    }
  }

  // Keep preferred at index 0; shuffle only the rest of the batch.
  const head = preferred ? [preferred] : [];
  const tail = shuffle(
    selected
      .filter(q => !preferred || String(q.id) !== preferQuestionId)
      .slice(0, count - head.length),
  );
  const batch = [...head, ...tail].slice(0, count);
  const batchIds = batch.map(q => q.id);

  const questionsWithAlts = await getQuestionsWithAlternatives(batchIds);

  // Preserve batch order (preferred first) after the alternatives join.
  const byId = new Map(questionsWithAlts.map(q => [String(q.id), q]));
  const ordered = batchIds.map(id => byId.get(String(id))).filter(Boolean);

  const formatted = ordered.map(q => {
    const widgetType = q.type || 'multiple_choice';
    let alternatives = [];

    if (widgetType !== 'reflection') {
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
      alternatives,
    };
  });

  return {
    questions: formatted,
    total_answered: answeredIds.length,
    total_available: available.length,
    can_analyze: canAnalyze,
    stage_progress: stageProgress,
  };
}
