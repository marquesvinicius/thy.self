import { getAnswersBySessionId } from '../database/queries/answer.queries.js';
import { createResult } from '../database/queries/result.queries.js';
import { updateSessionStatus } from '../database/queries/session.queries.js';
import { calculateProfile } from '../engine/BigFiveEngine.js';
import { AppError } from '../utils/AppError.js';
import { MIN_ANSWERS_FOR_ANALYSIS, SESSION_STATUS } from '../config/constants.js';

export async function analyzeSession(sessionId) {
  // Fetch all answers with impact values
  const answers = await getAnswersBySessionId(sessionId);

  if (answers.length < MIN_ANSWERS_FOR_ANALYSIS) {
    throw new AppError(
      `Not enough answers. Current: ${answers.length}, minimum: ${MIN_ANSWERS_FOR_ANALYSIS}.`,
      422,
      'INSUFFICIENT_DATA'
    );
  }

  // Calculate the Big Five profile
  const profile = calculateProfile(answers);

  // Save the result and mark session as completed
  await createResult(sessionId, profile);
  await updateSessionStatus(sessionId, SESSION_STATUS.COMPLETED);

  return {
    session_id: sessionId,
    profile: {
      scores: profile.scores,
      dimensions: profile.dimensions,
      answer_count: profile.answerCount,
      calculated_at: new Date().toISOString(),
    },
  };
}
