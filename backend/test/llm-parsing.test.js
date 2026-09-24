import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const {
  parseStructuredJson,
  parseResponse,
  normalizeReferences,
  normalizeWorks,
  formatInterpretativeBlock,
  hasReflectionSignal,
  interpretationCitesReflection,
  getRegenLens,
  PROMPT_VERSION,
  truncateWords,
  buildResponseStyleBlock,
} = await import('../src/services/llm.service.js');

const PROFILE_FIXTURE = {
  scores: { O: 70, C: 55, E: 40, A: 60, N: 30 },
  dimensions: [
    { key: 'O', level: 'alto' },
    { key: 'C', level: 'moderado' },
    { key: 'E', level: 'moderado' },
    { key: 'A', level: 'alto' },
    { key: 'N', level: 'baixo' },
  ],
};

function validPayload() {
  return {
    schema_version: '1.3.0',
    vibe_resumo: 'Curiosidade estruturada com calma interior',
    referencias: [
      { categoria: 'Cientista', nome: 'Richard Feynman', motivo: 'Curiosidade lúdica.', wiki_query: 'Richard_Feynman' },
      { categoria: 'Filósofa', nome: 'Hannah Arendt', motivo: 'Pensamento independente.', wiki_query: 'Hannah_Arendt' },
      { categoria: 'Personagem', nome: 'Shikamaru Nara', motivo: 'Estratégia sem alarde.', wiki_query: 'Shikamaru_Nara' },
    ],
    obras_culturais: [
      { tipo: 'serie', titulo: 'Dark', autor_ou_artista: 'Baran bo Odar', motivo: 'Complexidade.' },
      { tipo: 'filme', titulo: 'A Chegada', autor_ou_artista: 'Denis Villeneuve', motivo: 'Linguagem.' },
      { tipo: 'anime', titulo: 'Frieren', autor_ou_artista: 'Kanehito Yamada', motivo: 'Tempo.' },
    ],
    interpretacao: 'Perfil com abertura alta e neuroticismo baixo, coerente com as respostas.',
  };
}

// ── parseStructuredJson ──────────────────────────────────────────────────────

test('parseStructuredJson aceita JSON limpo', () => {
  assert.deepEqual(parseStructuredJson('{"a": 1}'), { a: 1 });
});

test('parseStructuredJson recupera JSON cercado de texto e crases', () => {
  const wrapped = '```json\n{"a": 1, "b": "x"}\n```';
  assert.deepEqual(parseStructuredJson(wrapped), { a: 1, b: 'x' });
});

test('parseStructuredJson corrige trailing commas e aspas tipográficas', () => {
  const dirty = '{“nome”: “Ana”, "lista": [1, 2,],}';
  assert.deepEqual(parseStructuredJson(dirty), { nome: 'Ana', lista: [1, 2] });
});

test('parseStructuredJson lança quando não há objeto JSON', () => {
  assert.throws(() => parseStructuredJson('sem json aqui'));
});

// ── parseResponse ────────────────────────────────────────────────────────────

test('parseResponse valida payload completo', () => {
  const parsed = parseResponse(JSON.stringify(validPayload()), { profile: PROFILE_FIXTURE });

  assert.equal(parsed.referencias.length, 3);
  assert.equal(parsed.obras_culturais.length, 3);
  assert.deepEqual(
    parsed.obras_culturais.map(w => w.tipo),
    ['serie', 'filme', 'anime']
  );
});

test('parseResponse rejeita payload sem campos obrigatórios', () => {
  const missing = validPayload();
  delete missing.interpretacao;
  assert.throws(() => parseResponse(JSON.stringify(missing)), /interpretacao/);
});

// ── normalizeReferences ──────────────────────────────────────────────────────

test('normalizeReferences deduplica por nome (ignorando acentos e caixa)', () => {
  const refs = [
    { categoria: 'Ator', nome: 'José Silva', motivo: 'm1', wiki_query: 'q' },
    { categoria: 'Ator', nome: 'jose silva', motivo: 'm2', wiki_query: 'q' },
    { categoria: 'Cientista', nome: 'Lise Meitner', motivo: 'm3', wiki_query: 'q' },
    { categoria: 'Personagem', nome: 'Guts', motivo: 'm4', wiki_query: 'q' },
  ];
  const result = normalizeReferences(refs, { profile: PROFILE_FIXTURE });

  assert.equal(result.length, 3);
  assert.equal(result.filter(r => r.nome.toLowerCase().includes('silva')).length, 1);
});

