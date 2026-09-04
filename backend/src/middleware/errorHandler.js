import { describeSupabaseRuntimeFailure } from '../services/supabase-health.service.js';
import { logger } from '../utils/logger.js';
import { error as errorResponse } from '../utils/apiResponse.js';

function looksLikeSupabaseTransportFailure(err) {
  const message = `${err?.message || ''}`.toLowerCase();
  const causeCode = `${err?.cause?.code || err?.code || ''}`.toUpperCase();
  return (
    message.includes('fetch failed')
    || message.includes('econnrefused')
    || message.includes('enotfound')
    || message.includes('etimedout')
    || ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'].includes(causeCode)
  );
}

export function errorHandler(err, req, res, next) {
  logger.error(err.message, { stack: err.stack, path: req.path });

  if (err.statusCode) {
    return errorResponse(res, err.message, err.statusCode, err.code);
  }

  // Supabase-js often surfaces paused/unreachable projects as opaque TypeError: fetch failed.
  if (looksLikeSupabaseTransportFailure(err)) {
    const described = describeSupabaseRuntimeFailure(err);
    logger.error('Mapped Supabase transport failure', {
      code: described.code,
      path: req.path,
      detail: described.detail,
    });
    return errorResponse(res, described.message, described.statusCode, described.code);
  }

  return errorResponse(res, 'Internal server error', 500, 'INTERNAL_ERROR');
}
