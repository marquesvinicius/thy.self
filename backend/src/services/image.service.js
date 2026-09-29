import { logger } from '../utils/logger.js';

// API de ação da Wikipédia: aceita vários títulos numa única requisição, segue
// redirecionamentos e devolve miniatura + item do Wikidata de cada página.
const WIKI_API = lang => `https://${lang}.wikipedia.org/w/api.php`;
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const COMMONS_FILE = 'https://commons.wikimedia.org/wiki/Special:FilePath/';
const LANGS = ['pt', 'en'];
const THUMB_WIDTH = 400;
const FETCH_TIMEOUT = 7000;
const MAX_RETRY_WAIT_MS = 1500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// A política da Wikimedia exige User-Agent descritivo; sem ele as requisições
// são limitadas de forma agressiva.
const WIKI_USER_AGENT =
  'thy.self/1.0 (TFC Engenharia de Software UniRV; verificacao de referencias)';

/*
 * Por que em lote: a versão anterior fazia uma requisição por referência,
 * por título candidato e por língua (até 24 por resultado). Sob esse volume a
 * Wikipédia responde 429 ("espere 20 s") e a imagem ficava vazia — era a causa
 * medida dos cartões sem foto. Agora são 2 requisições (PT e EN) para todas as
 * referências, mais 1 ao Wikidata só quando falta imagem.
 *
 * Resultado de cada referência:
 *   'found'   → a página existe (com ou sem imagem)
 *   'missing' → PT e EN responderam que nenhum título candidato existe
 *   'unknown' → alguma consulta falhou: não sabemos, e não podemos punir
 */

const cache = new Map(); // título normalizado → { status, image_url, at }

const cacheKey = title => title.trim().replace(/_/g, ' ').toLowerCase();

function readCache(title) {
  const hit = cache.get(cacheKey(title));
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(cacheKey(title));
    return null;
  }
  return hit;
}

function writeCache(title, entry) {
  // Só guarda resposta definitiva; incerteza de rede sempre é consultada de novo.
  if (entry.status === 'unknown') return;
  cache.set(cacheKey(title), { ...entry, at: Date.now() });
}

/** Limpa o cache (usado pelos testes). */
export function clearImageCache() {
  cache.clear();
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * GET com JSON. 429/5xx e erro de rede ganham UMA nova tentativa, esperando o
 * `Retry-After` pedido (limitado a 1,5 s para não segurar o resultado).
 * Devolve null quando não deu para obter resposta.
 */
async function getJson(url) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    let retryAfterMs = 400;
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': WIKI_USER_AGENT },
      });
      if (res.ok) return await res.json();
      const header = Number(res.headers?.get?.('retry-after'));
      if (Number.isFinite(header) && header > 0) retryAfterMs = header * 1000;
    } catch {
      // timeout ou rede: tenta de novo
    } finally {
      clearTimeout(timer);
    }
    if (attempt < 2) await wait(Math.min(retryAfterMs, MAX_RETRY_WAIT_MS));
  }
  return null;
}

/**
 * Consulta vários títulos numa língua. Devolve Map título pedido →
 * { status: 'found'|'missing', image_url, wikidata } ou null se a consulta falhou.
 */
async function queryTitles(lang, titles) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    prop: 'pageimages|pageprops',
    piprop: 'thumbnail',
    pithumbsize: String(THUMB_WIDTH),
    ppprop: 'wikibase_item',
    titles: titles.join('|'),
  });
  const data = await getJson(`${WIKI_API(lang)}?${params}`);
  const query = data?.query;
  if (!query || !Array.isArray(query.pages)) return null;

  // Título pedido → título final (normalização de caixa/espaço e redirecionamento).
  const hop = new Map();
  for (const { from, to } of [...(query.normalized || []), ...(query.redirects || [])]) {
    hop.set(from, to);
  }
  const resolve = title => {
    let current = title;
    for (let i = 0; i < 5 && hop.has(current); i += 1) current = hop.get(current);
    return current;
  };
  const pages = new Map(query.pages.map(p => [p.title, p]));

  const out = new Map();
  for (const title of titles) {
    const page = pages.get(resolve(title));
    if (!page || page.missing || page.invalid) {
      out.set(title, { status: 'missing', image_url: null, wikidata: null });
    } else {
      out.set(title, {
        status: 'found',
        image_url: page.thumbnail?.source || null,
        wikidata: page.pageprops?.wikibase_item || null,
      });
    }
  }
  return out;
}

