import { env } from './environment.js';

export const corsOptions = {
  origin(origin, callback) {
    // Allow requests with no origin (curl, Postman, mobile)
    if (!origin || env.allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  maxAge: 86400,
};
