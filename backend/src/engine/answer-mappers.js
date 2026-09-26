import { readObjectiveLikert } from './likert.js';

/**
 * Mapeamentos puros das linhas de `answers` (com joins) para os formatos
 * consumidos pela API e pela IA. Viviam dentro das queries do Supabase,
 * misturados a I/O e sem teste; a revisão ainda recalculava a contribuição
 * Likert com uma cópia própria da regra do motor.
 */

/**
 * Linha da tela "revisar respostas": o que foi respondido e, para itens
 * BFI-2-S, exatamente a contribuição que o motor usou no escore (mesma
 * leitura de readObjectiveLikert — se o motor descarta, a revisão também).
 */
export function toAnswerReview(row) {
  const question = row.questions || {};
  const likert = readObjectiveLikert(row);

  return {
    id: row.id,
    question_id: row.question_id,
    question_text: question.text || '',
    kind: question.kind || 'interpretative',
    type: question.type || null,
    trait: question.trait || null,
    reverse_key: !!question.reverse_key,
    category_slug: question.question_categories?.slug || null,
    answered_at: row.answered_at,
    answer_text: row.alternatives?.text ?? null,
    user_observation: row.user_observation ?? null,
    answer_type: row.answer_type,
    likert_value: likert ? likert.value : null,
    contribution: likert ? { trait: likert.trait, delta: likert.signed } : null,
  };
}

/**
 * Sinal qualitativo de uma resposta interpretativa, para o prompt da IA.
 * Reflexão = pergunta do tipo reflexão OU texto livre sem alternativa.
 */
export function toInterpretativeSignal(row) {
  const question = row.questions || {};
  const questionType = question.type || null;
  const alternativeText = row.alternatives?.text ?? null;
  const userObservation = row.user_observation ?? null;

  return {
    category_slug: question.question_categories?.slug || 'unknown',
    question_text: question.text || '',
    question_context: question.context ?? null,
    question_type: questionType,
    is_reflection: questionType === 'reflection' || (!alternativeText && !!userObservation),
    alternative_text: alternativeText,
    user_observation: userObservation,
  };
}

/** Sinais das respostas interpretativas, descartando pulos sem conteúdo. */
export function toInterpretativeSignals(rows) {
  return (rows || [])
    .map(toInterpretativeSignal)
    .filter(signal => signal.alternative_text || signal.user_observation);
}
