import { getResultBySessionId } from '../database/queries/result.queries.js';
import { getInterestAnswers } from '../database/queries/answer.queries.js';
import { generateInterpretation } from '../services/llm.service.js';
import { findClosestArchetype } from '../services/archetype.service.js';
import { checkRegenBudget, recordRegen } from '../services/llm-limiter.js';
import { success } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';

/**
 * POST /api/v1/interpret
 * Re-generates LLM interpretation with higher temperature for variety.
 * Does NOT recalculate scores — reuses existing result.
 * Response is ephemeral (not persisted to database).
 *
 * Rate limited: max 3 re-generations per session.
 */
export async function handleInterpret(req, res, next) {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      throw new AppError('session_id is required', 400, 'MISSING_SESSION_ID');
    }

    // Check per-session re-generation limit
    const regenBudget = checkRegenBudget(session_id);
    if (!regenBudget.allowed) {
      throw new AppError(
        `Limite de re-geração atingido (${regenBudget.limit}/${regenBudget.limit}). Inicie uma nova sessão.`,
        429,
        'REGEN_LIMIT_REACHED'
      );
    }

    // Fetch existing result (scores must already be calculated)
    const result = await getResultBySessionId(session_id);

    if (!result) {
      throw new AppError(
        'No result found for this session. Run /analyze first.',
        404,
        'RESULT_NOT_FOUND'
      );
    }

    // Reconstruct profile shape from saved result
    const profile = {
      scores: {
        O: Number(result.score_o),
        C: Number(result.score_c),
        E: Number(result.score_e),
        A: Number(result.score_a),
        N: Number(result.score_n),
      },
      dimensions: buildDimensionsFromScores(result),
    };

    const consistency = result.consistency || null;

    // Fetch interest signals
    const interestSignals = await getInterestAnswers(session_id);

    // Fetch closest archetype via RPC
    const archetype = await findClosestArchetype(profile.scores);

    // Generate new interpretation with higher temperature for variety
    const llmInterpretation = await generateInterpretation(
      profile,
      consistency,
      interestSignals,
      archetype,
      { temperature: 1.2 }
    );

    if (!llmInterpretation) {
      throw new AppError(
        'Interpretação indisponível. Limite diário pode ter sido atingido.',
        503,
        'LLM_UNAVAILABLE'
      );
    }

    // Record successful re-generation
    recordRegen(session_id);

    return success(res, {
      session_id,
      llm_interpretation: llmInterpretation,
      _regen: {
        remaining: regenBudget.remaining - 1,
        limit: regenBudget.limit,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Reconstructs dimension objects from stored scores for the LLM prompt.
 */
function buildDimensionsFromScores(result) {
  const dims = [
    { key: 'O', name: 'Abertura a Experiências', score: Number(result.score_o) },
    { key: 'C', name: 'Conscienciosidade', score: Number(result.score_c) },
    { key: 'E', name: 'Extroversão', score: Number(result.score_e) },
    { key: 'A', name: 'Amabilidade', score: Number(result.score_a) },
    { key: 'N', name: 'Neuroticismo', score: Number(result.score_n) },
  ];

  return dims.map(d => ({
    ...d,
    level: scoreToLevel(d.score),
  }));
}

function scoreToLevel(score) {
  if (score >= 75) return 'alto';
  if (score >= 55) return 'moderado-alto';
  if (score >= 45) return 'moderado';
  if (score >= 25) return 'moderado-baixo';
  return 'baixo';
}
