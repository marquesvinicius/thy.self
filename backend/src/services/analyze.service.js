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
import { DIMENSIONS } from '../engine/dimensions.js';
import { classifyScore } from '../engine/normalization.js';
import { findClosestArchetype } from './archetype.service.js';
import { generateInterpretation } from './llm.service.js';
import { AppError } from '../utils/AppError.js';
import {
  MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS,
  QUESTION_KIND,
  SESSION_STATUS,
} from '../config/constants.js';

/**
 * Reconstrói o payload canônico de resposta do /analyze a partir de uma
 * linha já persistida em `results`. Mantém o shape idêntico ao que o
 * frontend receberia na análise original — scores, dimensões com level,
 * consistency e llm_interpretation.
 */
function buildProfilePayloadFromRow(row) {
  const scores = {
    O: Number(row.score_o),
    C: Number(row.score_c),
    E: Number(row.score_e),
    A: Number(row.score_a),
    N: Number(row.score_n),
  };

  const dimensions = DIMENSIONS.map(dim => ({
    key: dim.key,
    name: dim.name,
    description: dim.description,
    lowLabel: dim.lowLabel,
    highLabel: dim.highLabel,
    score: scores[dim.key],
    level: classifyScore(scores[dim.key]),
  }));

  return {
    scores,
    dimensions,
    answer_count: row.answer_count,
    calculated_at: row.calculated_at,
    consistency: row.consistency || null,
    llm_interpretation: row.llm_interpretation || null,
    archetype: row.archetype || null,
  };
}

export async function analyzeSession(sessionId) {
  // Idempotência: se já existe um resultado persistido para esta sessão com
  // interpretação gerada, reutilizamos o que está no banco em vez de
  // disparar nova chamada ao LLM. Isso previne condições de corrida em que
  // React.StrictMode (dev) ou cliques duplicados disparam /analyze duas
  // vezes concorrentemente.
  const existing = await getResultBySessionId(sessionId);
  if (existing && existing.llm_interpretation) {
    const profile = buildProfilePayloadFromRow(existing);
    // Arquétipo não é persistido — a função no Postgres é determinística
    // (desempate por id), então recomputar do escore salvo dá sempre o
    // mesmo resultado. RF005 visível também em resultados reidratados.
    profile.archetype = await findClosestArchetype(profile.scores);
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
  const savedRow = await createResult(sessionId, profile, consistency, llmInterpretation);

  // 8. Mark session as completed
  await updateSessionStatus(sessionId, SESSION_STATUS.COMPLETED);

  // 9. Return expanded response
  return {
    session_id: sessionId,
    profile: buildProfilePayloadFromRow({
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
      calculated_at: savedRow?.calculated_at || new Date().toISOString(),
    }),
  };
}
