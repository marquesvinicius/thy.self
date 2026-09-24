import {
  getAnswersBySessionId,
  getInterpretativeSignals,
} from '../database/queries/answer.queries.js';
import {
  createResult,
  getResultBySessionId,
} from '../database/queries/result.queries.js';
import { updateSessionStatus } from '../database/queries/session.queries.js';
import { calculateProfile } from '../engine/BigFiveEngine.js';
import { calculateConsistency } from '../engine/consistency.js';
import { calculateResponseStyle } from '../engine/response-style.js';
import { profilePayloadFromRow } from '../engine/profile-payload.js';
import { findClosestArchetype, findFarthestArchetype } from './archetype.service.js';
import { generateInterpretation } from './llm.service.js';
import { AppError } from '../utils/AppError.js';
import {
  MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS,
  QUESTION_KIND,
  SESSION_STATUS,
} from '../config/constants.js';

export async function analyzeSession(sessionId) {
  // Idempotência: se já existe um resultado persistido para esta sessão com
  // interpretação gerada, reutilizamos o que está no banco em vez de
  // disparar nova chamada ao LLM. Isso previne condições de corrida em que
  // React.StrictMode (dev) ou cliques duplicados disparam /analyze duas
  // vezes concorrentemente.
  const existing = await getResultBySessionId(sessionId);
  if (existing && existing.llm_interpretation) {
    const profile = profilePayloadFromRow(existing);
    // Arquétipo não é persistido — a função no Postgres é determinística
    // (desempate por id), então recomputar do escore salvo dá sempre o
    // mesmo resultado. RF005 visível também em resultados reidratados.
    profile.archetype = await findClosestArchetype(profile.scores);
    profile.anti_archetype = await findFarthestArchetype(profile.scores);
    return {
      session_id: sessionId,
      profile,
    };
  }

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

  // 5. Closest + farthest archetypes (Supabase RPCs, Euclidean distance)
  const archetype = await findClosestArchetype(profile.scores);
  const antiArchetype = await findFarthestArchetype(profile.scores);

  // 5b. Response-style signature — deterministic signals about HOW the user
  // answered (extremes, neutrals, acquiescence, hesitation). LLM-only input.
  const responseStyle = calculateResponseStyle(answers);

  // 6. Generate LLM interpretation (graceful — returns null on failure)
  const llmInterpretation = await generateInterpretation(
    profile,
    consistency,
    interpretativeSignals,
    archetype,
    { responseStyle, antiArchetype }
  );

  // 7. Save result with all data
  const savedRow = await createResult(sessionId, profile, consistency, llmInterpretation);

  // 8. Mark session as completed
  await updateSessionStatus(sessionId, SESSION_STATUS.COMPLETED);

  // 9. Return expanded response
  return {
    session_id: sessionId,
    profile: profilePayloadFromRow({
      ...savedRow,
      score_o: profile.scores.O,
      score_c: profile.scores.C,
      score_e: profile.scores.E,
      score_a: profile.scores.A,
      score_n: profile.scores.N,
      answer_count: profile.answerCount,
      consistency,
      llm_interpretation: llmInterpretation,
      archetype,
      anti_archetype: antiArchetype,
      calculated_at: savedRow?.calculated_at || new Date().toISOString(),
    }),
  };
}
