import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';
process.env.GEMINI_API_KEY = 'test-key';
process.env.LLM_LOG_PROMPT = '0';

// Camada de IA testada pela API pública (generateInterpretation /
// generateReferenceDetail) com um cliente Gemini FALSO: cada chamada ao
// modelo consome o próximo item de `script` e fica registrada em `calls`.
// Nada sai para a rede. Requer `--experimental-test-module-mocks`.

const calls = [];
let script = [];
const wiki = new Map(); // nome → 'found' | 'missing' | 'unknown' (padrão: found)

mock.module('@google/generative-ai', {
  namedExports: {
    SchemaType: { OBJECT: 'object', ARRAY: 'array', STRING: 'string' },
    GoogleGenerativeAI: class {
      getGenerativeModel(config) {
        return {
          async generateContent(prompt) {
            calls.push({ config, prompt });
            const step = script.shift();
            if (!step) throw new Error('script vazio: chamada inesperada ao modelo');
            if (step instanceof Error) throw step;
            const text = typeof step === 'string' ? step : JSON.stringify(step);
            return { response: { text: () => text, usageMetadata: {} } };
          },
        };
      }
    },
  },
});
mock.module('../src/services/image.service.js', {
  namedExports: {
    fetchReferenceImages: async refs => refs.map(ref => {
      const status = wiki.get(ref.nome) || 'found';
      return {
        ...ref,
        wiki_status: status,
        wiki_found: status === 'found',
        image_url: status === 'found' ? `https://img/${encodeURIComponent(ref.nome)}` : null,
      };
    }),
  },
});
mock.module('../src/utils/logger.js', {
  namedExports: { logger: { error() {}, warn() {}, info() {}, debug() {} } },
});

const { env } = await import('../src/config/environment.js');
const llm = await import('../src/services/llm.service.js');
const limiter = await import('../src/services/llm-limiter.js');
const { generateInterpretation, generateReferenceDetail, getRegenLens, PROMPT_VERSION } = llm;

const PROFILE = {
  scores: { O: 72.5, C: 40, E: 12, A: 88, N: 50 },
  dimensions: [
    { key: 'O', level: 'alto' }, { key: 'C', level: 'moderado' }, { key: 'E', level: 'muito_baixo' },
    { key: 'A', level: 'muito_alto' }, { key: 'N', level: 'moderado' },
  ],
};
const CONSISTENCY = {
  O: { tension: true, stddev: 1.53, mean: 0, n: 6 },
  C: { tension: false, stddev: 0.2, mean: 1, n: 6 },
};
const ARCHETYPE = { name: 'Hermione Granger', universe: 'Harry Potter', distance: 3.14159 };
const REFLECTION = { category_slug: 'interest', question_text: 'O que te move?', user_observation: 'perco a noção do tempo resolvendo quebra-cabeças difíceis' };

const ref = (nome, categoria) => ({ ancora: 'a', criterio: 'c', nome, categoria, motivo: `motivo ${nome}`, wiki_query: nome });
function payload(overrides = {}) {
  return {
    schema_version: '1.3.0',
    vibe_resumo: 'Decide sozinho e revisa em silêncio',
    referencias: [ref('Richard Feynman', 'Cientista'), ref('Hannah Arendt', 'Filósofa'), ref('Shikamaru Nara', 'Personagem')],
    obras_culturais: [
      { tipo: 'serie', titulo: 'Dark', autor_ou_artista: 'Baran bo Odar', motivo: 'm' },
      { tipo: 'filme', titulo: 'A Chegada', autor_ou_artista: 'Denis Villeneuve', motivo: 'm' },
      { tipo: 'anime', titulo: 'Frieren', autor_ou_artista: 'Kanehito Yamada', motivo: 'm' },
    ],
    interpretacao: 'Com abertura em 72%, você disse que "perco a noção do tempo resolvendo quebra-cabeças".',
    ...overrides,
  };
}

