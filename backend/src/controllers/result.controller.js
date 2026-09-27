import {
  getResultBySessionId,
} from '../database/queries/result.queries.js';
import { getAnswerReviewBySessionId } from '../database/queries/answer.queries.js';
import { checkRegenBudget } from '../services/llm-limiter.js';
import { findClosestArchetype, findFarthestArchetype } from '../services/archetype.service.js';
import { profilePayloadFromRow } from '../engine/profile-payload.js';
import { success } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { isUuid } from '../utils/uuid.js';
import { DIMENSION_KEYS } from '../config/constants.js';

/**
 * GET /api/v1/result/:session_id
 * Returns the saved result for a session (no new LLM call).
 * Used on page refresh to avoid re-triggering the LLM.
 */
export async function handleGetResult(req, res, next) {
  try {
    // A rota /:session_id garante o parâmetro não vazio.
    const { session_id } = req.params;

    if (!isUuid(session_id)) {
      throw new AppError('session_id must be a valid UUID', 400, 'VALIDATION_ERROR');
    }

    const result = await getResultBySessionId(session_id);

    if (!result) {
      throw new AppError('Result not found', 404, 'RESULT_NOT_FOUND');
    }

    // Orçamento de re-geração vem junto para o frontend sincronizar o
    // contador do botão "gerar novas referências" com a verdade do servidor
    // (o estado local se perdia num reload da página).
    const regenBudget = await checkRegenBudget(session_id);

    const profile = profilePayloadFromRow(result);
    // RF005: arquétipos recomputados do escore salvo (funções determinísticas
    // no Postgres, desempate por id) — não são persistidos em `results`.
    profile.archetype = await findClosestArchetype(profile.scores);
    profile.anti_archetype = await findFarthestArchetype(profile.scores);

    return success(res, {
      session_id,
      profile,
      _regen: {
        used: regenBudget.used,
        remaining: regenBudget.remaining,
        limit: regenBudget.limit,
      },
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
    if (!isUuid(session_id)) {
      throw new AppError('session_id must be a valid UUID', 400, 'VALIDATION_ERROR');
    }

    const answers = await getAnswerReviewBySessionId(session_id);
    const objective = answers.filter(a => a.kind === 'objective');
    const interpretative = answers.filter(a => a.kind === 'interpretative');

    const byTrait = {};
    for (const key of DIMENSION_KEYS) byTrait[key] = [];
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
