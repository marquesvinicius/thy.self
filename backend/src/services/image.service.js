import { logger } from '../utils/logger.js';

const WIKI_PT = 'https://pt.wikipedia.org/api/rest_v1/page/summary';
const WIKI_EN = 'https://en.wikipedia.org/api/rest_v1/page/summary';
const FETCH_TIMEOUT = 7000;
const LOOKUP_ATTEMPTS = 2;

// A política da Wikimedia exige User-Agent descritivo; sem ele as requisições
// são limitadas de forma agressiva — foi a causa medida de rejeições falsas
// (Atticus Finch, Charles Chaplin e Howard Hughes "não existiam" sob carga,
// mas respondem 200 em 150ms isoladamente).
const WIKI_USER_AGENT =
  'thy.self/1.0 (TFC Engenharia de Software UniRV; verificacao de referencias)';

/**
 * Resultado possível de uma consulta:
 *   'found'   → verbete existe (com ou sem imagem)
 *   'missing' → a Wikipedia respondeu 404 nas duas línguas: nome inexistente
 *   'unknown' → timeout / erro de rede: NÃO sabemos, e não podemos punir
 *
 * A distinção entre 'missing' e 'unknown' é o ponto central: antes, ambos
 * viravam `wiki_found: false` e a referência era descartada. Isso jogava
 * fora referências legítimas por instabilidade de rede.
 */
async function fetchSummary(url) {
  for (let attempt = 1; attempt <= LOOKUP_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': WIKI_USER_AGENT,
        },
      });

      if (res.ok) {
        const data = await res.json();
        return { status: 'found', image_url: data.thumbnail?.source || null };
      }
      // 404 é resposta legítima: o verbete realmente não existe.
      if (res.status === 404) return { status: 'missing', image_url: null };

      // 429/5xx: servidor recusou agora — tenta de novo antes de desistir.
    } catch {
      // Timeout ou erro de rede: idem.
    } finally {
      clearTimeout(timer);
    }
  }

  return { status: 'unknown', image_url: null };
}

/**
 * Looks up a Wikipedia page (PT then EN).
 * @param {string} query
 * @returns {Promise<{ image_url: string|null, wiki_found: boolean, wiki_status: string }>}
 */
async function lookupWikipedia(query) {
  const encoded = encodeURIComponent(`${query || ''}`.replace(/ /g, '_'));
  let missingCount = 0;

  for (const baseUrl of [WIKI_PT, WIKI_EN]) {
    const result = await fetchSummary(`${baseUrl}/${encoded}`);

    if (result.status === 'found') {
      return { image_url: result.image_url, wiki_found: true, wiki_status: 'found' };
    }
    if (result.status === 'missing') missingCount += 1;
  }

  // Só declaramos "não existe" quando AMBAS as línguas responderam 404.
  // Qualquer outra combinação é incerteza — a referência sobrevive.
  const wikiStatus = missingCount === 2 ? 'missing' : 'unknown';
  return { image_url: null, wiki_found: false, wiki_status: wikiStatus };
}

/**
 * Tenta múltiplos títulos candidatos (o sugerido pelo modelo e o nome cru).
 * Só devolve 'missing' quando TODOS os candidatos deram 404 nas duas línguas.
 */
async function lookupWikipediaCandidates(candidates) {
  const tried = new Set();
  let sawMissingOnly = true;

  for (const candidate of candidates) {
    const query = `${candidate || ''}`.trim();
    if (!query || tried.has(query.toLowerCase())) continue;
    tried.add(query.toLowerCase());

    const result = await lookupWikipedia(query);
    if (result.wiki_status === 'found') return result;
    if (result.wiki_status !== 'missing') sawMissingOnly = false;
  }

  return {
    image_url: null,
    wiki_found: false,
    wiki_status: sawMissingOnly && tried.size > 0 ? 'missing' : 'unknown',
  };
}

/**
 * Fetches a thumbnail image URL from Wikipedia for a given query.
 * Tries Portuguese Wikipedia first, falls back to English.
 *
 * @param {string} query - Wikipedia article title (e.g. "David Bowie")
 * @returns {Promise<string|null>} Image URL or null
 */
async function fetchImage(query) {
  const result = await lookupWikipedia(query);
  return result.image_url;
}

/**
 * Enriches an array of LLM references with Wikipedia thumbnail images
 * and a `wiki_found` flag (true when a page exists in PT or EN).
 *
 * @param {Array} referencias - Array of { categoria, nome, motivo, wiki_query }
 * @returns {Promise<Array>} Same array with `image_url` and `wiki_found`
 */
export async function fetchReferenceImages(referencias) {
  if (!referencias || !Array.isArray(referencias)) return referencias;

  const results = await Promise.allSettled(
    // Tenta o `wiki_query` sugerido pelo modelo e, se falhar, o próprio nome:
    // ele erra o TÍTULO com frequência (ex.: "Abelardo (Ursinho Pooh)" para
    // Eeyore), mesmo quando o personagem existe. Rejeitar por palpite de
    // título errado descartaria referência boa.
    referencias.map(ref => lookupWikipediaCandidates([ref.wiki_query, ref.nome]))
  );

  return referencias.map((ref, i) => {
    const settled = results[i];
    if (settled.status !== 'fulfilled') {
      logger.warn('Wikipedia lookup failed', { nome: ref.nome, error: settled.reason?.message });
      // Falha inesperada é incerteza, não prova de inexistência.
      return { ...ref, image_url: null, wiki_found: false, wiki_status: 'unknown' };
    }
    return {
      ...ref,
      image_url: settled.value.image_url,
      wiki_found: settled.value.wiki_found,
      wiki_status: settled.value.wiki_status,
    };
  });
}
