import { recordAnswer, undoLastAnswer } from '../services/answer.service.js';
import { success } from '../utils/apiResponse.js';

export async function handleAnswer(req, res, next) {
  try {
    const { session_id, question_id, alternative_id, answer_type, user_observation } = req.body;
    const data = await recordAnswer(session_id, question_id, alternative_id, answer_type, user_observation);
    return success(res, data, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/answer/undo
 * Desfaz a última resposta da sessão. Usado pelo botão "voltar" do quiz,
 * introduzido após o teste de usabilidade para permitir que o usuário
 * corrija respostas marcadas por engano (já que os botões "confirmar"
 * foram removidos e cada clique commita imediatamente).
 */
export async function handleUndoAnswer(req, res, next) {
  try {
    const { session_id } = req.body;
    const data = await undoLastAnswer(session_id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
}
