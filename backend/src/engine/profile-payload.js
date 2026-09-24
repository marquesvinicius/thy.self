import { DIMENSIONS } from './dimensions.js';
import { classifyScore } from './normalization.js';

/**
 * Converte uma linha persistida de `results` no formato de perfil que a API
 * devolve. Fonte única para /analyze, /result e /interpret — antes eram três
 * cópias, e a do /interpret classificava os níveis numa escala própria
 * ("moderado-alto"), de modo que o mesmo escore chegava à IA com rótulos
 * diferentes na primeira geração e na regeneração.
 */
export function scoresFromRow(row) {
  return {
    O: Number(row.score_o),
    C: Number(row.score_c),
    E: Number(row.score_e),
    A: Number(row.score_a),
    N: Number(row.score_n),
  };
}

export function buildDimensions(scores) {
  return DIMENSIONS.map(dim => ({
    key: dim.key,
    name: dim.name,
    description: dim.description,
    lowLabel: dim.lowLabel,
    highLabel: dim.highLabel,
    score: scores[dim.key],
    level: classifyScore(scores[dim.key]),
  }));
}

export function profilePayloadFromRow(row) {
  const scores = scoresFromRow(row);
  return {
    scores,
    dimensions: buildDimensions(scores),
    answer_count: row.answer_count,
    calculated_at: row.calculated_at,
    consistency: row.consistency || null,
    llm_interpretation: row.llm_interpretation || null,
    archetype: row.archetype || null,
    anti_archetype: row.anti_archetype || null,
  };
}
