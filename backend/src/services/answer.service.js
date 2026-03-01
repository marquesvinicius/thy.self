import { createAnswer as createAnswerQuery, countAnswersBySessionId } from '../database/queries/answer.queries.js';
import { getAlternativeWithImpacts } from '../database/queries/question.queries.js';
import { AppError } from '../utils/AppError.js';
import { MIN_ANSWERS_FOR_ANALYSIS } from '../config/constants.js';

export async function recordAnswer(sessionId, questionId, alternativeId) {
  // Validate that the alternative belongs to the question
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

  // Try to insert the answer (UNIQUE constraint handles duplicates)
  let answer;
  try {
    answer = await createAnswerQuery(sessionId, questionId, alternativeId);
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

  const totalAnswered = await countAnswersBySessionId(sessionId);

  return {
    answer_id: answer.id,
    session_id: sessionId,
    question_id: questionId,
    alternative_id: alternativeId,
    answered_at: answer.answered_at,
    progress: {
      answered: totalAnswered,
      minimum_for_analysis: MIN_ANSWERS_FOR_ANALYSIS,
      can_analyze: totalAnswered >= MIN_ANSWERS_FOR_ANALYSIS,
    },
  };
}