/** Imagem principal (P18) de itens do Wikidata: Map Q-id → URL da imagem. */
async function wikidataImages(ids) {
  if (ids.length === 0) return new Map();
  const params = new URLSearchParams({
    action: 'wbgetentities',
    format: 'json',
    props: 'claims',
    ids: ids.join('|'),
  });
  const data = await getJson(`${WIKIDATA_API}?${params}`);
  const out = new Map();
  for (const id of ids) {
    const file = data?.entities?.[id]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (typeof file === 'string' && file) {
      out.set(id, `${COMMONS_FILE}${encodeURIComponent(file.replace(/ /g, '_'))}?width=${THUMB_WIDTH}`);
    }
  }
  return out;
}

function candidatesOf(ref) {
  const seen = new Set();
  const list = [];
  // O título sugerido pelo modelo erra com frequência (ex.: "Abelardo (Ursinho
  // Pooh)" para Eeyore); por isso o nome cru também é candidato.
  for (const raw of [ref?.wiki_query, ref?.nome]) {
    const title = `${raw || ''}`.replace(/_/g, ' ').trim();
    if (title && !seen.has(title.toLowerCase())) {
      seen.add(title.toLowerCase());
      list.push(title);
    }
  }
  return list;
}

/**
 * Verifica cada referência na Wikipédia (PT, depois EN) e busca a imagem.
 *
 * @param {Array} referencias - [{ categoria, nome, motivo, wiki_query }]
 * @returns {Promise<Array>} mesma lista, com `image_url`, `wiki_found` e `wiki_status`
 */
export async function fetchReferenceImages(referencias) {
  if (!referencias || !Array.isArray(referencias)) return referencias;

  const perRef = referencias.map(candidatesOf);
  const allTitles = [...new Set(perRef.flat())];

  // resultado[título][língua] = { status, image_url, wikidata } | 'failed'
  const results = new Map(allTitles.map(t => [t, {}]));
  const cached = new Map();
  for (const title of allTitles) {
    const hit = readCache(title);
    if (hit) cached.set(title, hit);
  }

  const pending = allTitles.filter(t => !cached.has(t));
  for (const lang of LANGS) {
    // EN só é consultado para quem não achou página COM imagem em PT.
    const ask = pending.filter(t => {
      const pt = results.get(t).pt;
      return lang === 'pt' || !(pt && pt !== 'failed' && pt.status === 'found' && pt.image_url);
    });
    if (ask.length === 0) break;
    const answer = await queryTitles(lang, ask);
    for (const t of ask) results.get(t)[lang] = answer ? answer.get(t) : 'failed';
  }

  // Wikidata para páginas encontradas sem imagem em nenhuma língua.
  const needWikidata = new Map(); // Q-id → títulos
  for (const t of pending) {
    const langs = Object.values(results.get(t)).filter(r => r && r !== 'failed' && r.status === 'found');
    if (langs.length > 0 && !langs.some(r => r.image_url)) {
      const id = langs.find(r => r.wikidata)?.wikidata;
      if (id) needWikidata.set(id, [...(needWikidata.get(id) || []), t]);
    }
  }
  let wikidata = new Map();
  try {
    wikidata = await wikidataImages([...needWikidata.keys()]);
  } catch (err) {
    logger.warn('Wikidata image lookup failed', { error: err.message });
  }

  // Consolida por título e guarda no cache.
  const byTitle = new Map(cached);
  for (const t of pending) {
    const langs = Object.values(results.get(t));
    const found = langs.filter(r => r && r !== 'failed' && r.status === 'found');
    let entry;
    if (found.length > 0) {
      const image = found.find(r => r.image_url)?.image_url
        || wikidata.get(found.find(r => r.wikidata)?.wikidata)
        || null;
      entry = { status: 'found', image_url: image };
    } else if (langs.length === LANGS.length && langs.every(r => r && r !== 'failed' && r.status === 'missing')) {
      entry = { status: 'missing', image_url: null };
    } else {
      entry = { status: 'unknown', image_url: null };
    }
    byTitle.set(t, entry);
    writeCache(t, entry);
  }

  return referencias.map((ref, i) => {
    const entries = perRef[i].map(t => byTitle.get(t));
    const found = entries.filter(e => e.status === 'found');
    let status = 'unknown';
    if (found.length > 0) status = 'found';
    else if (entries.length > 0 && entries.every(e => e.status === 'missing')) status = 'missing';
    return {
      ...ref,
      image_url: found.find(e => e.image_url)?.image_url || null,
      wiki_found: status === 'found',
      wiki_status: status,
    };
  });
}
