import assert from 'node:assert/strict';
import test from 'node:test';

const {
  normalizeToken,
  normalizeStringList,
  mergeUnique,
  mergeReferenceList,
  mergeWorkList,
  buildRegenExclusions,
  estimateRegensSoFar,
  mergeInterpretation,
} = await import('../src/services/interpretation-merge.js');

const ref = (nome, categoria = 'Cientista') => ({ nome, categoria, motivo: `por ${nome}` });
const work = (titulo, tipo = 'filme') => ({ titulo, tipo });

test('normalizeToken ignora acento, caixa e espaços nas pontas', () => {
  assert.equal(normalizeToken('  Érico VERÍSSIMO '), 'erico verissimo');
  assert.equal(normalizeToken(null), '');
  assert.equal(normalizeToken(undefined), '');
});

test('normalizeStringList mantém só strings não vazias, aparadas', () => {
  assert.deepEqual(normalizeStringList([' a ', '', '   ', 3, null, 'b']), ['a', 'b']);
  assert.deepEqual(normalizeStringList('não é lista'), []);
  assert.deepEqual(normalizeStringList(undefined), []);
});

test('mergeUnique preserva a primeira ocorrência e a ordem cronológica', () => {
  assert.deepEqual(mergeUnique([['Ana', 'Bia'], ['ANA', 'Caio', 'bia']]), ['Ana', 'Bia', 'Caio']);
  assert.deepEqual(mergeUnique([null, ['x']]), ['x']);
  assert.deepEqual(mergeUnique([['', '  ', 'y']]), ['y']);
});

test('referências acumulam: antigas primeiro, novas sem duplicar por nome normalizado', () => {
  const merged = mergeReferenceList(
    [ref('Hannah Arendt'), ref('Feynman')],
    [ref('hannah arendt', 'Filósofa'), ref('Frieren'), null, 'lixo', { categoria: 'sem nome' }],
  );
  assert.deepEqual(merged.map(r => r.nome), ['Hannah Arendt', 'Feynman', 'Frieren']);
  // Em conflito, vale a versão antiga (a que o usuário já viu).
  assert.equal(merged[0].categoria, 'Cientista');
});

test('obras acumulam deduplicando por título', () => {
  const merged = mergeWorkList([work('Dark', 'serie')], [work('DARK', 'filme'), work('A Chegada')]);
  assert.deepEqual(merged, [work('Dark', 'serie'), work('A Chegada')]);
  assert.deepEqual(mergeWorkList(undefined, undefined), []);
});

test('exclusões somam o que o cliente exibiu com o que está persistido', () => {
  const persisted = {
    referencias: [ref('Feynman', 'Cientista'), ref('Arendt', 'Filósofa'), null],
    obras_culturais: [work('Dark')],
  };
  const request = {
    exclude_reference_names: ['feynman', 'Shikamaru', 42],
    exclude_work_titles: ['Frieren'],
  };

  assert.deepEqual(buildRegenExclusions(persisted, request), {
    excludedReferenceNames: ['feynman', 'Shikamaru', 'Arendt'],
    excludedWorkTitles: ['Frieren', 'Dark'],
    excludedCategories: ['Cientista', 'Filósofa'],
  });
});

test('exclusões sem nada persistido nem enviado ficam vazias', () => {
  assert.deepEqual(buildRegenExclusions(), {
    excludedReferenceNames: [], excludedWorkTitles: [], excludedCategories: [],
  });
});

test('lente de regeneração nunca regride após restart do servidor', () => {
  // contador em memória zerado, mas 9 referências persistidas = 3 gerações → 2 regens
  assert.equal(estimateRegensSoFar(0, 9), 2);
  assert.equal(estimateRegensSoFar(0, 7), 2);   // ceil(7/3) − 1
  assert.equal(estimateRegensSoFar(0, 3), 0);   // só a geração original
  assert.equal(estimateRegensSoFar(0, 0), 0);   // nunca negativo
  assert.equal(estimateRegensSoFar(2, 3), 2);   // contador vivo vence
});

test('regeneração preserva texto, vibe e versão; acumula referências e obras', () => {
  const persisted = {
    interpretacao: 'texto original', vibe_resumo: 'vibe original', prompt_version: '2.1.0',
    referencias: [ref('Arendt')], obras_culturais: [work('Dark')], schema_version: '1.2.0',
  };
  const generated = {
    interpretacao: 'texto novo', vibe_resumo: 'vibe nova', prompt_version: '2.2.0',
    referencias: [ref('Feynman')], obras_culturais: [work('Frieren')], schema_version: '1.3.0',
  };

  assert.deepEqual(mergeInterpretation(persisted, generated), {
    interpretacao: 'texto original',
    vibe_resumo: 'vibe original',
    prompt_version: '2.1.0',
    referencias: [ref('Arendt'), ref('Feynman')],
    obras_culturais: [work('Dark'), work('Frieren')],
    schema_version: '1.3.0', // campos não protegidos vêm da geração nova
  });
});

test('sem interpretação persistida, a geração nova é usada por inteiro', () => {
  const generated = {
    interpretacao: 'novo', vibe_resumo: 'v', prompt_version: '2.2.0',
    referencias: [ref('A')], obras_culturais: [work('B')],
  };
  assert.deepEqual(mergeInterpretation({}, generated), generated);
  assert.deepEqual(mergeInterpretation(undefined, generated), generated);
});
