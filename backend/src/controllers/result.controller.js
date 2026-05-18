import {
  getResultBySessionId,
} from '../database/queries/result.queries.js';
import { getAnswerReviewBySessionId } from '../database/queries/answer.queries.js';
import { DIMENSIONS } from '../engine/dimensions.js';
import { classifyScore } from '../engine/normalization.js';
import { success } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';

/**
 * Maps a raw `results` row into the shape the frontend expects.
 * @param {Object} row - Raw Supabase row from `results`.
 */
function toProfilePayload(row) {
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
  };
}

/**
 * GET /api/v1/result/:session_id
 * Returns the saved result for a session (no new LLM call).
 * Used on page refresh to avoid re-triggering the LLM.
 */
export async function handleGetResult(req, res, next) {
  try {
    const { session_id } = req.params;

    if (!session_id) {
      throw new AppError('session_id is required', 400, 'MISSING_SESSION_ID');
    }

    const result = await getResultBySessionId(session_id);

    if (!result) {
      throw new AppError('Result not found', 404, 'RESULT_NOT_FOUND');
    }

    return success(res, {
      session_id,
      profile: toProfilePayload(result),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/result/:session_id/review
 * Retorna todas as respostas da sessão anotadas com contexto de revisão
 * (traço influenciado, contribuição Likert assinada, observações do
 * usuário). Permite ao usuário conferir o que respondeu e ver
 * quais traços foram afetados por cada item BFI-2-S.
 */
export async function handleGetAnswerReview(req, res, next) {
  try {
    const { session_id } = req.params;
    if (!session_id) {
      throw new AppError('session_id is required', 400, 'MISSING_SESSION_ID');
    }

    const answers = await getAnswerReviewBySessionId(session_id);
    const objective = answers.filter(a => a.kind === 'objective');
    const interpretative = answers.filter(a => a.kind === 'interpretative');

    const byTrait = {};
    for (const key of ['O', 'C', 'E', 'A', 'N']) byTrait[key] = [];
    for (const row of objective) {
      if (row.trait && byTrait[row.trait]) byTrait[row.trait].push(row);
    }

    return success(res, {
      session_id,
      totals: {
        answered: answers.length,
        objective: objective.length,
        interpretative: interpretative.length,
      },
      objective,
      interpretative,
      by_trait: byTrait,
    });
  } catch (err) {
    next(err);
  }
}
