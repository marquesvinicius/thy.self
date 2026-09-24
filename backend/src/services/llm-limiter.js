import { env } from '../config/environment.js';
import { logger } from '../utils/logger.js';
import { supabase } from '../config/supabase.js';

/**
 * Rate limiter das chamadas ao LLM, persistido no banco.
 *
 * Antes os contadores viviam só em memória, o que significava que um
 * restart do servidor zerava as duas proteções — o orçamento diário e o
 * teto de regenerações por sessão. Como o documento (RF005/RNF019)
 * promete esses limites, o estado precisa sobreviver ao processo.
 *
 * Limites:
 *   - LLM_DAILY_LIMIT (env): chamadas por dia (padrão: 50)
 *   - MAX_REGEN_PER_SESSION: regenerações por sessão (padrão: 3)
 *
 * Fallback: se o banco estiver indisponível, cai para contadores em
 * memória em vez de derrubar a geração. É uma degradação consciente —
 * o limite volta a ser por processo, mas o produto continua de pé.
 */

const DEFAULT_DAILY_LIMIT = 50;
const MAX_REGEN_PER_SESSION = 3;
// Detalhamento é mais barato que a geração completa (prompt menor, saída
// menor) e é natural o usuário abrir mais de um — por isso o teto é o dobro
// do de regeneração, e não o mesmo.
const MAX_DETAIL_PER_SESSION = 6;

// Fallback em memória — usado apenas quando o banco falha.
let fallbackDailyCount = 0;
let fallbackResetDate = todayKey();
const fallbackRegenCounts = new Map();
const fallbackDetailCounts = new Map();

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "2026-03-01"
}

function resetFallbackIfNewDay() {
  const today = todayKey();
  if (fallbackResetDate !== today) {
    fallbackDailyCount = 0;
    fallbackResetDate = today;
    fallbackRegenCounts.clear();
    fallbackDetailCounts.clear();
  }
}

/**
 * Limite diário configurado.
 */
function getDailyLimit() {
  return parseInt(env.llmDailyLimit, 10) || DEFAULT_DAILY_LIMIT;
}

/**
 * Lê quantas chamadas já foram feitas hoje.
 * @returns {Promise<number>}
 */
async function readDailyCount() {
  const { data, error } = await supabase
    .from('llm_daily_usage')
    .select('call_count')
    .eq('day', todayKey())
    .maybeSingle();

  if (error) throw error;
  return data?.call_count ?? 0;
}

/**
 * Verifica se uma nova chamada ao LLM cabe no orçamento do dia.
 * @returns {Promise<{ allowed: boolean, remaining: number, limit: number, used: number }>}
 */
export async function checkDailyBudget() {
  const limit = getDailyLimit();

  let used;
  try {
    used = await readDailyCount();
  } catch (err) {
    resetFallbackIfNewDay();
    used = fallbackDailyCount;
    logger.warn('[LLM-Limiter] leitura do orçamento diário falhou; usando contador em memória', {
      error: err.message,
    });
  }

  return {
    allowed: used < limit,
    remaining: Math.max(0, limit - used),
    limit,
    used,
  };
}

/**
 * Registra que uma chamada ao LLM foi feita.
 */
export async function recordLLMCall() {
  try {
    const { data, error } = await supabase.rpc('increment_llm_daily_usage');
    if (error) throw error;
    logger.info(`[LLM-Limiter] chamada registrada. Diário: ${data}/${getDailyLimit()}`);
  } catch (err) {
    resetFallbackIfNewDay();
    fallbackDailyCount += 1;
    logger.warn('[LLM-Limiter] persistência do contador diário falhou; contando em memória', {
      error: err.message,
    });
  }
}

/**
 * Verifica se a sessão ainda pode regenerar interpretações.
 * @param {string} sessionId
 * @returns {Promise<{ allowed: boolean, remaining: number, limit: number, used: number }>}
 */
export async function checkRegenBudget(sessionId) {
  let used;

  try {
    const { data, error } = await supabase
      .from('results')
      .select('regen_count')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) throw error;
    used = data?.regen_count ?? 0;
  } catch (err) {
    used = fallbackRegenCounts.get(sessionId) || 0;
    logger.warn('[LLM-Limiter] leitura do contador de regeneração falhou; usando memória', {
      error: err.message,
    });
  }

  return {
    allowed: used < MAX_REGEN_PER_SESSION,
    remaining: Math.max(0, MAX_REGEN_PER_SESSION - used),
    limit: MAX_REGEN_PER_SESSION,
    used,
  };
}

/**
 * Registra uma regeneração para a sessão.
 * @param {string} sessionId
 */
export async function recordRegen(sessionId) {
  try {
    const { error } = await supabase.rpc('increment_session_regen', {
      p_session_id: sessionId,
    });
    if (error) throw error;
  } catch (err) {
    const count = fallbackRegenCounts.get(sessionId) || 0;
    fallbackRegenCounts.set(sessionId, count + 1);
    logger.warn('[LLM-Limiter] persistência da regeneração falhou; contando em memória', {
      error: err.message,
    });
  }
}

/**
 * Verifica se a sessão ainda pode pedir detalhamento de referência.
 *
 * O detalhamento (`POST /interpret/reference-detail`) também consome uma
 * chamada ao LLM, mas só era limitado pelo orçamento diário GLOBAL — uma
 * única sessão clicando em "mais detalhes" podia esgotar o dia para todos.
 * Mesmo desenho da regeneração: contador atômico no banco, memória como
 * degradação.
 *
 * @param {string} sessionId
 * @returns {Promise<{ allowed: boolean, remaining: number, limit: number, used: number }>}
 */
export async function checkDetailBudget(sessionId) {
  let used;

  try {
    const { data, error } = await supabase
      .from('results')
      .select('detail_count')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) throw error;
    used = data?.detail_count ?? 0;
  } catch (err) {
    used = fallbackDetailCounts.get(sessionId) || 0;
    logger.warn('[LLM-Limiter] leitura do contador de detalhamento falhou; usando memória', {
      error: err.message,
    });
  }

  return {
    allowed: used < MAX_DETAIL_PER_SESSION,
    remaining: Math.max(0, MAX_DETAIL_PER_SESSION - used),
    limit: MAX_DETAIL_PER_SESSION,
    used,
  };
}

/**
 * Registra um detalhamento de referência para a sessão.
 * @param {string} sessionId
 */
export async function recordDetail(sessionId) {
  try {
    const { error } = await supabase.rpc('increment_session_detail', {
      p_session_id: sessionId,
    });
    if (error) throw error;
  } catch (err) {
    const count = fallbackDetailCounts.get(sessionId) || 0;
    fallbackDetailCounts.set(sessionId, count + 1);
    logger.warn('[LLM-Limiter] persistência do detalhamento falhou; contando em memória', {
      error: err.message,
    });
  }
}

/**
 * Estatísticas de uso para monitoramento (rota de desenvolvimento).
 */
export async function getUsageStats() {
  const day = todayKey();

  try {
    const used = await readDailyCount();
    return {
      daily: { used, limit: getDailyLimit(), date: day },
      source: 'database',
    };
  } catch (err) {
    resetFallbackIfNewDay();
    return {
      daily: { used: fallbackDailyCount, limit: getDailyLimit(), date: day },
      source: 'memory-fallback',
      error: err.message,
    };
  }
}
