import express from 'express';
import cors from 'cors';
import { corsOptions } from './config/cors.js';
import { errorHandler } from './middleware/errorHandler.js';
import { publicRateLimit } from './middleware/rateLimit.js';
import routes from './routes/index.js';
import { checkSupabaseHealth } from './services/supabase-health.service.js';
import { logger } from './utils/logger.js';

const app = express();

// Global middleware
app.use(cors(corsOptions));
app.use(express.json());
// Express 5 deixa req.body undefined quando não há corpo JSON; os
// controllers desestruturam req.body, então normalizamos aqui (senão: 500).
app.use((req, res, next) => {
  req.body ??= {};
  next();
});

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { query: req.query });
  next();
});

/**
 * Liveness: process is up.
 * Readiness (deep=1): also probes Supabase — use this for startup/preflight.
 *   GET /health        → always 200 if the process is alive
 *   GET /health?deep=1 → 200 ok | 503 degraded when Supabase is unreachable
 */
app.get('/health', async (req, res) => {
  const deep = req.query.deep === '1' || req.query.deep === 'true';

  if (!deep) {
    return res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  }

  const supabase = await checkSupabaseHealth();
  const healthy = supabase.status === 'ok';

  return res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    dependencies: {
      supabase,
    },
  });
});

// API routes — o limitador entra DEPOIS do /health (monitoramento externo
// costuma bater de minuto em minuto e não deve competir com usuários).
app.use('/api/v1', publicRateLimit, routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { message: 'Route not found.', code: 'NOT_FOUND' },
  });
});

// Global error handler
app.use(errorHandler);

export default app;
