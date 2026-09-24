import {
  getResultBySessionId,
  updateResultInterpretation,
} from '../database/queries/result.queries.js';
import { getInterpretativeSignals } from '../database/queries/answer.queries.js';
import {
  generateInterpretation,
  generateReferenceDetail,
  getRegenLens,
} from '../services/llm.service.js';
import { findClosestArchetype } from '../services/archetype.service.js';
import { checkRegenBudget, recordRegen } from '../services/llm-limiter.js';
import { success } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { buildDimensions, scoresFromRow } from '../engine/profile-payload.js';
import {
  buildRegenExclusions,
  estimateRegensSoFar,
  mergeInterpretation,
} from '../services/interpretation-merge.js';

/**
 * POST /api/v1/interpret
 * Re-generates LLM interpretation with higher temperature for variety.
 * Does NOT recalculate scores — reuses existing result. The merged
 * interpretation (accumulated references/works) is persisted.
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

    const context = await loadInterpretationContext(session_id);
    const persistedInterpretation = context.result.llm_interpretation || {};
    const exclusions = buildRegenExclusions(persistedInterpretation, req.body);
    const regenLens = getRegenLens(estimateRegensSoFar(
      regenBudget.used,
      (persistedInterpretation.referencias || []).length,
    ));

    // Temperatura alta para variedade. Só `referencias` / `obras_culturais`
    // da nova geração interessam: o texto interpretativo é preservado
    // (avaliação com usuários — ver interpretation-merge.js).
    const llmInterpretation = await generateInterpretation(
      context.profile,
      context.consistency,
      context.interpretativeSignals,
      context.archetype,
      { temperature: 1.2, ...exclusions, regenLens }
    );

    if (!llmInterpretation) {
      throw new AppError(
        'Interpretação indisponível. Limite diário pode ter sido atingido.',
        503,
        'LLM_UNAVAILABLE'
      );
    }

    const mergedInterpretation = mergeInterpretation(persistedInterpretation, llmInterpretation);

    // Persiste o estado acumulado no banco para que o PDF e qualquer
    // /result/:session_id subsequente enxerguem a mesma coisa.
    try {
      await updateResultInterpretation(session_id, mergedInterpretation);
    } catch (persistErr) {
      logger.error('Failed to persist merged interpretation on regen', {
        error: persistErr.message,
        session_id,
      });
    }

    // Record successful re-generation
    recordRegen(session_id);

    return success(res, {
      session_id,
      llm_interpretation: mergedInterpretation,
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
 * POST /api/v1/interpret/reference-detail
 * Generates a focused LLM comparison between the user and one selected reference.
 * Response is ephemeral (not persisted to database).
 */
export async function handleReferenceDetail(req, res, next) {
  try {
    const { session_id, reference } = req.body;

    if (!session_id) {
      throw new AppError('session_id is required', 400, 'MISSING_SESSION_ID');
    }
    if (!reference || typeof reference !== 'object') {
      throw new AppError('reference is required', 400, 'MISSING_REFERENCE');
    }
    if (!reference.nome || typeof reference.nome !== 'string') {
      throw new AppError('reference.nome is required', 400, 'MISSING_REFERENCE_NAME');
    }

    const context = await loadInterpretationContext(session_id);
    const persistedInterpretation = context.result.llm_interpretation || {};
    const otherReferences = (persistedInterpretation.referencias || [])
      .filter(ref => ref && ref.nome && ref.nome !== reference.nome)
      .map(ref => ({ nome: ref.nome, motivo: ref.motivo }));

    const detail = await generateReferenceDetail(
      context.profile,
      context.consistency,
      context.interpretativeSignals,
      context.archetype,
      {
        nome: reference.nome,
        categoria: reference.categoria,
        motivo: reference.motivo,
      },
      {
        priorInterpretation: persistedInterpretation.interpretacao || '',
        otherReferences,
      }
    );

    if (!detail) {
      throw new AppError(
        'Detalhamento indisponível. Limite diário pode ter sido atingido.',
        503,
        'LLM_UNAVAILABLE'
      );
    }

    return success(res, {
      session_id,
      reference_detail: detail,
    });
  } catch (err) {
    next(err);
  }
}

async function loadInterpretationContext(sessionId) {
  const result = await getResultBySessionId(sessionId);

  if (!result) {
    throw new AppError(
      'No result found for this session. Run /analyze first.',
      404,
      'RESULT_NOT_FOUND'
    );
  }

  // Reconstruct profile shape from saved result
  const scores = scoresFromRow(result);
  const profile = { scores, dimensions: buildDimensions(scores) };

  const consistency = result.consistency || null;

  // Fetch structured interpretative signals (dilemmas, paradoxes, interests)
  const interpretativeSignals = await getInterpretativeSignals(sessionId);

  // Fetch closest archetype via RPC
  const archetype = await findClosestArchetype(profile.scores);

  return { result, profile, consistency, interpretativeSignals, archetype };
}
