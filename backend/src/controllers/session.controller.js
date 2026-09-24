import { createSession } from '../services/session.service.js';
import { success } from '../utils/apiResponse.js';

export async function handleCreateSession(req, res, next) {
  try {
    const session = await createSession();
    return success(res, session, 201);
  } catch (err) {
    next(err);
  }
}
