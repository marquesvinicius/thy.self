import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

// Contratos puros da camada de IA: validação da resposta do modelo,
// normalização de referências/obras, detecção de reflexão e textos de
// fallback. Nada aqui chama o modelo.

const {
  parseResponse,
  parseStructuredJson,
  normalizeReferences,
  normalizeWorks,
  hasReflectionSignal,
  getReflectionTexts,
  interpretationCitesReflection,
  truncateWords,
  buildResponseStyleBlock,
} = await import('../src/services/llm.service.js');

const PROFILE = { scores: { O: 90, C: 20, E: 55, A: 70, N: 10 } };
const HOOK = 'seus traços de Abertura a Experiências e Amabilidade';

const ref = (nome, categoria = 'Cientista', extra = {}) => ({ nome, categoria, motivo: `m ${nome}`, ...extra });
const work = (tipo, titulo, extra = {}) => ({ tipo, titulo, autor_ou_artista: 'a', motivo: 'm', ...extra });

function payload(overrides = {}) {
  return {
    schema_version: '1.3.0',
    vibe_resumo: 'Decide sozinho',
    referencias: [ref('A'), ref('B', 'Filósofa'), ref('C', 'Personagem')],
    obras_culturais: [work('serie', 'Dark'), work('filme', 'A Chegada'), work('anime', 'Frieren')],
    interpretacao: 'Texto.',
    ...overrides,
  };
}

// ── validação da resposta ───────────────────────────────────────────────────

test('parseResponse recusa cada campo obrigatório ausente ou de tipo errado', () => {
  const cases = [
    [{ schema_version: undefined }, /schema_version/],
    [{ schema_version: 13 }, /schema_version/],
    [{ vibe_resumo: '' }, /vibe_resumo/],
    [{ vibe_resumo: ['x'] }, /vibe_resumo/],
    [{ referencias: 'A, B' }, /referencias/],
    [{ referencias: [] }, /referencias/],
    [{ obras_culturais: {} }, /obras_culturais/],
    [{ obras_culturais: [] }, /obras_culturais/],
    [{ interpretacao: null }, /interpretacao/],
    [{ interpretacao: { texto: 'x' } }, /interpretacao/],
  ];
  for (const [override, message] of cases) {
    assert.throws(() => parseResponse(JSON.stringify(payload(override))), message, JSON.stringify(override));
  }
});

test('parseResponse apara o vibe_resumo antes de truncar', () => {
  const parsed = parseResponse(JSON.stringify(payload({ vibe_resumo: '   curto e direto   ' })));
  assert.equal(parsed.vibe_resumo, 'curto e direto');
});

test('JSON recuperado de texto com cercas, aspas tipográficas e vírgula final', () => {
  const raw = 'Claro! Segue:\n```json\n{“a”: [1, 2,], ‘b’: 1,}\n```\nFim.';
  assert.deepEqual(parseStructuredJson(raw.replace('‘b’', '"b"')), { a: [1, 2], b: 1 });
  assert.throws(() => parseStructuredJson('} texto {'), /No JSON object found/);
  assert.throws(() => parseStructuredJson('sem chaves'), /No JSON object found/);
});

// ── referências ─────────────────────────────────────────────────────────────

test('referências: no máximo 3, com campos saneados e wiki_query caindo no nome', () => {
  const result = normalizeReferences([
    { nome: '  Richard Feynman ', categoria: ' ', motivo: '  curioso  ', ancora: ' "resolvo puzzles" ', criterio: '' },
    ref('B'), ref('C'), ref('D'),
    null, 'lixo', 42,
  ], { profile: PROFILE });

  assert.equal(result.length, 3);
  assert.deepEqual(result[0], {
    categoria: 'Personalidade',
    nome: 'Richard Feynman',
    motivo: 'curioso',
    wiki_query: 'Richard Feynman',
    ancora: '"resolvo puzzles"',
  });
});

test('referências preservam o veredito da Wikipédia quando já existe', () => {
  const [a, b] = normalizeReferences([
    ref('A', 'X', { image_url: null, wiki_found: false }),
    ref('B', 'Y', { image_url: 'https://img/b', wiki_found: true }),
  ]);
  assert.equal(a.image_url, null);
  assert.equal(a.wiki_found, false);
  assert.equal(b.image_url, 'https://img/b');
  assert.equal(b.wiki_found, true);
  assert.ok(!('image_url' in normalizeReferences([ref('C'), ref('D', 'Y')])[0]));
});

