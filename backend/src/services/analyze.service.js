import {
  getAnswersBySessionId,
  getInterpretativeSignals,
} from '../database/queries/answer.queries.js';
import { createResult } from '../database/queries/result.queries.js';
import { updateSessionStatus } from '../database/queries/session.queries.js';
import { calculateProfile } from '../engine/BigFiveEngine.js';
import { calculateConsistency } from '../engine/consistency.js';
import { findClosestArchetype } from './archetype.service.js';
import { generateInterpretation } from './llm.service.js';
import { AppError } from '../utils/AppError.js';
import {
  MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS,
  QUESTION_KIND,
  SESSION_STATUS,
} from '../config/constants.js';

export async function analyzeSession(sessionId) {
  // 1. Fetch all answers (objective + interpretative) for this session
  const answers = await getAnswersBySessionId(sessionId);

  // Dual-Core: the MIN threshold applies strictly to objective (BFI-2-S)
  // answers. Interpretative answers alone never unlock analysis.
  const objectiveCount = answers.filter(
    a => a.questions?.kind === QUESTION_KIND.OBJECTIVE
  ).length;

  if (objectiveCount < MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS) {
    throw new AppError(
      `Not enough BFI-2-S answers. Current: ${objectiveCount}, minimum: ${MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS}.`,
      422,
      'INSUFFICIENT_DATA'
    );
  }

  // 2. Calculate the Big Five profile (deterministic, objective layer only)
  const profile = calculateProfile(answers);

  // 3. Calculate per-trait consistency (contradiction detection, objective only)
  const consistency = calculateConsistency(answers);

  // 4. Gather interpretative signals — structured qualitative context for LLM
  const interpretativeSignals = await getInterpretativeSignals(sessionId);

  // 5. Find the closest archetype (Supabase RPC calculates Euclidean distance)
  const archetype = await findClosestArchetype(profile.scores);

  // 6. Generate LLM interpretation (graceful — returns null on failure)
  const llmInterpretation = await generateInterpretation(
    profile,
    consistency,
    interpretativeSignals,
    archetype
  );

  // 7. Save result with all data
  await createResult(sessionId, profile, consistency, llmInterpretation);

  // 8. Mark session as completed
  await updateSessionStatus(sessionId, SESSION_STATUS.COMPLETED);

  // 9. Return expanded response
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
