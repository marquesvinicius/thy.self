import {
  getResultBySessionId,
  setResultPublic,
  getPublicResultByToken,
} from '../database/queries/result.queries.js';
import { DIMENSIONS } from '../engine/dimensions.js';
import { classifyScore } from '../engine/normalization.js';
import { success } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';

/**
 * Maps a raw `results` row into the shape the frontend expects. Centralised
 * here so the session-scoped endpoint and the public-token endpoint stay in
 * lockstep and never diverge over time.
 *
 * @param {Object} row - Raw Supabase row from `results`.
 * @param {{ includeShareMeta?: boolean }} options
 *   includeShareMeta=true reveals `public_token` / `is_public` / `published_at`
 *   to the owner; the public endpoint omits this metadata.
 */
function toProfilePayload(row, { includeShareMeta = false } = {}) {
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

  const profile = {
    scores,
    dimensions,
    answer_count: row.answer_count,
    calculated_at: row.calculated_at,
    consistency: row.consistency || null,
    llm_interpretation: row.llm_interpretation || null,
  };

  if (includeShareMeta) {
    profile.share = {
      is_public: !!row.is_public,
      public_token: row.public_token || null,
      published_at: row.published_at || null,
    };
  }

  return profile;
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
      profile: toProfilePayload(result, { includeShareMeta: true }),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/result/:session_id/share
 * Body: { is_public?: boolean }  — default true. Pass false to revoke.
 *
 * Flips the result's publication flag and returns the share metadata
 * (token + URL). The URL itself is NOT built here (the frontend controls
 * its own origin), only the token and state.
 */
export async function handleShareResult(req, res, next) {
  try {
    const { session_id } = req.params;
    if (!session_id) {
      throw new AppError('session_id is required', 400, 'MISSING_SESSION_ID');
    }

    const makePublic = req.body?.is_public !== false;

    const updated = await setResultPublic(session_id, makePublic);
    if (!updated) {
      throw new AppError('Result not found', 404, 'RESULT_NOT_FOUND');
    }

    return success(res, {
      session_id,
      share: {
        is_public: !!updated.is_public,
        public_token: updated.public_token || null,
        published_at: updated.published_at || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/public/result/:token
 * Read-only fetch of a result that was explicitly published by its owner.
 * Returns 404 for any token that is private or nonexistent — guessing a
 * token never leaks private data.
 */
export async function handleGetPublicResult(req, res, next) {
  try {
    const { token } = req.params;
    if (!token) {
      throw new AppError('token is required', 400, 'MISSING_TOKEN');
    }

    const result = await getPublicResultByToken(token);
    if (!result) {
      throw new AppError('Result not found or not public', 404, 'PUBLIC_RESULT_NOT_FOUND');
    }

    return success(res, {
      profile: toProfilePayload(result, { includeShareMeta: false }),
      shared_at: result.published_at,
    });
  } catch (err) {
    next(err);
  }
}
