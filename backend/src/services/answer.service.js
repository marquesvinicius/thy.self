import {
  createAnswer as createAnswerQuery,
  countAnswersBySessionId,
  countObjectiveAnswersBySessionId,
} from '../database/queries/answer.queries.js';
import { getAlternativeWithImpacts } from '../database/queries/question.queries.js';
import { AppError } from '../utils/AppError.js';
import { MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS } from '../config/constants.js';

export async function recordAnswer(sessionId, questionId, alternativeId, answerType = 'alternative_id', rankPosition = null, sliderValue = null, userObservation = null) {
  // Validate that the alternative belongs to the question only if using standard alternatives
  if (answerType === 'alternative_id' && alternativeId) {
    const alternative = await getAlternativeWithImpacts(alternativeId);

    if (!alternative) {
      throw new AppError('Alternative not found.', 404, 'NOT_FOUND');
    }

    if (alternative.question_id !== questionId) {
      throw new AppError(
        'Alternative does not belong to the specified question.',
        400,
        'VALIDATION_ERROR'
      );
    }
  }

  // Try to insert the answer (UNIQUE constraint handles duplicates)
  let answer;
  try {
    answer = await createAnswerQuery(sessionId, questionId, alternativeId, answerType, rankPosition, sliderValue, userObservation);
  } catch (err) {
    if (err.code === '23505') {
      throw new AppError(
        'This question has already been answered in this session.',
        409,
        'CONFLICT'
      );
    }
    throw err;
  }

  const [totalAnswered, objectiveAnswered] = await Promise.all([
    countAnswersBySessionId(sessionId),
    countObjectiveAnswersBySessionId(sessionId),
  ]);

  return {
    answer_id: answer.id,
    session_id: sessionId,
    question_id: questionId,
    alternative_id: alternativeId,
    answer_type: answerType,
    answered_at: answer.answered_at,
    progress: {
      answered: totalAnswered,
      objective_answered: objectiveAnswered,
      minimum_for_analysis: MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS,
      can_analyze: objectiveAnswered >= MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS,
    },
  };
}
