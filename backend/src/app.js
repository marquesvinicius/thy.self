import express from 'express';
import cors from 'cors';
import { corsOptions } from './config/cors.js';
import { errorHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';
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

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API routes
app.use('/api/v1', routes);

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
