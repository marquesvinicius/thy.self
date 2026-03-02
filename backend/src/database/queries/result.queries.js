import { supabase } from '../../config/supabase.js';

export async function createResult(sessionId, profile, consistency = null, llmInterpretation = null) {
  const { data, error } = await supabase
    .from('results')
    .upsert({
      session_id: sessionId,
      score_o: profile.scores.O,
      score_c: profile.scores.C,
      score_e: profile.scores.E,
      score_a: profile.scores.A,
      score_n: profile.scores.N,
      answer_count: profile.answerCount,
      raw_impacts: profile.rawImpacts,
      consistency,
      llm_interpretation: llmInterpretation,
    }, { onConflict: 'session_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getResultBySessionId(sessionId) {
  const { data, error } = await supabase
    .from('results')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}