test('normalizeReferences respeita a lista de exclusões', () => {
  const refs = [
    { categoria: 'Ator', nome: 'Cillian Murphy', motivo: 'm', wiki_query: 'q' },
    { categoria: 'Diretora', nome: 'Greta Gerwig', motivo: 'm', wiki_query: 'q' },
    { categoria: 'Escritor', nome: 'Jorge Amado', motivo: 'm', wiki_query: 'q' },
    { categoria: 'Cientista', nome: 'Alan Turing', motivo: 'm', wiki_query: 'q' },
  ];
  const result = normalizeReferences(refs, {
    profile: PROFILE_FIXTURE,
    excludedReferenceNames: ['cillian murphy'],
  });

  assert.ok(!result.some(r => r.nome === 'Cillian Murphy'));
  assert.equal(result.length, 3);
});

test('normalizeReferences completa com fallbacks quando faltam itens', () => {
  const refs = [
    { categoria: 'Escritora', nome: 'Clarice Lispector', motivo: 'm', wiki_query: 'q' },
  ];
  const result = normalizeReferences(refs, { profile: PROFILE_FIXTURE });

  assert.equal(result.length, 3);
  assert.equal(result[0].nome, 'Clarice Lispector');
  // Fallbacks vêm com motivo gerado a partir do perfil
  assert.ok(result[1].motivo.length > 0);
});

test('fallback prefere categorias ainda não usadas (três ângulos distintos)', () => {
  const result = normalizeReferences(
    [{ categoria: 'Cientista', nome: 'Marie Curie', motivo: 'm' }],
    { profile: PROFILE_FIXTURE },
  );
  // Alan Turing (também Cientista) é pulado em favor de outra categoria.
  assert.deepEqual(result.map(r => r.categoria), ['Cientista', 'Escritora', 'Filósofa']);
});

test('fallback repete categoria só quando não resta alternativa', () => {
  const result = normalizeReferences(
    [{ categoria: 'Cientista', nome: 'Marie Curie', motivo: 'm' }],
    { profile: PROFILE_FIXTURE, excludedCategories: ['Escritora', 'Filósofa', 'Diretor', 'Música', 'Personagem'] },
  );
  assert.deepEqual(result.map(r => r.nome), ['Marie Curie', 'Alan Turing']);
});

test('normalizeReferences lança quando nada sobra após filtros', () => {
  assert.throws(() => normalizeReferences([], {
    profile: PROFILE_FIXTURE,
    // Exclui todos os fallbacks conhecidos para forçar lista vazia
    excludedReferenceNames: [
      'Clarice Lispector', 'Alan Turing', 'Hannah Arendt',
      'Hayao Miyazaki', 'Björk', 'Walter White',
    ],
  }));
});

// ── normalizeWorks ───────────────────────────────────────────────────────────

test('normalizeWorks garante exatamente 1 série, 1 filme e 1 anime', () => {
  const works = [
    { tipo: 'serie', titulo: 'Dark', autor_ou_artista: 'x', motivo: 'm' },
    { tipo: 'serie', titulo: 'Severance', autor_ou_artista: 'x', motivo: 'm' },
    { tipo: 'filme', titulo: 'Her', autor_ou_artista: 'x', motivo: 'm' },
  ];
  const result = normalizeWorks(works, { profile: PROFILE_FIXTURE });

  assert.deepEqual(result.map(w => w.tipo), ['serie', 'filme', 'anime']);
  assert.equal(result[0].titulo, 'Dark'); // primeira série vence
  // anime ausente → preenchido por fallback com motivo gerado
  assert.ok(result[2].titulo.length > 0);
  assert.ok(result[2].motivo.length > 0);
});

test('normalizeWorks normaliza aliases de tipo (movie → filme, tv → serie)', () => {
  const works = [
    { tipo: 'tv', titulo: 'The Bear', autor_ou_artista: 'x', motivo: 'm' },
    { tipo: 'movie', titulo: 'Whiplash', autor_ou_artista: 'x', motivo: 'm' },
    { tipo: 'animacao', titulo: 'Mob Psycho 100', autor_ou_artista: 'x', motivo: 'm' },
  ];
  const result = normalizeWorks(works, { profile: PROFILE_FIXTURE });

  assert.deepEqual(result.map(w => w.tipo), ['serie', 'filme', 'anime']);
  assert.equal(result[2].titulo, 'Mob Psycho 100');
});

