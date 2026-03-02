import { getAnswersBySessionId, getInterestAnswers } from '../database/queries/answer.queries.js';
import { createResult } from '../database/queries/result.queries.js';
import { updateSessionStatus } from '../database/queries/session.queries.js';
import { calculateProfile } from '../engine/BigFiveEngine.js';
import { calculateConsistency } from '../engine/consistency.js';
import { findClosestArchetype } from './archetype.service.js';
import { generateInterpretation } from './llm.service.js';
import { AppError } from '../utils/AppError.js';
import { MIN_ANSWERS_FOR_ANALYSIS, SESSION_STATUS } from '../config/constants.js';

export async function analyzeSession(sessionId) {
  // 1. Fetch all answers with impact values
  const answers = await getAnswersBySessionId(sessionId);

  if (answers.length < MIN_ANSWERS_FOR_ANALYSIS) {
    throw new AppError(
      `Not enough answers. Current: ${answers.length}, minimum: ${MIN_ANSWERS_FOR_ANALYSIS}.`,
      422,
      'INSUFFICIENT_DATA'
    );
  }

  // 2. Calculate the Big Five profile (deterministic)
  const profile = calculateProfile(answers);

  // 3. Calculate per-dimension consistency (contradiction detection)
  const consistency = calculateConsistency(answers);

  // 4. Extract interest signals for LLM context
  const interestSignals = await getInterestAnswers(sessionId);

  // 5. Find the closest archetype (Supabase RPC calculates Euclidean distance)
  const archetype = await findClosestArchetype(profile.scores);

  // 6. Generate LLM interpretation (graceful — returns null on failure)
  const llmInterpretation = await generateInterpretation(
    profile,
    consistency,
    interestSignals,
    archetype
  );

  // 6. Save result with all data
  await createResult(sessionId, profile, consistency, llmInterpretation);

  // 7. Mark session as completed
  await updateSessionStatus(sessionId, SESSION_STATUS.COMPLETED);

  // 8. Return expanded response
  return {
    session_id: sessionId,
    profile: {
      scores: profile.scores,
      dimensions: profile.dimensions,
      answer_count: profile.answerCount,
      calculated_at: new Date().toISOString(),
      consistency,
      llm_interpretation: llmInterpretation,
    },
  };
}
