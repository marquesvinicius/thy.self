// Minimum objective (BFI-2-S) answers required before the Big Five profile
// can be computed. The BFI-2-S short form defines 30 items (6 per trait),
// so all 30 must be answered for the calculation to be defensible.
//
// Deliberadamente NÃO configurável por variável de ambiente: a RN002 deriva
// esse número do instrumento, não de operação. Um override capaz de baixá-lo
// para 5 quebraria a validade psicométrica sem deixar rastro.
export const MIN_OBJECTIVE_ANSWERS_FOR_ANALYSIS = 30;

export const SCORE_SCALE_MAX = 100;

// Dual-Core (BFI-2-S): each answered item contributes a Likert value in
// [LIKERT_MIN, LIKERT_MAX] to the item's trait, with sign flipped when the
// item is reverse-keyed. Replaces the legacy per-alternative IMPACT_RANGE.
export const LIKERT_MIN = -2;
export const LIKERT_MAX = 2;

// Number of objective items per trait in the BFI-2-S short form (6 each).
export const ITEMS_PER_TRAIT = 6;

// DERS RN013: uma sessão é 'active' ou 'completed' — não há estado de
// abandono; sessões não concluídas simplesmente permanecem ativas.
export const SESSION_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
};

export const DIMENSION_KEYS = ['O', 'C', 'E', 'A', 'N'];

export const QUESTION_KIND = {
  OBJECTIVE: 'objective',
  INTERPRETATIVE: 'interpretative',
};
