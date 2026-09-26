import { DIMENSION_KEYS, QUESTION_KIND } from '../config/constants.js';

/**
 * Leitura canônica de uma resposta da camada objetiva (BFI-2-S).
 *
 * Ponto único que decide se uma resposta entra no cálculo e com que valor —
 * antes, a mesma extração estava copiada no motor, na consistência e no
 * estilo de resposta, com pequenas divergências entre as cópias.
 *
 * Retorna `null` quando a resposta não deve ser pontuada:
 *   - item interpretativo (Dual-Core: nunca pontua);
 *   - traço ausente ou fora de O/C/E/A/N;
 *   - valor Likert não numérico.
 *
 * Coluna de impacto ausente conta como 0 (neutro), mesma regra do seed, que
 * grava zero nas colunas dos traços que o item não mede.
 *
 * @returns {{ trait: 'O'|'C'|'E'|'A'|'N', value: number, signed: number, reverse: boolean } | null}
 *   `value` é o Likert como respondido (−2…+2); `signed` já aplica o reverse_key.
 */
export function readObjectiveLikert(answer) {
  const question = answer?.questions;
  if (question?.kind !== QUESTION_KIND.OBJECTIVE) return null;

  const trait = question.trait;
  if (!DIMENSION_KEYS.includes(trait)) return null;

  const value = Number(answer.alternatives?.[`impact_${trait.toLowerCase()}`] ?? 0);
  if (!Number.isFinite(value)) return null;

  const reverse = Boolean(question.reverse_key);
  // `0 - value` em vez de `-value`: evita −0 em item reverso neutro.
  return { trait, value, signed: reverse ? 0 - value : value, reverse };
}