test('duas referências reais bastam: nenhum nome enlatado é acrescentado', () => {
  const result = normalizeReferences([ref('A'), ref('B', 'Filósofa')], { profile: PROFILE });
  assert.deepEqual(result.map(r => r.nome), ['A', 'B']);
});

test('fallback de referência: motivo honesto derivado dos dois traços mais altos', () => {
  const result = normalizeReferences([ref('Única', 'Escritora')], {
    profile: PROFILE,
    archetype: { name: 'Hermione' },
  });
  assert.equal(result.length, 3);
  for (const fallback of result.slice(1)) {
    assert.equal(fallback.motivo, `Aproximação direta por ${HOOK}, próximo do eixo de Hermione.`);
    assert.equal(fallback.wiki_found, true);
  }
  // Nome de fallback nunca repete o que já está na lista.
  assert.equal(new Set(result.map(r => r.nome)).size, 3);
});

test('gancho de traços: sem perfil, um traço válido, chave desconhecida', () => {
  const reason = profile => normalizeReferences([ref('Única', 'Escritora')], { profile })[1].motivo;
  assert.equal(reason(undefined), 'Aproximação direta por seu perfil psicológico.');
  assert.equal(reason({ scores: 'inválido' }), 'Aproximação direta por seu perfil psicológico.');
  assert.equal(reason({ scores: { C: 60, O: 'n/a' } }), 'Aproximação direta por seu traço de Conscienciosidade.');
  assert.equal(reason({ scores: { Z: 99, N: 1 } }), 'Aproximação direta por seus traços de Z e Neuroticismo.');
});

test('motivo vazio da IA não descarta a referência; ganha o motivo de fallback', () => {
  const [first] = normalizeReferences([{ nome: 'A', categoria: 'X', motivo: '' }, ref('B', 'Y')], { profile: PROFILE });
  assert.equal(first.nome, 'A');
  assert.equal(first.motivo, `Aproximação direta por ${HOOK}.`);
});

// ── obras ───────────────────────────────────────────────────────────────────

test('aliases de tipo de obra', () => {
  const aliases = { series: 'serie', seriado: 'serie', TV: 'serie', show: 'serie', movie: 'filme', Cinema: 'filme', 'Animação japonesa': 'anime', animacao: 'anime' };
  for (const [raw, expected] of Object.entries(aliases)) {
    const [only] = normalizeWorks([work(raw, `t-${raw}`)]).filter(w => w.titulo === `t-${raw}`);
    assert.equal(only?.tipo, expected, raw);
  }
  // Tipo desconhecido não entra; a vaga é preenchida pelo fallback.
  assert.ok(!normalizeWorks([work('podcast', 'Radiolab')]).some(w => w.titulo === 'Radiolab'));
});

test('obras: uma por tipo, primeira ocorrência vence, fallback com motivo por tipo', () => {
  const result = normalizeWorks(
    [work('filme', 'Primeiro', { motivo: '' }), work('filme', 'Segundo'), null, 'x'],
    { profile: PROFILE, excludedWorkTitles: ['Breaking Bad'] },
  );

  assert.deepEqual(result.map(w => [w.tipo, w.titulo]), [
    ['serie', 'Game of Thrones'], // Breaking Bad excluída → próxima do catálogo
    ['filme', 'Primeiro'],
    ['anime', 'Attack on Titan'],
  ]);
  assert.equal(result[0].motivo, `Aproximação direta por ${HOOK} — decisões longas, consequências acumuladas.`);
  assert.equal(result[1].motivo, `Aproximação direta por ${HOOK} — uma escolha central, condensada.`);
  assert.equal(result[2].motivo, `Aproximação direta por ${HOOK} — conflito interno em primeiro plano.`);
});

test('obra de fallback não repete título já usado', () => {
  const result = normalizeWorks([work('filme', 'Breaking Bad')]);
  assert.equal(result.find(w => w.tipo === 'serie').titulo, 'Game of Thrones');
});

test('sem nenhuma obra possível → erro explícito', () => {
  const allFallbacks = ['Breaking Bad', 'Game of Thrones', 'Succession', 'Oppenheimer', 'Duna: Parte Dois',
    'Bastardos Inglórios', 'Attack on Titan', 'Jujutsu Kaisen', 'Demon Slayer'];
  assert.throws(() => normalizeWorks([], { excludedWorkTitles: allFallbacks }), /obras_culturais/);
});

// ── reflexão ────────────────────────────────────────────────────────────────

