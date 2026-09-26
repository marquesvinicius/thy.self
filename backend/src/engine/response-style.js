import { readObjectiveLikert } from './likert.js';

/**
 * Assinatura de estilo de resposta — sinais determinísticos sobre COMO o
 * usuário respondeu a camada objetiva (BFI-2-S), independentes do QUE ele
 * respondeu. Alimentam a LLM com observações verificáveis:
 *
 *   - extremos:      taxa de respostas em ±2 ("respondeu com convicção")
 *   - neutros:       taxa de respostas em 0 ("evitou se comprometer")
 *   - aquiescência:  concordar tanto com itens diretos quanto invertidos —
 *                    quem concorda com "sou organizado" E com "sou desorganizado"
 *                    está concordando com o formato, não com o conteúdo
 *   - hesitação:     item cuja resposta demorou muito acima da mediana
 *                    (deltas de answered_at — só faz sentido no fluxo 1-a-1)
 *
 * Tudo calculado a partir das linhas que o /analyze já busca. Zero I/O.
 */

const ACQUIESCENCE_MIN_RATE = 0.7; // concordância alta nos dois sentidos
const HESITATION_OUTLIER_FACTOR = 3; // delta > 3× mediana = hesitação
const HESITATION_MIN_SAMPLES = 10;
const HESITATION_MAX_REASONABLE_MS = 5 * 60 * 1000; // pausas > 5min são interrupção, não hesitação

/**
 * Contagens sobre os valores Likert como respondidos. "Concordar" = valor
 * bruto positivo, ANTES do reverse_key: queremos saber se a pessoa concorda
 * com a afirmação como escrita, independente da direção psicométrica.
 */
function tally(likerts) {
  const counts = { extreme: 0, neutral: 0, direct: 0, agreeDirect: 0, reverse: 0, agreeReverse: 0 };
  for (const { value, reverse } of likerts) {
    if (Math.abs(value) === 2) counts.extreme += 1;
    if (value === 0) counts.neutral += 1;
    if (reverse) {
      counts.reverse += 1;
      if (value > 0) counts.agreeReverse += 1;
    } else {
      counts.direct += 1;
      if (value > 0) counts.agreeDirect += 1;
    }
  }
  return counts;
}

const rate = (part, total) => (total > 0 ? part / total : 0);

/** Aquiescente: concorda com quase tudo, inclusive itens que se contradizem. */
function isAcquiescent(counts) {
  return counts.direct >= 3 && counts.reverse >= 3
    && rate(counts.agreeDirect, counts.direct) >= ACQUIESCENCE_MIN_RATE
    && rate(counts.agreeReverse, counts.reverse) >= ACQUIESCENCE_MIN_RATE;
}

export function calculateResponseStyle(answers) {
  const likerts = (answers || []).map(readObjectiveLikert).filter(Boolean);
  const counts = tally(likerts);
  const answered = likerts.length;

  return {
    answer_count: answered,
    extreme_count: counts.extreme,
    extreme_rate: round2(rate(counts.extreme, answered)),
    neutral_count: counts.neutral,
    neutral_rate: round2(rate(counts.neutral, answered)),
    agree_direct_rate: round2(rate(counts.agreeDirect, counts.direct)),
    agree_reverse_rate: round2(rate(counts.agreeReverse, counts.reverse)),
    acquiescence: isAcquiescent(counts),
    hesitation: calculateHesitation(answers),
  };
}

/**
 * Item em que o usuário demorou visivelmente mais que o próprio ritmo.
 * Retorna null quando não há amostra confiável (poucas respostas, deltas
 * corrompidos ou pausa longa demais para ser hesitação genuína).
 */
function calculateHesitation(answers) {
  const timed = (answers || [])
    .filter(a => a?.answered_at)
    .map(a => ({
      question_text: a.questions?.text || '',
      at: new Date(a.answered_at).getTime(),
    }))
    .filter(a => Number.isFinite(a.at))
    .sort((a, b) => a.at - b.at);

  const deltas = [];
  for (let i = 1; i < timed.length; i += 1) {
    const ms = timed[i].at - timed[i - 1].at;
    if (ms > 0 && ms <= HESITATION_MAX_REASONABLE_MS) {
      deltas.push({ ms, question_text: timed[i].question_text });
    }
  }
  if (deltas.length < HESITATION_MIN_SAMPLES) return null;

  const sorted = [...deltas].sort((a, b) => a.ms - b.ms);
  // Só entram deltas > 0, então a mediana é sempre positiva.
  const median = sorted[Math.floor(sorted.length / 2)].ms;

  const slowest = sorted[sorted.length - 1];
  if (slowest.ms < median * HESITATION_OUTLIER_FACTOR) return null;

  return {
    question_text: slowest.question_text,
    seconds: round2(slowest.ms / 1000),
    median_seconds: round2(median / 1000),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
