import { analyzeSession } from '../services/analyze.service.js';
import { success } from '../utils/apiResponse.js';

export async function handleAnalyze(req, res, next) {
  try {
    const { session_id } = req.body;
    const data = await analyzeSession(session_id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
}
