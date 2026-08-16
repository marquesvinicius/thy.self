import { getQuestions } from '../services/question.service.js';
import { success } from '../utils/apiResponse.js';

export async function handleGetQuestions(req, res, next) {
  try {
    const { session_id, count, narrative_limit } = req.query;
    const parsedCount = count ? Math.min(parseInt(count, 10), 20) : 10;
    const data = await getQuestions(session_id, parsedCount, {
      // Teto do ato narrativo (versão curta). Ausente = versão completa.
      narrativeLimit: narrative_limit != null ? narrative_limit : null,
    });
    return success(res, data);
  } catch (err) {
    next(err);
  }
}
