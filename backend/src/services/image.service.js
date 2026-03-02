import { logger } from '../utils/logger.js';

const WIKI_PT = 'https://pt.wikipedia.org/api/rest_v1/page/summary';
const WIKI_EN = 'https://en.wikipedia.org/api/rest_v1/page/summary';
const FETCH_TIMEOUT = 3000; // 3s per image lookup

/**
 * Fetches a thumbnail image URL from Wikipedia for a given query.
 * Tries Portuguese Wikipedia first, falls back to English.
 *
 * @param {string} query - Wikipedia article title (e.g. "David Bowie")
 * @returns {Promise<string|null>} Image URL or null
 */
async function fetchImage(query) {
  const encoded = encodeURIComponent(query.replace(/ /g, '_'));

  for (const baseUrl of [WIKI_PT, WIKI_EN]) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      const res = await fetch(`${baseUrl}/${encoded}`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });

      clearTimeout(timer);

      if (!res.ok) continue;

      const data = await res.json();

      if (data.thumbnail?.source) {
        return data.thumbnail.source;
      }
    } catch {
      // Timeout or network error — try next source
      continue;
    }
  }

  return null;
}

/**
 * Enriches an array of LLM references with Wikipedia thumbnail images.
 * Runs all lookups in parallel for speed.
 *
 * @param {Array} referencias - Array of { categoria, nome, motivo, wiki_query }
 * @returns {Promise<Array>} Same array with `image_url` added to each item
 */
export async function fetchReferenceImages(referencias) {
  if (!referencias || !Array.isArray(referencias)) return referencias;

  const results = await Promise.allSettled(
    referencias.map(ref => fetchImage(ref.wiki_query || ref.nome))
  );

  return referencias.map((ref, i) => ({
    ...ref,
    image_url: results[i].status === 'fulfilled' ? results[i].value : null,
  }));
}