// Mensagem neutra de propósito: o status deve decidir sozinho a retentativa.
const httpError = (status, message = 'upstream error') => Object.assign(new Error(message), { status });

/** Avança timers falsos (backoff entre tentativas) até a promessa assentar. */
async function withFakeTimers(run) {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const promise = run();
    let settled = false;
    promise.then(() => { settled = true; }, () => { settled = true; });
    while (!settled) {
      await new Promise(resolve => setImmediate(resolve));
      mock.timers.tick(1000);
    }
    return await promise;
  } finally {
    mock.timers.reset();
  }
}

beforeEach(() => {
  calls.length = 0;
  script = [];
  wiki.clear();
  env.geminiApiKey = 'test-key';
});

// ── contrato de chamada (RNF019) ────────────────────────────────────────────

test('sem GEMINI_API_KEY a interpretação é pulada (null) sem chamar o modelo', async () => {
  env.geminiApiKey = null;
  assert.equal(await generateInterpretation(PROFILE, CONSISTENCY, [], ARCHETYPE), null);
  assert.equal(calls.length, 0);
});

test('RNF019: parâmetros explícitos de geração', async () => {
  script = [payload(), payload()];
  await generateInterpretation(PROFILE, CONSISTENCY, [], ARCHETYPE);
  await generateInterpretation(PROFILE, CONSISTENCY, [], ARCHETYPE, { temperature: 1.2 });

  const [first, regen] = calls.map(c => c.config);
  assert.equal(first.model, 'gemini-2.5-flash-lite');
  assert.equal(first.generationConfig.maxOutputTokens, 8192);
  assert.equal(first.generationConfig.responseMimeType, 'application/json');
  assert.equal(first.generationConfig.temperature, 0.9);
  assert.ok(first.generationConfig.responseSchema, 'saída estruturada com schema');
  assert.match(first.systemInstruction, /\S/);
  assert.equal(regen.generationConfig.temperature, 1.2);
});

test('schema de saída: âncora e critério ANTES do nome (ordem é funcional)', async () => {
  script = [payload()];
  await generateInterpretation(PROFILE, null, [], null);
  const schema = calls[0].config.generationConfig.responseSchema;
  const reference = schema.properties.referencias;

  assert.deepEqual(Object.keys(reference.items.properties), ['ancora', 'criterio', 'nome', 'categoria', 'motivo', 'wiki_query']);
  assert.deepEqual(reference.items.required, ['ancora', 'criterio', 'nome', 'categoria', 'motivo', 'wiki_query']);
  assert.deepEqual([reference.minItems, reference.maxItems], [2, 3]);
  const works = schema.properties.obras_culturais;
  assert.deepEqual([works.minItems, works.maxItems], [3, 3]);
  assert.deepEqual(works.items.required, ['tipo', 'titulo', 'autor_ou_artista', 'motivo']);
  assert.deepEqual(schema.required, ['schema_version', 'vibe_resumo', 'referencias', 'obras_culturais', 'interpretacao']);
});

// ── estrutura de blocos do prompt (Especificações técnicas / RNF018) ───────

