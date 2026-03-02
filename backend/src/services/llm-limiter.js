import { env } from '../config/environment.js';
import { logger } from '../utils/logger.js';

/**
 * Simple in-memory rate limiter for LLM calls.
 * Resets daily. Prevents runaway costs.
 *
 * Limits:
 *   - LLM_DAILY_LIMIT (env): max LLM calls per day (default: 50)
 *   - MAX_REGEN_PER_SESSION: max re-generations per session (default: 3)
 */

const DEFAULT_DAILY_LIMIT = 50;
const MAX_REGEN_PER_SESSION = 3;

// In-memory counters (reset on server restart or daily)
let dailyCount = 0;
let dailyResetDate = todayKey();
const sessionRegenCounts = new Map();

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "2026-03-01"
}

function resetIfNewDay() {
  const today = todayKey();
  if (dailyResetDate !== today) {
    logger.info(`[LLM-Limiter] New day detected. Resetting daily counter. Previous: ${dailyCount}`);
    dailyCount = 0;
    dailyResetDate = today;
    sessionRegenCounts.clear();
  }
}

/**
 * Returns the configured daily LLM call limit.
 */
function getDailyLimit() {
  return parseInt(env.llmDailyLimit, 10) || DEFAULT_DAILY_LIMIT;
}

/**
 * Checks if a new LLM call is allowed within the daily budget.
 * @returns {{ allowed: boolean, remaining: number, limit: number }}
 */
export function checkDailyBudget() {
  resetIfNewDay();
  const limit = getDailyLimit();
  const remaining = Math.max(0, limit - dailyCount);
  return {
    allowed: dailyCount < limit,
    remaining,
    limit,
    used: dailyCount,
  };
}

/**
 * Records that an LLM call was made.
 */
export function recordLLMCall() {
  resetIfNewDay();
  dailyCount++;
  logger.info(`[LLM-Limiter] Call recorded. Daily: ${dailyCount}/${getDailyLimit()}`);
}

/**
 * Checks if a session can still re-generate interpretations.
 * @param {string} sessionId
 * @returns {{ allowed: boolean, remaining: number, limit: number }}
 */
export function checkRegenBudget(sessionId) {
  resetIfNewDay();
  const count = sessionRegenCounts.get(sessionId) || 0;
  return {
    allowed: count < MAX_REGEN_PER_SESSION,
    remaining: Math.max(0, MAX_REGEN_PER_SESSION - count),
    limit: MAX_REGEN_PER_SESSION,
    used: count,
  };
}

/**
 * Records a re-generation for a session.
 * @param {string} sessionId
 */
export function recordRegen(sessionId) {
  const count = sessionRegenCounts.get(sessionId) || 0;
  sessionRegenCounts.set(sessionId, count + 1);
}

/**
 * Returns current usage stats for monitoring.
 */
export function getUsageStats() {
  return {
    daily: { used: dailyCount, limit: getDailyLimit(), date: dailyResetDate },
    activeSessions: sessionRegenCounts.size,
  };
}
