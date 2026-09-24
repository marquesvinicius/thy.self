import { getSessionById } from '../database/queries/session.queries.js';
import { AppError } from '../utils/AppError.js';
import { isUuid } from '../utils/uuid.js';
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

  // Formato antes de I/O: um session_id que não é UUID faria o Postgres
  // devolver 22P02 e o erro chegaria ao cliente como 500 (ver utils/uuid.js).
  if (!isUuid(sessionId)) {
    return next(new AppError('session_id must be a valid UUID.', 400, 'VALIDATION_ERROR'));
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
