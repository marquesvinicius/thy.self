/**
 * Métricas verificáveis da saída do LLM.
 *
 * Todas as funções são PURAS (texto/objeto → número/booleano), para que o
 * harness de avaliação possa ser testado como qualquer outro módulo — uma
 * métrica com bug produz conclusão errada, que é pior que não medir.
 *
 * O que NÃO está aqui: julgamento de qualidade literária. Estas métricas
 * medem aderência a contratos objetivos do prompt (2ª pessoa, citação,
 * ancoragem numérica, repetição de léxico), não se o texto "ficou bom".
 */

const PT_STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
  'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com', 'sem', 'sob', 'sobre',
  'e', 'ou', 'mas', 'que', 'se', 'ao', 'aos', 'the', 'como', 'mais', 'menos',
  'seu', 'sua', 'seus', 'suas', 'voce', 'você', 'ele', 'ela', 'eles', 'elas',
  'isso', 'esse', 'essa', 'este', 'esta', 'aquilo', 'entre', 'quando', 'onde',
  'ser', 'estar', 'ter', 'foi', 'era', 'sao', 'são', 'tem', 'nao', 'não',
  'muito', 'pouco', 'tambem', 'também', 'ainda', 'sempre', 'nunca', 'cada',
  'pela', 'pelo', 'pelas', 'pelos', 'numa', 'num', 'dele', 'dela',
]);

const VIBE_BANNED_WORDS = [
  'energia', 'essência', 'jornada', 'equilíbrio', 'autoconsciência',
  'dualidade', 'busca',
];

// Exemplos presentes no system prompt — se aparecerem na saída, o modelo
// está copiando o few-shot em vez de derivar do perfil.
const VIBE_EXAMPLE_FRAGMENTS = [
  'decide rapido, mas revisa',
  'foge do meio-termo',
  'escolhe lados',
];

// Nomes que o prompt marca como "default de LLM". Aqui apenas CONTAMOS —
// não há banimento no parser (decisão de produto).
const CLICHE_NAMES = [
  'immanuel kant', 'marie curie', 'albert einstein', 'friedrich nietzsche',
  'leonardo da vinci', 'sigmund freud', 'carl sagan', 'stephen hawking',
  'william shakespeare', 'frida kahlo', 'vincent van gogh', 'steve jobs',
  'elon musk', 'keanu reeves', 'hermione granger', 'sherlock holmes',
];

// Assinatura dos motivos gerados por fallback determinístico (llm.service.js).
const FALLBACK_MOTIVO_PREFIX = 'aproximação direta por';

