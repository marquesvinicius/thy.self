import { supabase } from '../../config/supabase.js';

export async function getAllActiveQuestions() {
  const { data, error } = await supabase
    .from('questions')
    .select(`
      id,
      text,
      context,
      category_id,
      question_categories ( slug, name )
    `)
    .eq('is_active', true);

  if (error) throw error;
  return data;
}

export async function getQuestionsWithAlternatives(questionIds) {
  const { data, error } = await supabase
    .from('questions')
    .select(`
      id,
      text,
      context,
      question_categories ( slug, name ),
      alternatives ( id, text, sort_order )
    `)
    .in('id', questionIds)
    .eq('is_active', true);

  if (error) throw error;
  return data;
}

export async function getAlternativeWithImpacts(alternativeId) {
  const { data, error } = await supabase
    .from('alternatives')
    .select('id, question_id, text, impact_o, impact_c, impact_e, impact_a, impact_n')
    .eq('id', alternativeId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}
