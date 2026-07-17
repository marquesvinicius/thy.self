import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const {
  parseStructuredJson,
  parseResponse,
  normalizeReferences,
  normalizeWorks,
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

test('normalizeReferences lança quando nada sobra após filtros', () => {
  assert.throws(() => normalizeReferences([], {
    profile: PROFILE_FIXTURE,
    // Exclui todos os fallbacks conhecidos para forçar lista vazia
    excludedReferenceNames: [
      'Christopher Nolan', 'Quentin Tarantino', 'Vince Gilligan',
      'Cillian Murphy', 'Walter White', 'Daenerys Targaryen',
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
