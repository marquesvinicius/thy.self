import { getResultBySessionId } from '../database/queries/result.queries.js';
import { DIMENSIONS } from '../engine/dimensions.js';
import { classifyScore } from '../engine/normalization.js';
import { success } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';

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

    // Reconstruct the profile shape the frontend expects
    const scores = {
      O: Number(result.score_o),
      C: Number(result.score_c),
      E: Number(result.score_e),
      A: Number(result.score_a),
      N: Number(result.score_n),
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

    return success(res, {
      session_id,
      profile: {
        scores,
        dimensions,
        answer_count: result.answer_count,
        calculated_at: result.calculated_at,
        consistency: result.consistency || null,
        llm_interpretation: result.llm_interpretation || null,
      },
    });
  } catch (err) {
    next(err);
  }
}
