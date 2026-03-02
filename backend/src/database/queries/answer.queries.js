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
      alternatives ( impact_o, impact_c, impact_e, impact_a, impact_n ),
      questions ( type, question_categories ( slug ) )
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
 * Fetches the texts of alternatives chosen for "interest" category questions.
 * Used as signals to guide LLM reference generation.
 *
 * Two-step approach for robustness:
 *   1. Get question IDs belonging to the "interest" category
 *   2. Get the alternative texts for those questions in this session
 *
 * @returns {Promise<string[]>} Array of alternative texts
 */
export async function getInterestAnswers(sessionId) {
  // Step 1: Get all question IDs in the "interest" category
  const { data: interestQuestions, error: catError } = await supabase
    .from('questions')
    .select('id, question_categories!inner ( slug )')
    .eq('question_categories.slug', 'interest');

  if (catError) throw catError;

  const interestQuestionIds = (interestQuestions || []).map(q => q.id);

  if (interestQuestionIds.length === 0) return [];

  // Step 2: Get answers for those questions in this session, with alternative text
  const { data: answers, error: ansError } = await supabase
    .from('answers')
    .select('alternatives!inner ( text )')
    .eq('session_id', sessionId)
    .in('question_id', interestQuestionIds);

  if (ansError) throw ansError;

  return (answers || [])
    .map(row => row.alternatives?.text)
    .filter(Boolean);
}
