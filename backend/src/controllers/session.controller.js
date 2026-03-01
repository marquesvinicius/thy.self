import { createSession } from '../services/session.service.js';
import { success } from '../utils/apiResponse.js';

export async function handleCreateSession(req, res, next) {
  try {
    const { nickname } = req.body;
    const session = await createSession(nickname);
    return success(res, session, 201);
  } catch (err) {
    next(err);
  }
}
