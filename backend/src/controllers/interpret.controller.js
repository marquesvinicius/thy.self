import {
  getResultBySessionId,
  updateResultInterpretation,
} from '../database/queries/result.queries.js';
import { getInterpretativeSignals } from '../database/queries/answer.queries.js';
import { generateInterpretation, generateReferenceDetail } from '../services/llm.service.js';
import { findClosestArchetype } from '../services/archetype.service.js';
import { checkRegenBudget, recordRegen } from '../services/llm-limiter.js';
import { success } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

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
    const { session_id, exclude_reference_names, exclude_work_titles } = req.body;

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

    const excludedReferenceNames = mergeUniqueNormalized(
      normalizeStringList(exclude_reference_names),
      normalizeStringList((persistedInterpretation.referencias || []).map(ref => ref?.nome))
    );
    const excludedWorkTitles = mergeUniqueNormalized(
      normalizeStringList(exclude_work_titles),
      normalizeStringList((persistedInterpretation.obras_culturais || []).map(work => work?.titulo))
    );

    // Generate new interpretation with higher temperature for variety
    const llmInterpretation = await generateInterpretation(
      context.profile,
      context.consistency,
      context.interpretativeSignals,
      context.archetype,
      {
        temperature: 1.2,
        excludedReferenceNames,
        excludedWorkTitles,
      }
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
    const detail = await generateReferenceDetail(
      context.profile,
      context.consistency,
      context.interpretativeSignals,
      context.archetype,
      {
        nome: reference.nome,
        categoria: reference.categoria,
        motivo: reference.motivo,
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

  // Fetch structured interpretative signals (dilemmas, paradoxes, interests)
  const interpretativeSignals = await getInterpretativeSignals(sessionId);

  // Fetch closest archetype via RPC
  const archetype = await findClosestArchetype(profile.scores);

  return { result, profile, consistency, interpretativeSignals, archetype };
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean);
}

function mergeUniqueNormalized(...lists) {
  const unique = [];
  const seen = new Set();

  for (const list of lists) {
    for (const item of list) {
      const key = normalizeToken(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
  }

  return unique;
}

function normalizeToken(value) {
  return `${value || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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