test('o que conta como sinal de reflexão', () => {
  const cases = [
    [null, false],
    ['texto legado', false],
    [{ is_reflection: true }, true],
    [{ question_type: 'reflection' }, true],
    [{ user_observation: 'escrevi', alternative_text: null }, true],
    [{ user_observation: 'comentário', alternative_text: 'Opção B' }, false],
    [{ user_observation: '   ', alternative_text: null }, false],
    [{ is_reflection: 'true' }, false],
  ];
  for (const [signal, expected] of cases) {
    assert.equal(hasReflectionSignal([signal]), expected, JSON.stringify(signal));
  }
  assert.equal(hasReflectionSignal(undefined), false);
  assert.deepEqual(getReflectionTexts([{ question_type: 'reflection', user_observation: '  a  ' }, { is_reflection: true }]), ['a']);
});

test('citação da reflexão: janela contínua, palavras-chave ou reflexão curta', () => {
  const signals = text => [{ question_type: 'reflection', user_observation: text }];
  const long = 'perco a noção do tempo resolvendo quebra-cabeças difíceis';

  assert.equal(interpretationCitesReflection('', signals(long)), false, 'texto vazio');
  assert.equal(interpretationCitesReflection('Qualquer coisa.', []), true, 'sem reflexão não há o que citar');
  // 18 caracteres seguidos da reflexão (sem acento/caixa) bastam.
  assert.equal(interpretationCitesReflection('Você "resolvendo quebra-cabecas" sozinho.', signals(long)), true);
  // As seis primeiras palavras significativas presentes, fora de ordem e sem
  // nenhum trecho contínuo de 18 caracteres.
  assert.equal(interpretationCitesReflection('Difíceis, os quebra-cabeças; perco a noção? O tempo vai resolvendo.', signals(long)), true);
  // Falta uma das seis → não é citação.
  assert.equal(interpretationCitesReflection('Difíceis, os quebra-cabeças; perco a noção? O dia vai resolvendo.', signals(long)), false);
  // Reflexão curta (< 8 caracteres) exige a expressão inteira.
  assert.equal(interpretationCitesReflection('Você respondeu "nunca".', signals('nunca')), true);
  assert.equal(interpretationCitesReflection('Você respondeu "às vezes".', signals('nunca')), false);
  // Basta citar UMA das reflexões.
  assert.equal(interpretationCitesReflection('Você disse "nunca".', [...signals(long), ...signals('nunca')]), true);
});

test('reflexão com exatamente 8 caracteres usa a janela, não a igualdade', () => {
  const signals = [{ question_type: 'reflection', user_observation: 'abcdefgh' }];
  assert.equal(interpretationCitesReflection('xx abcdefgh xx', signals), true);
  assert.equal(interpretationCitesReflection('xx abcdefg xx', signals), false);
});

// ── texto ───────────────────────────────────────────────────────────────────

test('truncateWords: limite exato, espaços múltiplos e pontuação final', () => {
  assert.equal(truncateWords('um  dois\ntrês', 3), 'um dois três');
  assert.equal(truncateWords('um dois, três', 2), 'um dois…');
  assert.equal(truncateWords('um dois;— três', 2), 'um dois…');
  assert.equal(truncateWords(null, 2), '');
});

test('bloco de estilo: limiares de convicção, cautela e moderação', () => {
  const style = over => ({
    answer_count: 30, extreme_count: 0, neutral_count: 0, extreme_rate: 0.2, neutral_rate: 0.2,
    acquiescence: false, hesitation: null, ...over,
  });
  assert.match(buildResponseStyleBlock(style({ extreme_rate: 0.5, extreme_count: 15 })), /- Convicção: 15 de 30/);
  assert.match(buildResponseStyleBlock(style({ neutral_rate: 0.3, neutral_count: 9 })), /- Cautela: 9 de 30/);
  assert.match(buildResponseStyleBlock(style({ extreme_rate: 0.1, neutral_rate: 0.29, extreme_count: 3 })), /- Moderação: .*\(3 de 30\)/);
  assert.equal(buildResponseStyleBlock(style({ extreme_rate: 0.11 })), '');
  assert.equal(buildResponseStyleBlock(style({ extreme_rate: 0.49 })), '');
  assert.equal(buildResponseStyleBlock({ answer_count: 0 }), '');
  assert.equal(buildResponseStyleBlock(null), '');

  const hesitant = buildResponseStyleBlock(style({ hesitation: { question_text: 'x'.repeat(100), seconds: 9, median_seconds: 3 } }));
  assert.match(hesitant, /^\nAssinatura de estilo de resposta/);
  assert.match(hesitant, new RegExp(`demorou 9s \\(mediana: 3s\\) para responder "${'x'.repeat(90)}"\\.`));
});
