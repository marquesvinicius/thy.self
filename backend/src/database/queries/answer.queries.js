import { supabase } from '../../config/supabase.js';

export async function createAnswer(sessionId, questionId, alternativeId, answerType = 'alternative_id', rankPosition = null, sliderValue = null, userObservation = null) {
  const { data, error } = await supabase
    .from('answers')
    .insert({
      session_id: sessionId,
      question_id: questionId,
      alternative_id: alternativeId,
      answer_type: answerType,
      rank_position: rankPosition,
      slider_value: sliderValue,
      user_observation: userObservation,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getAnswersBySessionId(sessionId) {
  const { data, error } = await supabase
    .from('answers')
    .select(`
      id,
      question_id,
      alternative_id,
      answer_type,
      rank_position,
      slider_value,
      user_observation,
      answered_at,
      alternatives ( impact_o, impact_c, impact_e, impact_a, impact_n, text ),
      questions ( type, kind, trait, reverse_key, text, question_categories ( slug ) )
    `)
    .eq('session_id', sessionId)
    .order('answered_at', { ascending: true });

  if (error) throw error;
  return data;
}

export async function getAnsweredQuestionIds(sessionId) {
  const { data, error } = await supabase
    .from('answers')
    .select('question_id')
    .eq('session_id', sessionId);

  if (error) throw error;
  return data.map(a => a.question_id);
}

export async function countAnswersBySessionId(sessionId) {
  const { count, error } = await supabase
    .from('answers')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);

  if (error) throw error;
  return count;
}

/**
 * Counts answers whose question belongs to the OBJECTIVE (BFI-2-S) layer.
 * Used to gate analysis readiness — only these answers feed the OCEAN
 * calculation, so `can_analyze` is derived from this count.
 */
export async function countObjectiveAnswersBySessionId(sessionId) {
  const { count, error } = await supabase
    .from('answers')
    .select('id, questions!inner(kind)', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('questions.kind', 'objective');

  if (error) throw error;
  return count || 0;
}

/**
 * Fetches structured signals from every INTERPRETATIVE answer of a session.
 *
 * Interpretative answers never feed the OCEAN calculation; they are consumed
 * only as qualitative narrative context by the LLM. This returns one row per
 * answer, carrying enough metadata for the prompt to group by category and
 * preserve the user's free-text observation.
 *
 * @returns {Promise<Array<{
 *   category_slug: string,
 *   question_text: string,
 *   alternative_text: string|null,
 *   user_observation: string|null,
 * }>>}
 */
export async function getInterpretativeSignals(sessionId) {
  const { data, error } = await supabase
    .from('answers')
    .select(`
      user_observation,
      alternatives ( text ),
      questions!inner (
        text,
        kind,
        question_categories ( slug )
      )
    `)
    .eq('session_id', sessionId)
    .eq('questions.kind', 'interpretative');

  if (error) throw error;

  return (data || [])
    .map(row => ({
      category_slug: row.questions?.question_categories?.slug || 'unknown',
      question_text: row.questions?.text || '',
      alternative_text: row.alternatives?.text ?? null,
      user_observation: row.user_observation ?? null,
    }))
    .filter(sig => sig.alternative_text || sig.user_observation);
}

/**
 * @deprecated Kept as a thin compatibility wrapper around
 * getInterpretativeSignals(), filtered to the legacy "interest" slug.
 * New code should consume getInterpretativeSignals() directly.
 */
export async function getInterestAnswers(sessionId) {
  const signals = await getInterpretativeSignals(sessionId);
  return signals
    .filter(s => s.category_slug === 'interest')
    .map(s => s.alternative_text)
    .filter(Boolean);
}
