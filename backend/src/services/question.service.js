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

const isObjective = q => q.kind === QUESTION_KIND.OBJECTIVE;
const isInterpretative = q => q.kind === QUESTION_KIND.INTERPRETATIVE;

/** A ordem da sessão é sorteada uma vez e persistida (fonte da verdade). */
async function resolveQuestionOrder(sessionId, session, allQuestions) {
  if (Array.isArray(session.question_order) && session.question_order.length > 0) {
    return session.question_order;
  }
  const order = buildQuestionOrder(allQuestions);
  await updateSessionQuestionOrder(sessionId, order);
  return order;
}

/**
 * Progresso por etapa (camada objetiva × interpretativa) — permite ao
 * frontend mostrar "12/30 · BFI-2-S" em vez de só o total agregado — e o
 * orçamento narrativo restante. Sem teto (versão completa), o ato 2 vai até
 * esgotar o catálogo; com teto (versão curta), para nele.
 */
function stageProgressOf(allQuestions, answeredCount, objectiveAnswered, narrativeLimit) {
  const objectiveTotal = allQuestions.filter(isObjective).length;
  const catalogNarrative = allQuestions.length - objectiveTotal;
  const interpretativeAnswered = Math.max(0, answeredCount - objectiveAnswered);
  const interpretativeTotal = narrativeLimit != null
    ? Math.min(narrativeLimit, catalogNarrative)
    : catalogNarrative;

  return {
    narrativeBudget: Math.max(0, interpretativeTotal - interpretativeAnswered),
    stageProgress: {
      objective_answered: objectiveAnswered,
      objective_total: objectiveTotal,
      interpretative_answered: interpretativeAnswered,
      interpretative_total: interpretativeTotal,
    },
  };
}

/** Próximas perguntas pela ordem fixa, sem estourar o orçamento narrativo. */
function takeBatch(available, count, narrativeBudget) {
  const batch = [];
  let narrativeUsed = 0;
  for (const question of available) {
    if (batch.length >= count) break;
    if (isInterpretative(question)) {
      if (narrativeUsed >= narrativeBudget) break;
      narrativeUsed += 1;
    }
    batch.push(question);
  }
  return batch;
}

/**
 * Formato público da pergunta. Itens objetivos preservam a ordem Likert das
 * alternativas; interpretativos as embaralham para reduzir ancoragem na
 * posição; reflexões são texto livre e não expõem alternativas.
 */
function toPublicQuestion(q) {
  const type = q.type || 'multiple_choice';
  let alternatives = [];
  if (type !== 'reflection') {
    const sorted = [...(q.alternatives || [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
    alternatives = (isObjective(q) ? sorted : shuffle(sorted))
      .map(a => ({ id: a.id, text: a.text }));
  }

  return {
    id: q.id,
    text: q.text,
    context: q.context,
    category: q.question_categories?.slug,
    kind: q.kind || QUESTION_KIND.INTERPRETATIVE,
    trait: q.trait || null,
    type,
    alternatives,
  };
}

/**
 * Dual-Core picker.
 *
 * Serve o próximo lote seguindo a ordem materializada da sessão: as 30
 * objetivas (BFI-2-S, nunca subamostradas — só elas alimentam o OCEAN) e
 * depois o ato narrativo, limitado pelo teto escolhido pelo usuário.
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
    return { questions: [], total_answered: 0, total_available: 0, can_analyze: false };
  }

  const questionOrder = await resolveQuestionOrder(sessionId, session, allQuestions);
  const questionsById = new Map(allQuestions.map(q => [q.id, q]));
  const answeredSet = new Set(answeredIds);
  const unanswered = questionOrder
    .map(id => questionsById.get(id))
    .filter(q => q && !answeredSet.has(q.id));

  const { narrativeBudget, stageProgress } = stageProgressOf(
    allQuestions,
    answeredIds.length,
    objectiveAnswered,
    normalizeNarrativeLimit(options.narrativeLimit),
  );

  // Orçamento narrativo esgotado → só as objetivas seguem elegíveis (o que
  // encerra o quiz quando elas também acabaram).
  const available = narrativeBudget > 0 ? unanswered : unanswered.filter(isObjective);

  // O total exposto respeita o teto: a barra de progresso de quem escolheu
  // a versão curta não conta as narrativas do catálogo inteiro.
  const totalAvailable = available.filter(isObjective).length
    + Math.min(narrativeBudget, available.filter(isInterpretative).length);

  const batchIds = takeBatch(available, count, narrativeBudget).map(q => q.id);
  const withAlternatives = batchIds.length > 0 ? await getQuestionsWithAlternatives(batchIds) : [];

  // Preserva a ordem do lote após o join; item desativado entre as duas
  // consultas simplesmente some.
  const byId = new Map(withAlternatives.map(q => [String(q.id), q]));
  const questions = batchIds
    .map(id => byId.get(String(id)))
    .filter(Boolean)
    .map(toPublicQuestion);

  return {
    questions,
    total_answered: answeredIds.length,
    total_available: totalAvailable,
    can_analyze: objectiveAnswered >= MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS,
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
