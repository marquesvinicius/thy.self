import { recordAnswer } from '../services/answer.service.js';
import { success } from '../utils/apiResponse.js';

export async function handleAnswer(req, res, next) {
  try {
    const { session_id, question_id, alternative_id, answer_type, rank_position, slider_value, user_observation } = req.body;
    const data = await recordAnswer(session_id, question_id, alternative_id, answer_type, rank_position, slider_value, user_observation);
    return success(res, data, 201);
  } catch (err) {
    next(err);
  }
}