export function normalize(text) {
  return `${text || ''}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Palavras de conteúdo (sem stopwords, comprimento > 3). */
export function contentWords(text) {
  return normalize(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !PT_STOPWORDS.has(w));
}

export function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Sobreposição léxica média entre os "motivos" das referências.
 * É a métrica-alvo do experimento de exemplos concretos: quanto MENOR,
 * mais distinto é o vocabulário usado para justificar cada referência.
 */
export function motivoOverlap(referencias = []) {
  const sets = referencias
    .map(ref => new Set(contentWords(ref?.motivo)))
    .filter(set => set.size > 0);

  if (sets.length < 2) return { mean: 0, max: 0, pairs: 0 };

  const scores = [];
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      scores.push(jaccard(sets[i], sets[j]));
    }
  }

  return {
    mean: round3(scores.reduce((a, b) => a + b, 0) / scores.length),
    max: round3(Math.max(...scores)),
    pairs: scores.length,
  };
}

/** 2ª pessoa presente e marcadores de laudo/3ª pessoa ausentes. */
export function secondPerson(text) {
  const t = normalize(text);
  const hasYou = /\bvoce\b|\bseu\b|\bsua\b|\bseus\b|\bsuas\b/.test(t);
  const thirdPersonMarkers = [
    'o usuario', 'a usuaria', 'o perfil exibe', 'o perfil apresenta',
    'a pessoa analisada', 'o individuo', 'o respondente',
  ].filter(marker => t.includes(marker));

  return { ok: hasYou && thirdPersonMarkers.length === 0, hasYou, thirdPersonMarkers };
}

/** Ancoragem numérica: pelo menos um escore citado como evidência. */
export function hasScoreEvidence(text) {
  return /\d+([.,]\d+)?\s*%/.test(`${text || ''}`);
}

/** Citação literal entre aspas (o prompt exige ao menos uma). */
export function hasQuote(text) {
  return /["“'][^"”']{8,}["”']/.test(`${text || ''}`);
}

/**
 * Construção proibida pelo prompt ("não é X, é Y") — o padrão de aforismo
 * que causou a regressão de tom na v2.0.x.
 */
export function bannedConstruction(text) {
  return /\bnao e\b[^.;!?]{2,60}[;,]\s*\be\b\s/.test(normalize(text));
}

/**
 * Heurística de fechamento: a última frase termina em evidência (número,
 * citação ou nome próprio) em vez de generalização. É indicativo, não prova.
 */
export function endsOnEvidence(text) {
  const sentences = `${text || ''}`.split(/(?<=[.!?])\s+/).filter(Boolean);
  const last = sentences[sentences.length - 1] || '';
  return /\d/.test(last) || /["“']/.test(last) || /\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+/.test(last.slice(1));
}

export function vibeAudit(vibe) {
  const raw = `${vibe || ''}`.trim();
  const words = raw.split(/\s+/).filter(Boolean);
  const normalized = normalize(raw);

  return {
    text: raw,
    wordCount: words.length,
    withinLimit: words.length <= 10,
    bannedWords: VIBE_BANNED_WORDS.filter(w => normalized.includes(normalize(w))),
    copiesExample: VIBE_EXAMPLE_FRAGMENTS.some(f => normalized.includes(normalize(f))),
  };
}

export function distinctCategories(referencias = []) {
  const cats = referencias.map(ref => normalize(ref?.categoria)).filter(Boolean);
  return new Set(cats).size === cats.length && cats.length > 0;
}

export function clicheCount(referencias = []) {
  return referencias.filter(ref => {
    const name = normalize(ref?.nome);
    return CLICHE_NAMES.some(cliche => name.includes(normalize(cliche)));
  }).length;
}

/** Referências substituídas pelo fallback determinístico (LLM falhou/alucinou). */
export function fallbackCount(referencias = []) {
  return referencias.filter(ref =>
    normalize(ref?.motivo).startsWith(normalize(FALLBACK_MOTIVO_PREFIX))
  ).length;
}

export function worksShape(obras = []) {
  const types = obras.map(w => normalize(w?.tipo));
  return {
    ok: types.length === 3
      && types.includes('serie')
      && types.includes('filme')
      && types.includes('anime'),
    types,
  };
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

const TRAIT_WORDS = [
  'abertura', 'conscienciosidade', 'extroversao', 'amabilidade', 'neuroticismo',
];

/**
 * A "ancora" de cada referência deve apontar para algo REAL: um trecho de
 * resposta que o usuário deu, ou um eixo do perfil com escore. Esta métrica
 * é o antídoto ao teatro de raciocínio — sem ela, o modelo poderia inventar
 * uma âncora plausível e nós não saberíamos.
 *
 * Considera válida quando a âncora compartilha vocabulário com alguma
 * resposta do usuário (Jaccard ≥ 0.15) ou cita um traço com percentual.
 */
export function ancoraIsGrounded(ancora, signals = []) {
  const words = new Set(contentWords(ancora));
  if (words.size === 0) return false;

  const normalized = normalize(ancora);
  const citesTrait = TRAIT_WORDS.some(t => normalized.includes(t)) && /\d/.test(normalized);
  if (citesTrait) return true;

  return signals.some(signal => {
    const haystack = [
      signal?.alternative_text,
      signal?.user_observation,
      signal?.question_text,
    ].filter(Boolean).join(' ');
    return jaccard(words, new Set(contentWords(haystack))) >= 0.15;
  });
}

/** Fração das referências cuja âncora aponta para dado real do usuário. */
export function groundedAncoraRate(referencias = [], signals = []) {
  const withAncora = referencias.filter(ref => `${ref?.ancora || ''}`.trim());
  if (withAncora.length === 0) return null;
  const grounded = withAncora.filter(ref => ancoraIsGrounded(ref.ancora, signals));
  return round3(grounded.length / withAncora.length);
}

/** Avalia uma interpretação completa contra todos os contratos. */
export function evaluateInterpretation(interpretation, { citesReflection = null, signals = [] } = {}) {
  const interpretacao = interpretation?.interpretacao || '';
  const referencias = interpretation?.referencias || [];
  const obras = interpretation?.obras_culturais || [];

  const person = secondPerson(interpretacao);
  const vibe = vibeAudit(interpretation?.vibe_resumo);
  const overlap = motivoOverlap(referencias);

  return {
    vibe_text: vibe.text,
    vibe_words: vibe.wordCount,
    vibe_within_limit: vibe.withinLimit,
    vibe_banned: vibe.bannedWords,
    vibe_copies_example: vibe.copiesExample,
    second_person: person.ok,
    third_person_markers: person.thirdPersonMarkers,
    score_evidence: hasScoreEvidence(interpretacao),
    has_quote: hasQuote(interpretacao),
    cites_reflection: citesReflection,
    banned_construction: bannedConstruction(interpretacao),
    ends_on_evidence: endsOnEvidence(interpretacao),
    motivo_overlap_mean: overlap.mean,
    motivo_overlap_max: overlap.max,
    reference_count: referencias.length,
    grounded_ancora_rate: groundedAncoraRate(referencias, signals),
    distinct_categories: distinctCategories(referencias),
    cliche_refs: clicheCount(referencias),
    fallback_refs: fallbackCount(referencias),
    works_ok: worksShape(obras).ok,
    reference_names: referencias.map(r => r?.nome).filter(Boolean),
    interpretacao,
  };
}