test('normalizeWorks exclui títulos já usados', () => {
  const works = [
    { tipo: 'serie', titulo: 'Dark', autor_ou_artista: 'x', motivo: 'm' },
    { tipo: 'filme', titulo: 'Her', autor_ou_artista: 'x', motivo: 'm' },
    { tipo: 'anime', titulo: 'Frieren', autor_ou_artista: 'x', motivo: 'm' },
  ];
  const result = normalizeWorks(works, {
    profile: PROFILE_FIXTURE,
    excludedWorkTitles: ['dark'],
  });

  assert.ok(!result.some(w => w.titulo === 'Dark'));
  // O slot de série é preenchido por fallback
  assert.equal(result.filter(w => w.tipo === 'serie').length, 1);
});

test('normalizeReferences exclui categorias já usadas', () => {
  const refs = [
    { categoria: 'Diretor', nome: 'Denis Villeneuve', motivo: 'm', wiki_query: 'q' },
    { categoria: 'Cientista', nome: 'Lise Meitner', motivo: 'm', wiki_query: 'q' },
    { categoria: 'Escritora', nome: 'Clarice Lispector', motivo: 'm', wiki_query: 'q' },
  ];
  const result = normalizeReferences(refs, {
    profile: PROFILE_FIXTURE,
    excludedCategories: ['Diretor'],
  });

  assert.ok(!result.some(r => r.categoria === 'Diretor'));
  // Política: 2 referências REAIS valem mais que 3 com uma enlatada.
  // O fallback só entra para evitar seção vazia (menos de 2).
  assert.equal(result.length, 2);
  assert.ok(!result.some(r => r.motivo.startsWith('Aproximação direta por')));
});

test('normalizeReferences preserva o rastro de raciocínio (ancora/criterio)', () => {
  const refs = [
    {
      ancora: '"deixei um amigo levar a culpa"',
      criterio: 'evita confronto direto assumindo custo depois',
      categoria: 'Escritor',
      nome: 'Graciliano Ramos',
      motivo: 'ponte',
      wiki_query: 'Graciliano_Ramos',
    },
    { categoria: 'Cientista', nome: 'Lise Meitner', motivo: 'm', wiki_query: 'q' },
  ];
  const result = normalizeReferences(refs, { profile: PROFILE_FIXTURE });

  assert.equal(result.length, 2);
  assert.equal(result[0].ancora, '"deixei um amigo levar a culpa"');
  assert.match(result[0].criterio, /evita confronto/);
  // Referência sem os campos novos não ganha chaves vazias
  assert.equal('ancora' in result[1], false);
});

test('formatInterpretativeBlock inclui cenário (context) da pergunta', () => {
  const block = formatInterpretativeBlock([
    {
      category_slug: 'moral_dilemma',
      question_text: 'Você devolveria a carteira?',
      question_context: 'Ele tem uma família para sustentar.',
      alternative_text: 'Sim, devolveria.',
      user_observation: null,
    },
  ]);

  assert.match(block, /cenário: "Ele tem uma família para sustentar\."/);
  assert.match(block, /devolveria/i);
});

test('formatInterpretativeBlock: bloco [2] completo, agrupado e em ordem fixa de categorias', () => {
  const block = formatInterpretativeBlock([
    { category_slug: 'interest', question_text: 'Q'.repeat(85), alternative_text: 'Astronomia', user_observation: 'desde criança' },
    '  Música  ',                // sinal legado (string) → interesse
    '   ',                       // vazio: ignorado
    null,                        // inválido: ignorado
    { category_slug: 'custom_x', question_text: 'Extra?', alternative_text: null, user_observation: null },
    { category_slug: 'moral_dilemma', question_text: 'Mentiria?', context: 'No trabalho', user_observation: 'Não sei dizer', alternative_text: '' },
  ]);

  assert.equal(block, [
    'Dilemas morais:',
    '- [Mentiria?] (reflexão do usuário)',
    '  (cenário: "No trabalho")',
    '  "Não sei dizer"',
    '',
    'Interesses manifestados:',
    `- [${'Q'.repeat(80)}…] → "Astronomia"`,
    '  (comentário do usuário: "desde criança")',
    '- → "Música"',
    '',
    'custom_x:',
    '- [Extra?] (sem resposta registrada)',
  ].join('\n'));
});

