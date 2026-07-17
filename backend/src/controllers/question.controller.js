import { getQuestions } from '../services/question.service.js';
import { success } from '../utils/apiResponse.js';

export async function handleGetQuestions(req, res, next) {
  try {
    const { session_id, count, prefer_question_id } = req.query;
    const parsedCount = count ? Math.min(parseInt(count, 10), 20) : 10;
    const data = await getQuestions(session_id, parsedCount, {
      preferQuestionId: prefer_question_id || null,
    });
    return success(res, data);
  } catch (err) {
    next(err);
  }
}
