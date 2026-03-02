import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });

const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [],
  geminiApiKey: process.env.GEMINI_API_KEY || null,
  llmDailyLimit: parseInt(process.env.LLM_DAILY_LIMIT, 10) || 50,
  minAnswersForAnalysis: parseInt(process.env.MIN_ANSWERS_FOR_ANALYSIS, 10) || 20,
  maxQuestionsPerSession: parseInt(process.env.MAX_QUESTIONS_PER_SESSION, 10) || 40,
};
