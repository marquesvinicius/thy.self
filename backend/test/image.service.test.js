import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';

// Detector de alucinação + imagens: uma referência só é descartada quando a
// Wikipedia CONFIRMA que nenhum título candidato existe em PT e EN. Incerteza
// de rede nunca descarta. As consultas vão em lote (uma por língua).
// Requer `--experimental-test-module-mocks` (já incluso no npm test).

mock.module('../src/utils/logger.js', {
  namedExports: { logger: { error() {}, warn() {}, info() {}, debug() {} } },
});
const { fetchReferenceImages, clearImageCache } = await import('../src/services/image.service.js');

/**
 * Wikimedia falsa.
 *   wiki: { 'pt:Titulo': { image?, wikidata?, redirect? } | status numérico | Error, ... }
 *         título ausente → página inexistente (missing)
 *   wikidata: { Q1: 'Arquivo.jpg' }
 *   fail: { pt: [429, ...] } → respostas de erro consumidas antes da resposta normal
 */
function fakeWikimedia({ wiki = {}, wikidata = {}, fail = {} } = {}) {
  const requests = [];
  mock.method(globalThis, 'fetch', async (url, init) => {
    const u = new URL(url);
    const lang = u.hostname.split('.')[0];
    requests.push({ host: u.hostname, params: Object.fromEntries(u.searchParams), headers: init.headers });

    const queue = fail[lang];
    if (queue && queue.length) {
      const step = queue.shift();
      if (step instanceof Error) throw step;
      return { ok: false, status: step, headers: { get: () => null }, json: async () => ({}) };
    }

    if (u.hostname === 'www.wikidata.org') {
      const entities = {};
      for (const id of u.searchParams.get('ids').split('|')) {
        entities[id] = wikidata[id]
          ? { claims: { P18: [{ mainsnak: { datavalue: { value: wikidata[id] } } }] } }
          : { claims: {} };
      }
      return { ok: true, status: 200, json: async () => ({ entities }) };
    }

    const titles = u.searchParams.get('titles').split('|');
    const redirects = [];
    const pages = [];
    for (const title of titles) {
      const entry = wiki[`${lang}:${title}`];
      if (!entry) { pages.push({ title, missing: true }); continue; }
      const finalTitle = entry.redirect || title;
      if (entry.redirect) redirects.push({ from: title, to: finalTitle });
      pages.push({
        title: finalTitle,
        pageid: 1,
        ...(entry.image ? { thumbnail: { source: entry.image } } : {}),
        ...(entry.wikidata ? { pageprops: { wikibase_item: entry.wikidata } } : {}),
      });
    }
    return { ok: true, status: 200, json: async () => ({ query: { redirects, pages } }) };
  });
  return requests;
}

afterEach(() => {
  mock.restoreAll();
  clearImageCache();
});

const one = async reference => (await fetchReferenceImages([reference]))[0];
const pick = r => ({ image_url: r.image_url, wiki_found: r.wiki_found, wiki_status: r.wiki_status });

test('página em PT com imagem: encontrada, sem consultar EN', async () => {
  const requests = fakeWikimedia({ wiki: { 'pt:Hannah Arendt': { image: 'https://img/arendt.jpg' } } });
  const result = await one({ nome: 'Hannah Arendt', wiki_query: 'Hannah_Arendt' });

  assert.deepEqual(pick(result), { image_url: 'https://img/arendt.jpg', wiki_found: true, wiki_status: 'found' });
  assert.equal(result.nome, 'Hannah Arendt', 'campos originais preservados');
  assert.deepEqual(requests.map(r => r.host), ['pt.wikipedia.org'], '_ vira espaço e só PT é consultado');
});

