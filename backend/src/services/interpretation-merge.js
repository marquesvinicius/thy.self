/**
 * Regras puras da regeneração de referências (POST /interpret).
 *
 * Nasceram da avaliação com usuários: "gerar mais referências" deve
 * ACUMULAR referências e obras (o PDF exporta todas as já vistas) e nunca
 * reescrever o texto interpretativo que o usuário já leu. Ficavam dentro do
 * controller, misturadas a I/O e sem teste; aqui são funções de dados.
 */

const REFERENCES_PER_GENERATION = 3;

/** Chave de comparação: sem acento, sem caixa, sem espaços nas pontas. */
export function normalizeToken(value) {
  return `${value || ''}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Mantém só strings não vazias (aparadas). Qualquer não-array vira []. */
export function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean);
}

/**
 * Concatena listas deduplicando por `keyFn` normalizado, preservando a
 * primeira ocorrência (ordem cronológica: antigos primeiro).
 */
export function mergeUnique(lists, keyFn = item => item) {
  const merged = [];
  const seen = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const key = normalizeToken(keyFn(item));
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

const objects = list => (Array.isArray(list) ? list.filter(item => item && typeof item === 'object') : []);
const pluck = (list, field) => objects(list).map(item => item[field]);

export function mergeReferenceList(previous, incoming) {
  return mergeUnique([objects(previous), objects(incoming)], ref => ref.nome);
}

export function mergeWorkList(previous, incoming) {
  return mergeUnique([objects(previous), objects(incoming)], work => work.titulo);
}

/**
 * Tudo o que a nova geração NÃO pode repetir: o que o cliente já exibiu
 * (corpo da requisição) somado ao que está persistido.
 */
export function buildRegenExclusions(persisted = {}, request = {}) {
  return {
    excludedReferenceNames: mergeUnique([
      normalizeStringList(request.exclude_reference_names),
      normalizeStringList(pluck(persisted.referencias, 'nome')),
    ]),
    excludedWorkTitles: mergeUnique([
      normalizeStringList(request.exclude_work_titles),
      normalizeStringList(pluck(persisted.obras_culturais, 'titulo')),
    ]),
    excludedCategories: mergeUnique([
      normalizeStringList(pluck(persisted.referencias, 'categoria')),
    ]),
  };
}

/**
 * Quantas regenerações já aconteceram, para escolher a lente seguinte.
 * O contador do limitador pode zerar num restart; as referências
 * persistidas não. Cada geração produz ~3 referências, então
 * ceil(n/3) − 1 estima as regenerações — vale o maior dos dois, para a
 * lente nunca regredir.
 */
export function estimateRegensSoFar(counterUsed, persistedReferenceCount) {
  const fromPersisted = Math.ceil(persistedReferenceCount / REFERENCES_PER_GENERATION) - 1;
  return Math.max(counterUsed, fromPersisted, 0);
}

/**
 * Junta a interpretação persistida com a recém-gerada: referências e obras
 * acumulam; texto interpretativo, vibe e versão do prompt ficam com o
 * original sempre que ele existir.
 */
export function mergeInterpretation(persisted = {}, generated = {}) {
  return {
    ...persisted,
    ...generated,
    interpretacao: persisted.interpretacao || generated.interpretacao,
    vibe_resumo: persisted.vibe_resumo || generated.vibe_resumo,
    prompt_version: persisted.prompt_version || generated.prompt_version,
    referencias: mergeReferenceList(persisted.referencias, generated.referencias),
    obras_culturais: mergeWorkList(persisted.obras_culturais, generated.obras_culturais),
  };
}
