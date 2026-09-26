import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';

// Detector de alucinação: uma referência só é descartada quando a
// Wikipedia CONFIRMA (404) que o verbete não existe em PT e EN, para todos
// os títulos candidatos. Incerteza de rede nunca descarta.
// Requer `--experimental-test-module-mocks` (já incluso no npm test).

mock.module('../src/utils/logger.js', {
  namedExports: { logger: { error() {}, warn() {}, info() {}, debug() {} } },
});
const { fetchReferenceImages } = await import('../src/services/image.service.js');

/**
 * Wikipedia falsa. `routes` mapeia "pt:Titulo" / "en:Titulo" para uma lista
 * de respostas consumidas em ordem (status numérico, objeto JSON ou Error).
 * Título sem rota → 404.
 */
function fakeWikipedia(routes = {}) {
  const requests = [];
  mock.method(globalThis, 'fetch', async (url, init) => {
    const match = url.match(/^https:\/\/(pt|en)\.wikipedia\.org\/api\/rest_v1\/page\/summary\/(.+)$/);
    const key = `${match[1]}:${decodeURIComponent(match[2])}`;
    requests.push({ key, headers: init.headers });
    const queue = routes[key] || [404];
    const step = queue.length > 1 ? queue.shift() : queue[0];
    if (step instanceof Error) throw step;
    if (typeof step === 'number') return { ok: false, status: step, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => step };
  });
  return requests;
}

afterEach(() => mock.restoreAll());

const one = async reference => (await fetchReferenceImages([reference]))[0];

test('verbete em PT: encontrado, com miniatura, sem consultar EN', async () => {
  const requests = fakeWikipedia({ 'pt:Hannah_Arendt': [{ thumbnail: { source: 'https://img/arendt.jpg' } }] });

  const result = await one({ nome: 'Hannah Arendt', wiki_query: 'Hannah Arendt' });

  assert.deepEqual(
    { image_url: result.image_url, wiki_found: result.wiki_found, wiki_status: result.wiki_status },
    { image_url: 'https://img/arendt.jpg', wiki_found: true, wiki_status: 'found' }
  );
  assert.equal(result.nome, 'Hannah Arendt', 'campos originais preservados');
  assert.deepEqual(requests.map(r => r.key), ['pt:Hannah_Arendt'], 'espaço vira _ e só PT é consultado');
});

test('toda consulta envia User-Agent descritivo (política da Wikimedia)', async () => {
  const requests = fakeWikipedia({ 'pt:X': [{}] });
  await one({ nome: 'X' });
  assert.match(requests[0].headers['User-Agent'], /^thy\.self\/1\.0 \(/);
});

test('verbete só em EN: encontrado, sem miniatura → image_url null', async () => {
  fakeWikipedia({ 'en:Eeyore': [{ title: 'Eeyore' }] });
  const result = await one({ nome: 'Eeyore', wiki_query: 'Eeyore' });
  assert.equal(result.wiki_status, 'found');
  assert.equal(result.image_url, null);
});

test('404 em PT e EN para todos os candidatos → missing (alucinação)', async () => {
  const requests = fakeWikipedia();
  const result = await one({ nome: 'George A. Stillson', wiki_query: 'George_Stillson_(politico)' });
  assert.equal(result.wiki_status, 'missing');
  assert.equal(result.wiki_found, false);
  assert.equal(requests.length, 4, '2 candidatos × 2 línguas');
});

test('título sugerido errado mas nome certo → encontrado pelo nome', async () => {
  fakeWikipedia({ 'pt:Eeyore': [{}] });
  const result = await one({ nome: 'Eeyore', wiki_query: 'Abelardo (Ursinho Pooh)' });
  assert.equal(result.wiki_status, 'found');
});

test('candidatos repetidos (mesmo título, outra caixa) são consultados uma vez', async () => {
  const requests = fakeWikipedia();
  await one({ nome: 'Frida Kahlo', wiki_query: 'frida kahlo' });
  assert.equal(requests.length, 2);
});

test('429 transitório é retentado na mesma língua antes de desistir', async () => {
  const requests = fakeWikipedia({ 'pt:Chaplin': [429, { thumbnail: { source: 'https://img/c.jpg' } }] });
  const result = await one({ nome: 'Chaplin' });
  assert.equal(result.wiki_status, 'found');
  assert.deepEqual(requests.map(r => r.key), ['pt:Chaplin', 'pt:Chaplin']);
});

test('erro de servidor ou de rede persistente é incerteza (unknown), não inexistência', async () => {
  const cases = {
    '5xx nas duas línguas': { 'pt:A': [503], 'en:A': [500] },
    'rede caiu': { 'pt:A': [new Error('ECONNRESET')], 'en:A': [new Error('aborted')] },
    '404 numa língua, timeout na outra': { 'pt:A': [404], 'en:A': [new Error('The operation was aborted')] },
  };
  for (const [label, routes] of Object.entries(cases)) {
    fakeWikipedia(routes);
    const result = await one({ nome: 'A' });
    assert.equal(result.wiki_status, 'unknown', label);
    assert.equal(result.wiki_found, false, label);
    mock.restoreAll();
  }
});

test('um candidato incerto impede o veredito de inexistência', async () => {
  fakeWikipedia({ 'pt:Titulo_Chutado': [503], 'en:Titulo_Chutado': [503] });
  const result = await one({ nome: 'Nome Real', wiki_query: 'Titulo Chutado' });
  assert.equal(result.wiki_status, 'unknown');
});

test('sem nenhum candidato utilizável → unknown (nunca missing por falta de dado)', async () => {
  const requests = fakeWikipedia();
  const result = await one({ nome: '  ', wiki_query: '' });
  assert.equal(result.wiki_status, 'unknown');
  assert.equal(requests.length, 0);
});

test('processa a lista preservando a ordem; entrada que não é lista volta intacta', async () => {
  fakeWikipedia({ 'pt:B': [{}] });
  const results = await fetchReferenceImages([{ nome: 'A' }, { nome: 'B' }]);
  assert.deepEqual(results.map(r => [r.nome, r.wiki_status]), [['A', 'missing'], ['B', 'found']]);

  assert.equal(await fetchReferenceImages(null), null);
  assert.equal(await fetchReferenceImages('x'), 'x');
});
