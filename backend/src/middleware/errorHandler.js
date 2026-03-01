import { logger } from '../utils/logger.js';
import { error as errorResponse } from '../utils/apiResponse.js';

export function errorHandler(err, req, res, next) {
  logger.error(err.message, { stack: err.stack, path: req.path });

  if (err.statusCode) {
    return errorResponse(res, err.message, err.statusCode, err.code);
  }

  return errorResponse(res, 'Internal server error', 500, 'INTERNAL_ERROR');
}
