import { supabase } from '../config/supabase.js';
import { analyzeSession } from '../services/analyze.service.js';
import { success } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';

/**
 * POST /api/v1/dev/quick-analyze
 * Development-only endpoint that:
 *   1. Creates a new session
 *   2. Picks 20+ random questions and selects random alternatives
 *   3. Inserts all answers at once
 *   4. Runs the full analyze pipeline (including LLM)
 *   5. Returns the session_id + full profile
 *
 * Body (optional): { answer_count?: number }
 */
export async function handleQuickAnalyze(req, res, next) {
  try {
    const answerCount = Math.max(20, Number(req.body?.answer_count) || 25);

    logger.info('[DEV] Quick-analyze started', { answerCount });

    // 1. Create session
    const { data: session, error: sessErr } = await supabase
      .from('sessions')
      .insert({ nickname: '[TEST] Quick Session' })
      .select()
      .single();

    if (sessErr) throw sessErr;

    const sessionId = session.id;

    // 2. Fetch all active questions with their alternatives
    const { data: questions, error: qErr } = await supabase
      .from('questions')
      .select('id, alternatives ( id )')
      .eq('is_active', true);

    if (qErr) throw qErr;

    // Shuffle and pick N questions
    const shuffled = questions.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, answerCount);

    // 3. Build random answers
    const answersToInsert = selected.map(q => {
      const alts = q.alternatives || [];
      const randomAlt = alts[Math.floor(Math.random() * alts.length)];
      return {
        session_id: sessionId,
        question_id: q.id,
        alternative_id: randomAlt.id,
      };
    });

    // Insert all answers at once
    const { error: insertErr } = await supabase
      .from('answers')
      .insert(answersToInsert);

    if (insertErr) throw insertErr;

    logger.info('[DEV] Random answers inserted', { sessionId, count: answersToInsert.length });

    // 4. Run full analyze pipeline
    const result = await analyzeSession(sessionId);

    // 5. Return session_id so frontend can use it
    return success(res, {
      ...result,
      _dev: {
        note: 'Quick-analyze session created with random answers',
        answer_count: answersToInsert.length,
      },
    });
  } catch (err) {
    next(err);
  }
}
