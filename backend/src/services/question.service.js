import {
  getAllActiveQuestions,
  getQuestionsWithAlternatives,
} from '../database/queries/question.queries.js';
import {
  getAnsweredQuestionIds,
  countObjectiveAnswersBySessionId,
} from '../database/queries/answer.queries.js';
import {
  getSessionById,
  updateSessionQuestionOrder,
} from '../database/queries/session.queries.js';
import {
  MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS,
  QUESTION_KIND,
} from '../config/constants.js';
import { shuffle } from '../utils/shuffle.js';
import { buildQuestionOrder } from '../utils/questionOrder.js';

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
 * @param {{ narrativeLimit?: number|string|null }} [options]
 */
export async function getQuestions(sessionId, count = 10, options = {}) {
  const [allQuestions, answeredIds, objectiveAnswered, session] = await Promise.all([
    getAllActiveQuestions(),
    getAnsweredQuestionIds(sessionId),
    countObjectiveAnswersBySessionId(sessionId),
    getSessionById(sessionId),
  ]);

  if (!session) {
    return {
      questions: [],
      total_answered: 0,
      total_available: 0,
      can_analyze: false,
    };
  }

  let questionOrder = Array.isArray(session.question_order)
    ? session.question_order
    : null;
  if (!questionOrder?.length) {
    questionOrder = buildQuestionOrder(allQuestions);
    await updateSessionQuestionOrder(sessionId, questionOrder);
  }

  const questionsById = new Map(allQuestions.map(q => [q.id, q]));
  const answeredSet = new Set(answeredIds);
  const unanswered = questionOrder
    .map(id => questionsById.get(id))
    .filter(q => q && !answeredSet.has(q.id));

  const canAnalyze = objectiveAnswered >= MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS;

  // Progresso por etapa (camada objetiva × interpretativa) — permite ao
  // frontend mostrar "12/30 · BFI-2-S" em vez de só o total agregado.
  const objectiveTotal = allQuestions.filter(q => q.kind === QUESTION_KIND.OBJECTIVE).length;
  const interpretativeAnswered = Math.max(0, answeredIds.length - objectiveAnswered);
  const interpretativeCatalogTotal = allQuestions.length - objectiveTotal;

  // Teto narrativo escolhido pelo usuário na tela de decisão (versão curta).
  // Sem teto, o ato 2 vai até esgotar o catálogo (versão completa).
  const narrativeLimit = normalizeNarrativeLimit(options.narrativeLimit);
  const interpretativeTotal = narrativeLimit != null
    ? Math.min(narrativeLimit, interpretativeCatalogTotal)
    : interpretativeCatalogTotal;
  const narrativeBudget = Math.max(0, interpretativeTotal - interpretativeAnswered);

  const stageProgress = {
    objective_answered: objectiveAnswered,
    objective_total: objectiveTotal,
    interpretative_answered: interpretativeAnswered,
    interpretative_total: interpretativeTotal,
  };

  // Orçamento narrativo esgotado → só as objetivas seguem elegíveis (o que
  // encerra o quiz quando elas também acabaram).
  const available = narrativeBudget > 0
    ? unanswered
    : unanswered.filter(q => q.kind === QUESTION_KIND.OBJECTIVE);

  // Total exposto ao frontend respeita o teto: a barra de progresso de quem
  // escolheu a versão curta não deve contar as 30 narrativas do catálogo.
  const objectiveRemaining = available.filter(q => q.kind === QUESTION_KIND.OBJECTIVE).length;
  const interpretativeRemaining = available.filter(
    q => q.kind === QUESTION_KIND.INTERPRETATIVE
  ).length;
  const totalAvailable = objectiveRemaining + Math.min(narrativeBudget, interpretativeRemaining);

  if (available.length === 0) {
    return {
      questions: [],
      total_answered: answeredIds.length,
      total_available: 0,
      can_analyze: canAnalyze,
      stage_progress: stageProgress,
    };
  }

  // A ordem já foi sorteada e persistida na sessão. O cursor só remove itens
  // consumidos (inclusive skips) e nunca embaralha novamente.
  const batch = [];
  let fixedInterpretativeUsed = 0;
  for (const question of available) {
    if (batch.length >= count) break;
    if (question.kind === QUESTION_KIND.INTERPRETATIVE) {
      if (fixedInterpretativeUsed >= narrativeBudget) break;
      fixedInterpretativeUsed += 1;
    }
    batch.push(question);
  }
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
    total_available: totalAvailable,
    can_analyze: canAnalyze,
    stage_progress: stageProgress,
  };
}

/**
 * Teto de perguntas interpretativas para a sessão. `null` = sem teto
 * (versão completa). Valores inválidos são ignorados (tratados como null)
 * para que um query param malformado nunca trave o ato narrativo.
 */
function normalizeNarrativeLimit(value) {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}
