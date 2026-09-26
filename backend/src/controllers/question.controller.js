import { getQuestions } from '../services/question.service.js';
import { success } from '../utils/apiResponse.js';

export async function handleGetQuestions(req, res, next) {
  try {
    const { session_id, count, narrative_limit } = req.query;
    const parsedCount = parseBatchSize(count);
    const data = await getQuestions(session_id, parsedCount, {
      // Teto do ato narrativo (versão curta). Ausente = versão completa.
      narrativeLimit: narrative_limit ?? null,
    });
    return success(res, data);
  } catch (err) {
    next(err);
  }
}

const DEFAULT_BATCH = 10;
const MAX_BATCH = 20;

/**
 * Tamanho do lote pedido na query string. Valor ausente, não numérico ou
 * não positivo usa o padrão — antes, `count=abc` virava NaN e o lote nunca
 * atingia o limite, devolvendo todas as perguntas pendentes de uma vez.
 */
function parseBatchSize(count) {
  const parsed = Number.parseInt(count, 10);
  if (!(parsed > 0)) return DEFAULT_BATCH;
  return Math.min(parsed, MAX_BATCH);
}
