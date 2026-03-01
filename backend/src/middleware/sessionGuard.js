import { getSessionById } from '../database/queries/session.queries.js';
import { AppError } from '../utils/AppError.js';
import { SESSION_STATUS } from '../config/constants.js';

/**
 * Middleware that validates a session exists and is active.
 * Reads session_id from req.body or req.query.
 */
export async function sessionGuard(req, res, next) {
  const sessionId = req.body?.session_id || req.query?.session_id;

  if (!sessionId) {
    return next(new AppError('session_id is required.', 400, 'VALIDATION_ERROR'));
  }

  const session = await getSessionById(sessionId);

  if (!session) {
    return next(new AppError('Session not found.', 404, 'NOT_FOUND'));
  }

  if (session.status === SESSION_STATUS.COMPLETED) {
    return next(new AppError('Session already completed.', 410, 'GONE'));
  }

  req.session = session;
  next();
}