test('formatInterpretativeBlock sem sinais declara a ausência', () => {
  assert.equal(formatInterpretativeBlock([]), 'Nenhuma resposta interpretativa registrada pelo usuário.');
  assert.equal(formatInterpretativeBlock(undefined), 'Nenhuma resposta interpretativa registrada pelo usuário.');
});

test('hasReflectionSignal e interpretationCitesReflection', () => {
  const signals = [
    {
      category_slug: 'interest',
      question_type: 'reflection',
      is_reflection: true,
      question_text: 'O que importa?',
      alternative_text: null,
      user_observation: 'às vezes improviso só para não travar',
    },
  ];

  assert.equal(hasReflectionSignal(signals), true);
  assert.equal(
    interpretationCitesReflection(
      'Você escreveu "às vezes improviso só para não travar" e isso muda o mapa.',
      signals
    ),
    true
  );
  assert.equal(
    interpretationCitesReflection('Você é alguém intenso e complexo.', signals),
    false
  );
});

test('getRegenLens cicla pelas três lentes', () => {
  assert.equal(getRegenLens(0).id, 'contemporaneos');
  assert.equal(getRegenLens(1).id, 'historicos');
  assert.equal(getRegenLens(2).id, 'ficcao');
  assert.equal(getRegenLens(99).id, 'ficcao');
});

test('PROMPT_VERSION está definido', () => {
  assert.equal(typeof PROMPT_VERSION, 'string');
  assert.ok(PROMPT_VERSION.length > 0);
});

// ── truncateWords (guard do vibe_resumo) ─────────────────────────────────────

test('truncateWords preserva frases dentro do limite', () => {
  assert.equal(truncateWords('Decide rápido, mas revisa tudo.', 12), 'Decide rápido, mas revisa tudo.');
});

test('truncateWords corta frases longas com reticências', () => {
  const long = 'um dois três quatro cinco seis sete oito nove dez onze doze treze catorze';
  const result = truncateWords(long, 12);
  assert.ok(result.endsWith('…'));
  assert.ok(result.split(/\s+/).length <= 13);
});

test('parseResponse trunca vibe_resumo estourado', () => {
  const payload = validPayload();
  payload.vibe_resumo = 'uma frase absurdamente longa que nunca deveria aparecer no heading principal do resultado da análise de personalidade';
  const parsed = parseResponse(JSON.stringify(payload), { profile: PROFILE_FIXTURE });
  assert.ok(parsed.vibe_resumo.split(/\s+/).length <= 13);
});

// ── buildResponseStyleBlock ──────────────────────────────────────────────────

test('buildResponseStyleBlock destaca convicção quando extremos dominam', () => {
  const block = buildResponseStyleBlock({
    answer_count: 30, extreme_count: 22, extreme_rate: 0.73,
    neutral_count: 1, neutral_rate: 0.03,
    agree_direct_rate: 0.5, agree_reverse_rate: 0.3,
    acquiescence: false, hesitation: null,
  });
  assert.match(block, /Convicção/);
  assert.match(block, /22 de 30/);
});

test('buildResponseStyleBlock sinaliza aquiescência e hesitação', () => {
  const block = buildResponseStyleBlock({
    answer_count: 30, extreme_count: 5, extreme_rate: 0.17,
    neutral_count: 12, neutral_rate: 0.4,
    agree_direct_rate: 0.8, agree_reverse_rate: 0.75,
    acquiescence: true,
    hesitation: { question_text: 'Eu sou alguém que… confia nas outras pessoas.', seconds: 41.2, median_seconds: 6.5 },
  });
  assert.match(block, /Aquiescência/);
  assert.match(block, /41\.2s/);
  assert.match(block, /confia nas outras pessoas/);
});

test('buildResponseStyleBlock fica vazio para estilo mediano', () => {
  const block = buildResponseStyleBlock({
    answer_count: 30, extreme_count: 8, extreme_rate: 0.27,
    neutral_count: 5, neutral_rate: 0.17,
    agree_direct_rate: 0.5, agree_reverse_rate: 0.3,
    acquiescence: false, hesitation: null,
  });
  assert.equal(block, '');
});
