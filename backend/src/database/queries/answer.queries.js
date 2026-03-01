import { supabase } from '../../config/supabase.js';

export async function createAnswer(sessionId, questionId, alternativeId) {
  const { data, error } = await supabase
    .from('answers')
    .insert({
      session_id: sessionId,
      question_id: questionId,
      alternative_id: alternativeId,
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
      answered_at,
      alternatives ( impact_o, impact_c, impact_e, impact_a, impact_n )
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