test('prompt traz os três blocos de dados com os números do perfil', async () => {
  script = [payload()];
  await generateInterpretation(PROFILE, CONSISTENCY, [REFLECTION], ARCHETYPE, {
    antiArchetype: { name: 'Draco Malfoy', distance: 9 },
  });
  const { prompt } = calls[0];

  assert.match(prompt, /\[1\] PERFIL BIG FIVE — QUANTITATIVO/);
  assert.match(prompt, /- Abertura a Experiências \(O\): 72\.5% — alto/);
  assert.match(prompt, /- Extroversão \(E\): 12% — muito_baixo/);
  assert.match(prompt, /- Abertura a Experiências \(desvio: 1\.53\) — respostas oscilaram entre extremos\./);
  assert.doesNotMatch(prompt, /Conscienciosidade \(desvio/);
  assert.match(prompt, /\[2\] RESPOSTAS INTERPRETATIVAS — QUALITATIVO/);
  assert.match(prompt, /perco a noção do tempo/);
  assert.match(prompt, /Mais próximo: Hermione Granger \(universo Harry Potter\) — distância euclidiana 3\.14\./);
  assert.match(prompt, /Mais DISTANTE \(anti-arquétipo\): Draco Malfoy — distância 9\.00\./);
  // Com reflexão disponível, a citação obrigatória deve vir dela.
  assert.match(prompt, /A citação entre aspas na "interpretacao" DEVE vir de uma delas/);
});

test('blocos de controle só aparecem quando aplicáveis', async () => {
  script = [payload(), payload()];
  await generateInterpretation(PROFILE, null, [], null);
  await generateInterpretation(PROFILE, CONSISTENCY, [], ARCHETYPE, {
    excludedReferenceNames: ['Feynman', 'feynman ', 'Arendt'],
    excludedWorkTitles: ['Dark'],
    excludedCategories: ['Cientista'],
    regenLens: getRegenLens(2),
  });
  const [plain, regen] = calls.map(c => c.prompt);

  assert.doesNotMatch(plain, /\[EXCLUSÕES\]|\[LENTE DE REGENERAÇÃO/);
  assert.match(plain, /Sem tensões internas relevantes/);
  assert.match(plain, /Nenhum arquétipo identificado/);

  assert.match(regen, /\[EXCLUSÕES\]/);
  assert.match(regen, /NÃO repita nenhuma destas referências já usadas: Feynman, Arendt\./);
  assert.match(regen, /NÃO use estas categorias já usadas: Cientista\./);
  assert.match(regen, /NÃO repita nenhuma destas obras já usadas: Dark\./);
  assert.match(regen, /\[LENTE DE REGENERAÇÃO: Ficção\]/);
});

// ── pós-processamento ───────────────────────────────────────────────────────

test('resposta válida: versão do prompt carimbada e referências verificadas na Wikipedia', async () => {
  script = [payload()];
  const result = await generateInterpretation(PROFILE, CONSISTENCY, [REFLECTION], ARCHETYPE);

  assert.equal(result.prompt_version, PROMPT_VERSION);
  assert.deepEqual(result.referencias.map(r => r.nome), ['Richard Feynman', 'Hannah Arendt', 'Shikamaru Nara']);
  assert.ok(result.referencias.every(r => r.wiki_status === 'found' && r.image_url));
  assert.deepEqual(result.obras_culturais.map(w => w.tipo), ['serie', 'filme', 'anime']);
  assert.equal(calls.length, 1, 'reflexão citada → sem nova chamada');
});

test('reflexão não citada → uma nova chamada com [CORREÇÃO OBRIGATÓRIA]', async () => {
  const uncited = payload({ interpretacao: 'Você tem abertura em 72% e amabilidade em 88%.' });
  const cited = payload({ interpretacao: 'Você escreveu "perco a noção do tempo resolvendo quebra-cabeças".' });
  script = [uncited, cited];

  const result = await generateInterpretation(PROFILE, CONSISTENCY, [REFLECTION], ARCHETYPE);

  assert.equal(calls.length, 2);
  assert.match(calls[1].prompt, /\[CORREÇÃO OBRIGATÓRIA\]/);
  assert.match(calls[1].prompt, /um trecho de: "perco a noção do tempo resolvendo quebra-cabeças difíceis"/);
  assert.equal(result.interpretacao, cited.interpretacao);
});

test('se a correção falhar, a primeira interpretação é mantida', async () => {
  const uncited = payload({ interpretacao: 'Você tem abertura em 72%.' });
  script = [uncited, 'isto não é json'];

  const result = await generateInterpretation(PROFILE, CONSISTENCY, [REFLECTION], ARCHETYPE);

  assert.equal(calls.length, 2);
  assert.equal(result.interpretacao, uncited.interpretacao);
});

test('referência alucinada (404 na Wikipedia) é trocada por substituta também verificada', async () => {
  wiki.set('George A. Stillson', 'missing');
  wiki.set('Nome Inventado Dois', 'missing');
  script = [
    payload({ referencias: [ref('Richard Feynman', 'Cientista'), ref('George A. Stillson', 'Político'), ref('Hannah Arendt', 'Filósofa')] }),
    { referencias: [ref('Nome Inventado Dois', 'Artista'), ref('Frida Kahlo', 'Artista')] },
  ];

  const result = await generateInterpretation(PROFILE, CONSISTENCY, [], ARCHETYPE);

  assert.equal(calls.length, 2, 'uma chamada extra de substituição');
  const replacementPrompt = calls[1].prompt;
  assert.match(replacementPrompt, /Gere 1 substituta\(s\)/);
  assert.match(replacementPrompt, /NÃO use nenhum destes nomes \(já usados ou rejeitados\): .*George A\. Stillson/);
  assert.equal(calls[1].config.generationConfig.temperature, 1);

  const names = result.referencias.map(r => r.nome);
  assert.deepEqual(names, ['Richard Feynman', 'Hannah Arendt', 'Frida Kahlo']);
  assert.ok(!names.includes('Nome Inventado Dois'), 'substituta alucinada também é barrada');
});

test('mais de 3 referências válidas → só as 3 primeiras, sem chamada extra', async () => {
  script = [payload({ referencias: ['A', 'B', 'C', 'D'].map(n => ref(n, `Cat ${n}`)) })];
  const result = await generateInterpretation(PROFILE, null, [], null);
  assert.deepEqual(result.referencias.map(r => r.nome), ['A', 'B', 'C']);
  assert.equal(calls.length, 1);
});

test('rejeição sem substituta válida: ficam as reais (2), sem nome enlatado', async () => {
  wiki.set('Inventado', 'missing');
  script = [
    payload({ referencias: [ref('A', 'X'), ref('Inventado', 'Y'), ref('B', 'Z')] }),
    { referencias: [] },
  ];
  const result = await generateInterpretation(PROFILE, null, [], null);
  assert.deepEqual(result.referencias.map(r => r.nome), ['A', 'B']);
  assert.match(calls[1].prompt, /NÃO use nenhum destes nomes \(já usados ou rejeitados\): Inventado, A, B\./);
});

test('lookup incerto (timeout na Wikipedia) NÃO descarta a referência', async () => {
  wiki.set('Atticus Finch', 'unknown');
  script = [payload({ referencias: [ref('Atticus Finch', 'Personagem'), ref('Hannah Arendt', 'Filósofa'), ref('Frida Kahlo', 'Artista')] })];

  const result = await generateInterpretation(PROFILE, CONSISTENCY, [], ARCHETYPE);

  assert.equal(calls.length, 1, 'sem substituição');
  assert.equal(result.referencias[0].nome, 'Atticus Finch');
});

// ── resiliência: tentativas e degradação graciosa ───────────────────────────

test('erros transitórios são retentados com recuo; persistentes degradam para null', async () => {
  const cases = [
    { error: httpError(503), expectedCalls: 3 },
    { error: httpError(429), expectedCalls: 3 },
    { error: new Error('LLM timeout reached'), expectedCalls: 3 },
    { error: new Error('Service Unavailable'), expectedCalls: 3 },
    { error: new Error('rate limit exceeded'), expectedCalls: 3 },
    { error: httpError(500), expectedCalls: 3 },
    { error: Object.assign(new Error('upstream error'), { statusCode: 502 }), expectedCalls: 3 },
    { error: new Error('request aborted'), expectedCalls: 3 },
    { error: new Error('got 503 from upstream'), expectedCalls: 3 },
    { error: new Error('got 429 from upstream'), expectedCalls: 3 },
    { error: httpError(400, 'bad request'), expectedCalls: 1 },
    { error: httpError(403, 'permission denied'), expectedCalls: 1 },
    { error: httpError(499), expectedCalls: 1 },
    { error: new Error(''), expectedCalls: 1 },
  ];
  for (const { error, expectedCalls } of cases) {
    calls.length = 0;
    script = [error, error, error];
    const result = await withFakeTimers(() => generateInterpretation(PROFILE, null, [], null));
    assert.equal(result, null, error.message);
    assert.equal(calls.length, expectedCalls, error.message);
  }
});

test('erro transitório seguido de sucesso recupera o resultado', async () => {
  script = [httpError(503), payload()];
  const result = await withFakeTimers(() => generateInterpretation(PROFILE, null, [], null));
  assert.equal(calls.length, 2);
  assert.equal(result.vibe_resumo, payload().vibe_resumo);
});

test('resposta fora do contrato degrada para null e não consome orçamento', async () => {
  const before = limiter.checkDailyBudget().used;
  script = [JSON.stringify({ schema_version: '1.3.0', vibe_resumo: 'x' })];

  assert.equal(await generateInterpretation(PROFILE, null, [], null), null);
  assert.equal(limiter.checkDailyBudget().used, before);
});

// ── detalhamento de referência ──────────────────────────────────────────────

test('detalhamento exige nome da referência', async () => {
  await assert.rejects(generateReferenceDetail(PROFILE, null, [], null, { nome: '  ' }), /reference\.nome is required/);
  assert.equal(calls.length, 0);
});

test('detalhamento: prompt com contexto anterior e saída normalizada', async () => {
  script = [{
    titulo: '  ',
    secoes: [
      { titulo: ' Traços ', conteudo: ' Você e ele... ' },
      { titulo: 'Sem conteúdo', conteudo: '' },
      null,
      { titulo: 'Comportamento', conteudo: 'c2' },
      { titulo: 'Tensão', conteudo: 'c3' },
      { titulo: 'Excedente', conteudo: 'c4' },
    ],
  }];

  const detail = await generateReferenceDetail(PROFILE, CONSISTENCY, [], ARCHETYPE, { nome: 'Richard Feynman' }, {
    priorInterpretation: 'texto já entregue',
    otherReferences: [{ nome: 'Hannah Arendt', motivo: 'pensa só' }, { nome: 'Richard Feynman', motivo: 'eu mesmo' }],
  });

  const { prompt, config } = calls[0];
  assert.match(prompt, /- Nome: Richard Feynman/);
  assert.match(prompt, /- Categoria: Personalidade cultural/);
  assert.match(prompt, /\[4\] TEXTO INTERPRETATIVO JÁ ENTREGUE AO USUÁRIO[\s\S]*texto já entregue/);
  assert.match(prompt, /- Hannah Arendt — motivo anterior: "pensa só"/);
  assert.doesNotMatch(prompt, /eu mesmo/, 'a própria referência não entra em [5]');
  assert.match(prompt, /oscilação entre extremos dentro do eixo/);
  assert.equal(config.generationConfig.temperature, 0.85);

  assert.deepEqual(detail, {
    schema_version: '1.0.0',
    titulo: 'Você x Richard Feynman',
    secoes: [
      { titulo: 'Traços', conteudo: 'Você e ele...' },
      { titulo: 'Comportamento', conteudo: 'c2' },
      { titulo: 'Tensão', conteudo: 'c3' },
    ],
  });
});

test('detalhamento com menos de 2 seções válidas degrada para null', async () => {
  script = [{ titulo: 'T', secoes: [{ titulo: 'Só uma', conteudo: 'x' }] }];
  assert.equal(await generateReferenceDetail(PROFILE, null, [], null, { nome: 'X' }), null);
});

// ── orçamento diário (por último: esgota o contador em memória) ────────────

test('orçamento diário esgotado → null sem chamar o modelo', async () => {
  while (limiter.checkDailyBudget().allowed) limiter.recordLLMCall();
  script = [payload()];

  assert.equal(await generateInterpretation(PROFILE, null, [], null), null);
  assert.equal(calls.length, 0);
});