test('toda consulta envia User-Agent descritivo (política da Wikimedia)', async () => {
  const requests = fakeWikimedia({ wiki: { 'pt:X': {} } });
  await one({ nome: 'X' });
  assert.match(requests[0].headers['User-Agent'], /^thy\.self\/1\.0 \(/);
});

test('página em PT sem imagem: a imagem vem da página em EN', async () => {
  fakeWikimedia({ wiki: { 'pt:King Arthur': {}, 'en:King Arthur': { image: 'https://img/arthur.jpg' } } });
  const result = await one({ nome: 'King Arthur' });
  assert.deepEqual(pick(result), { image_url: 'https://img/arthur.jpg', wiki_found: true, wiki_status: 'found' });
});

test('sem imagem nas duas línguas: usa a imagem principal do Wikidata', async () => {
  const requests = fakeWikimedia({
    wiki: { 'pt:Tsutomu Miyazaki': { wikidata: 'Q1' }, 'en:Tsutomu Miyazaki': { wikidata: 'Q1' } },
    wikidata: { Q1: 'Foto do rosto.jpg' },
  });
  const result = await one({ nome: 'Tsutomu Miyazaki' });
  assert.equal(result.image_url, 'https://commons.wikimedia.org/wiki/Special:FilePath/Foto_do_rosto.jpg?width=400');
  assert.equal(requests.at(-1).host, 'www.wikidata.org');
});

test('página existente sem imagem em lugar nenhum: encontrada, image_url null', async () => {
  fakeWikimedia({ wiki: { 'en:Eeyore': {} } });
  const result = await one({ nome: 'Eeyore' });
  assert.deepEqual(pick(result), { image_url: null, wiki_found: true, wiki_status: 'found' });
});

test('nenhum candidato existe em PT nem EN → missing (alucinação)', async () => {
  const requests = fakeWikimedia();
  const result = await one({ nome: 'George A. Stillson', wiki_query: 'George_Stillson_(politico)' });
  assert.deepEqual(pick(result), { image_url: null, wiki_found: false, wiki_status: 'missing' });
  assert.equal(requests.length, 2, 'uma consulta por língua, com os dois candidatos juntos');
  assert.equal(requests[0].params.titles, 'George Stillson (politico)|George A. Stillson');
});

test('título sugerido errado mas nome certo → encontrado pelo nome', async () => {
  fakeWikimedia({ wiki: { 'pt:Eeyore': { image: 'https://img/e.png' } } });
  const result = await one({ nome: 'Eeyore', wiki_query: 'Abelardo (Ursinho Pooh)' });
  assert.equal(result.wiki_status, 'found');
  assert.equal(result.image_url, 'https://img/e.png');
});

test('redirecionamento da Wikipedia é seguido até a página final', async () => {
  fakeWikimedia({ wiki: { 'pt:Pericles': { redirect: 'Péricles', image: 'https://img/p.jpg' } } });
  const result = await one({ nome: 'Pericles' });
  assert.equal(result.image_url, 'https://img/p.jpg');
});

test('três referências cabem numa única consulta por língua', async () => {
  const requests = fakeWikimedia({
    wiki: { 'pt:A': { image: 'a' }, 'pt:B': { image: 'b' }, 'pt:C': { image: 'c' } },
  });
  const out = await fetchReferenceImages([{ nome: 'A' }, { nome: 'B' }, { nome: 'C' }]);
  assert.deepEqual(out.map(r => r.image_url), ['a', 'b', 'c']);
  assert.equal(requests.length, 1);
});

test('429 transitório é retentado uma vez antes de desistir', async () => {
  const requests = fakeWikimedia({ wiki: { 'pt:Chaplin': { image: 'https://img/c.jpg' } }, fail: { pt: [429] } });
  const result = await one({ nome: 'Chaplin' });
  assert.equal(result.wiki_status, 'found');
  assert.equal(requests.length, 2);
});

test('falha persistente é incerteza (unknown), nunca inexistência', async () => {
  const cases = {
    '5xx nas duas línguas': { pt: [503, 503], en: [500, 500] },
    'rede caiu': { pt: [new Error('ECONNRESET'), new Error('ECONNRESET')], en: [new Error('aborted'), new Error('aborted')] },
    'PT diz que não existe, EN falha': { en: [503, 503] },
  };
  for (const [label, fail] of Object.entries(cases)) {
    fakeWikimedia({ fail });
    const result = await one({ nome: 'A' });
    assert.equal(result.wiki_status, 'unknown', label);
    assert.equal(result.wiki_found, false, label);
    mock.restoreAll();
    clearImageCache();
  }
});

test('sem nenhum candidato utilizável → unknown, sem consultar nada', async () => {
  const requests = fakeWikimedia();
  const result = await one({ nome: '  ', wiki_query: '' });
  assert.equal(result.wiki_status, 'unknown');
  assert.equal(requests.length, 0);
});

test('resultado definitivo fica em cache: a mesma referência não gera nova consulta', async () => {
  const requests = fakeWikimedia({ wiki: { 'pt:Frida Kahlo': { image: 'https://img/f.jpg' } } });
  await one({ nome: 'Frida Kahlo' });
  const again = await one({ nome: 'frida kahlo' });
  assert.equal(again.image_url, 'https://img/f.jpg');
  assert.equal(requests.length, 1);
});

test('incerteza não entra no cache: a próxima geração consulta de novo', async () => {
  const requests = fakeWikimedia({ fail: { pt: [503, 503], en: [503, 503] } });
  await one({ nome: 'A' });
  await one({ nome: 'A' });
  assert.ok(requests.length > 4);
});

test('preserva a ordem; entrada que não é lista volta intacta', async () => {
  fakeWikimedia({ wiki: { 'pt:B': {} } });
  const results = await fetchReferenceImages([{ nome: 'A' }, { nome: 'B' }]);
  assert.deepEqual(results.map(r => [r.nome, r.wiki_status]), [['A', 'missing'], ['B', 'found']]);

  assert.equal(await fetchReferenceImages(null), null);
  assert.equal(await fetchReferenceImages('x'), 'x');
});
