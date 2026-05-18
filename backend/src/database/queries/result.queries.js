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

/**
 * Atualiza APENAS o campo `llm_interpretation` de um resultado existente.
 *
 * Usado pelo endpoint de re-geração (`POST /interpret`) quando o usuário
 * pede mais referências/obras. Persistir aqui garante que o PDF sempre
 * reflita o estado acumulado, e não apenas a última geração em memória.
 */
export async function updateResultInterpretation(sessionId, llmInterpretation) {
  const { data, error } = await supabase
    .from('results')
    .update({ llm_interpretation: llmInterpretation })
    .eq('session_id', sessionId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
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
