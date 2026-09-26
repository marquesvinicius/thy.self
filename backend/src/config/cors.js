import { env } from './environment.js';
import { AppError } from '../utils/AppError.js';

const isDev = env.nodeEnv !== 'production';

export const corsOptions = {
  origin(origin, callback) {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) {
      callback(null, true);
      return;
    }

    if (env.allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    // Em development o Next pode servir em localhost, 127.0.0.1 ou IP de
    // rede (ex.: Tailscale). Sem isso o browser reporta só "Failed to fetch".
    if (isDev) {
      callback(null, true);
      return;
    }

    // AppError → o errorHandler responde 403, não um 500 genérico.
    callback(new AppError('Origin not allowed by CORS.', 403, 'CORS_FORBIDDEN'));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  maxAge: 86400,
};
