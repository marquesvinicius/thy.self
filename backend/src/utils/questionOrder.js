import { QUESTION_KIND } from '../config/constants.js';
import { shuffle } from './shuffle.js';

const EMOTIONAL_ROTATION = ['moral_dilemma', 'interest', 'paradoxical'];

/**
 * Materializa a ordem de uma sessão uma única vez. A ordem é a fonte da
 * verdade; respostas (inclusive skips) apenas marcam itens como consumidos.
 */
export function buildQuestionOrder(allQuestions) {
  const objective = shuffle(
    allQuestions.filter(q => q.kind === QUESTION_KIND.OBJECTIVE),
  );
  const interpretative = allQuestions.filter(
    q => q.kind === QUESTION_KIND.INTERPRETATIVE,
  );
  const byCategory = {};
  for (const question of interpretative) {
    const category = question.question_categories?.slug || 'other';
    (byCategory[category] ||= []).push(question);
  }

  const narrative = [];
  while (narrative.length < interpretative.length) {
    const category = EMOTIONAL_ROTATION[narrative.length % EMOTIONAL_ROTATION.length];
    const pool = byCategory[category] || [];
    if (pool.length > 0) {
      const pick = shuffle(pool)[0];
      narrative.push(pick);
      pool.splice(pool.indexOf(pick), 1);
      continue;
    }
    const remaining = Object.values(byCategory).flat().filter(Boolean);
    if (!remaining.length) break;
    const fallback = shuffle(remaining)[0];
    narrative.push(fallback);
    const fallbackCategory = fallback.question_categories?.slug || 'other';
    byCategory[fallbackCategory].splice(
      byCategory[fallbackCategory].indexOf(fallback),
      1,
    );
  }

  // Garante que exista uma reflexão antes do fim do ato interpretativo,
  // preservando a intenção do picker anterior sem depender do GET.
  const reflectionIndex = narrative.findIndex(q => q.type === 'reflection');
  if (reflectionIndex > Math.floor(narrative.length / 2)) {
    const earlyIndex = narrative.findIndex(q => q.type !== 'reflection');
    if (earlyIndex >= 0) {
      [narrative[earlyIndex], narrative[reflectionIndex]] =
        [narrative[reflectionIndex], narrative[earlyIndex]];
    }
  }

  return [...objective, ...narrative].map(question => question.id);
}

