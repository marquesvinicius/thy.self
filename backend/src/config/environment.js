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
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : [],
  geminiApiKey: process.env.GEMINI_API_KEY || null,
  llmDailyLimit: parseInt(process.env.LLM_DAILY_LIMIT, 10) || 50,
  // Quantos proxies à frente do servidor são confiáveis para ler o IP real
  // (X-Forwarded-For). Render: 1. Local e testes: 0, nenhum.
  trustProxyHops: Number.isInteger(parseInt(process.env.TRUST_PROXY_HOPS, 10))
    ? parseInt(process.env.TRUST_PROXY_HOPS, 10)
    : (process.env.NODE_ENV === 'production' ? 1 : 0),
};

// RNF009 (controle de acesso à API): em produção, a política de CORS só
// protege se houver uma lista de origens. Sem ela, `cors.js` recusaria todo
// navegador e o sintoma no cliente seria apenas "Failed to fetch" — falha
// silenciosa e cara de diagnosticar. Falhar aqui, na subida, é explícito.
if (env.nodeEnv === 'production' && env.allowedOrigins.length === 0) {
  throw new Error(
    'ALLOWED_ORIGINS é obrigatório quando NODE_ENV=production: sem origens '
    + 'autorizadas, toda requisição de navegador seria bloqueada pelo CORS.',
  );
}
