import { supabase } from '../../config/supabase.js';

export async function createAnswer(sessionId, questionId, alternativeId, answerType = 'alternative_id', userObservation = null) {
  const { data, error } = await supabase
    .from('answers')
    .insert({
      session_id: sessionId,
      question_id: questionId,
      alternative_id: alternativeId,
      answer_type: answerType,
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

/**
 * Retorna todas as respostas de uma sessão já anotadas com contexto de
 * revisão: texto da pergunta, texto da alternativa escolhida, traço
 * influenciado (para itens BFI-2-S), contribuição Likert assinada (com
 * reverse_key aplicado) e observação do usuário.
 *
 * Usado pela tela "revisar respostas" introduzida após o teste de
 * usabilidade de abril/2026.
 */
export async function getAnswerReviewBySessionId(sessionId) {
  const rows = await getAnswersBySessionId(sessionId);
  return (rows || []).map(row => {
    const question = row.questions || {};
    const alt = row.alternatives || {};
    const trait = question.trait || null;
    let likertValue = null;
    let contribution = null;

    if (question.kind === 'objective' && trait) {
      const col = `impact_${trait.toLowerCase()}`;
      const raw = Number(alt?.[col] ?? 0);
      likertValue = Number.isFinite(raw) ? raw : 0;
      const signed = question.reverse_key ? -likertValue : likertValue;
      contribution = { trait, delta: signed };
    }

    return {
      id: row.id,
      question_id: row.question_id,
      question_text: question.text || '',
      kind: question.kind || 'interpretative',
      type: question.type || null,
      trait,
      reverse_key: !!question.reverse_key,
      category_slug: question.question_categories?.slug || null,
      answered_at: row.answered_at,
      answer_text: alt?.text ?? null,
      user_observation: row.user_observation ?? null,
      answer_type: row.answer_type,
      likert_value: likertValue,
      contribution,
    };
  });
}

export async function getAnsweredQuestionIds(sessionId) {
  const { data, error } = await supabase
    .from('answers')
    .select('question_id')
    .eq('session_id', sessionId);

  if (error) throw error;
  return data.map(a => a.question_id);
}

/**
 * Remove a resposta mais recente da sessão e devolve o id da pergunta que
 * voltou a ficar pendente. Usado pelo botão "voltar" no quiz — o usuário
 * pode corrigir uma resposta dada por engano.
 *
 * Retorna `null` quando não há respostas para desfazer.
 */
export async function deleteLastAnswer(sessionId) {
  const { data, error } = await supabase
    .from('answers')
    .select('id, question_id, answered_at')
    .eq('session_id', sessionId)
    .order('answered_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) return null;

  const last = data[0];
  const { error: deleteError } = await supabase
    .from('answers')
    .delete()
    .eq('id', last.id);

  if (deleteError) throw deleteError;
  return { question_id: last.question_id, answered_at: last.answered_at };
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

