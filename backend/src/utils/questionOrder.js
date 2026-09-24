import { QUESTION_KIND } from '../config/constants.js';
import { shuffle } from './shuffle.js';

const EMOTIONAL_ROTATION = ['moral_dilemma', 'interest', 'paradoxical'];

const categoryOf = question => question.question_categories?.slug || 'other';

function groupByCategory(questions) {
  const pools = {};
  for (const question of questions) {
    (pools[categoryOf(question)] ||= []).push(question);
  }
  return pools;
}

function removeFrom(pool, question) {
  pool.splice(pool.indexOf(question), 1);
  return question;
}

/**
 * Sorteia a sequência narrativa seguindo a rotação emocional
 * (pesado → leve → médio). Quando a categoria da vez se esgota, o slot é
 * preenchido por qualquer interpretativa restante, sorteada.
 */
function arrangeNarrative(interpretative) {
  const pools = groupByCategory(interpretative);
  const narrative = [];
  for (let slot = 0; slot < interpretative.length; slot += 1) {
    const preferred = pools[EMOTIONAL_ROTATION[slot % EMOTIONAL_ROTATION.length]];
    if (preferred?.length) {
      narrative.push(removeFrom(preferred, shuffle(preferred)[0]));
      continue;
    }
    // Cada slot consome exatamente uma pergunta, logo ainda resta alguma.
    const fallback = shuffle(Object.values(pools).flat())[0];
    narrative.push(removeFrom(pools[categoryOf(fallback)], fallback));
  }
  return narrative;
}

/**
 * Garante uma reflexão na primeira metade do ato interpretativo: se a
 * primeira reflexão cair depois da metade, ela troca de lugar com o
 * primeiro item da narrativa (que, por ser anterior à primeira reflexão,
 * nunca é reflexão).
 */
function pullReflectionForward(narrative) {
  const reflectionIndex = narrative.findIndex(q => q.type === 'reflection');
  if (reflectionIndex > Math.floor(narrative.length / 2)) {
    [narrative[0], narrative[reflectionIndex]] = [narrative[reflectionIndex], narrative[0]];
  }
  return narrative;
}

/**
 * Materializa a ordem de uma sessão uma única vez. A ordem é a fonte da
 * verdade; respostas (inclusive skips) apenas marcam itens como consumidos.
 * As 30 objetivas (embaralhadas) vêm sempre antes do ato narrativo.
 */
export function buildQuestionOrder(allQuestions) {
  const objective = shuffle(allQuestions.filter(q => q.kind === QUESTION_KIND.OBJECTIVE));
  const narrative = pullReflectionForward(
    arrangeNarrative(allQuestions.filter(q => q.kind === QUESTION_KIND.INTERPRETATIVE)),
  );
  return [...objective, ...narrative].map(question => question.id);
}
