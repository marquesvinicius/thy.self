import { supabase } from '../../config/supabase.js';

export async function createSession(nickname, questionOrder = null) {
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      nickname: nickname || null,
      question_order: questionOrder,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getSessionById(id) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function updateSessionQuestionOrder(id, questionOrder) {
  const { data, error } = await supabase
    .from('sessions')
    .update({ question_order: questionOrder })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSessionStatus(id, status) {
  const update = { status };
  if (status === 'completed') {
    update.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('sessions')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
