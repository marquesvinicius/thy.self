import { supabase } from '../config/supabase.js';
import { MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS, QUESTION_KIND } from '../config/constants.js';
import { analyzeSession } from '../services/analyze.service.js';
import { AppError } from '../utils/AppError.js';
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
    const requestedAnswerCount = Number(req.body?.answer_count);
    const extraInterpretative =
      Number.isFinite(requestedAnswerCount) && requestedAnswerCount > MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS
        ? Math.floor(requestedAnswerCount) - MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS
        : 5;

    logger.info('[DEV] Quick-analyze started', {
      min_objective: MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS,
      extra_interpretative: extraInterpretative,
    });

    // 1. Fetch all active questions with their alternatives + kind
    const { data: questions, error: qErr } = await supabase
      .from('questions')
      .select('id, kind, alternatives ( id )')
      .eq('is_active', true);

    if (qErr) throw qErr;

    const eligible = (questions || []).filter(
      q =>
        q?.id &&
        Array.isArray(q.alternatives) &&
        q.alternatives.some(alt => Boolean(alt?.id))
    );

    const objective = eligible.filter(q => q.kind === QUESTION_KIND.OBJECTIVE);
    const interpretative = eligible.filter(q => q.kind === QUESTION_KIND.INTERPRETATIVE);

    if (objective.length < MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS) {
      throw new AppError(
        `Not enough objective (BFI-2-S) questions seeded. Current: ${objective.length}, minimum: ${MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS}.`,
        422,
        'INSUFFICIENT_QUESTION_DATA'
      );
    }

    // 2. Create session
    const { data: session, error: sessErr } = await supabase
      .from('sessions')
      .insert({ nickname: '[TEST] Quick Session' })
      .select()
      .single();

    if (sessErr) throw sessErr;

    const sessionId = session.id;

    const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
    const selectedObjective = shuffle(objective).slice(0, MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS);
    const selectedInterpretative = shuffle(interpretative).slice(
      0,
      Math.min(extraInterpretative, interpretative.length)
    );
    const selected = [...selectedObjective, ...selectedInterpretative];

    // 3. Build random answers
    const answersToInsert = selected.map(q => {
      const alts = q.alternatives.filter(alt => Boolean(alt?.id));
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

    logger.info('[DEV] Random answers inserted', {
      sessionId,
      requestedAnswerCount: answerCount,
      insertedAnswerCount: answersToInsert.length,
    });

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
