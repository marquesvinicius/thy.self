import assert from 'node:assert/strict';
import test from 'node:test';

const {
  contentWords,
  jaccard,
  motivoOverlap,
  secondPerson,
  hasScoreEvidence,
  hasQuote,
  bannedConstruction,
  vibeAudit,
  distinctCategories,
  clicheCount,
  fallbackCount,
  worksShape,
  ancoraIsGrounded,
  groundedAncoraRate,
} = await import('../eval/metrics.js');

const SIGNALS_FIXTURE = [
  {
    question_text: 'Você é gerente e precisa demitir um funcionário competente.',
    alternative_text: 'Adio a decisão o máximo possível — não consigo lidar com isso.',
    user_observation: null,
  },
  {
    question_text: 'Conte uma vez em que escolheu o caminho mais fácil.',
    alternative_text: null,
    user_observation: 'deixei um amigo levar a culpa por um atraso que foi meu',
  },
];

test('contentWords remove stopwords, acentos e palavras curtas', () => {
  assert.deepEqual(
    contentWords('A sua visão de intensidade e ambição'),
    ['visao', 'intensidade', 'ambicao']
  );
});

test('jaccard mede sobreposição entre conjuntos', () => {
  assert.equal(jaccard(new Set(['a', 'b']), new Set(['a', 'b'])), 1);
  assert.equal(jaccard(new Set(['a']), new Set(['b'])), 0);
  assert.equal(jaccard(new Set(['a', 'b']), new Set(['b', 'c'])), 1 / 3);
});

test('motivoOverlap: motivos idênticos → 1; distintos → 0', () => {
  const iguais = [
    { motivo: 'Reflete intensidade e ambição criativa.' },
    { motivo: 'Reflete intensidade e ambição criativa.' },
    { motivo: 'Reflete intensidade e ambição criativa.' },
  ];
  assert.equal(motivoOverlap(iguais).mean, 1);

  const distintos = [
    { motivo: 'Curiosidade lúdica diante de enigmas.' },
    { motivo: 'Disciplina silenciosa construída sozinha.' },
    { motivo: 'Fúria organizada contra injustiça.' },
  ];
  assert.equal(motivoOverlap(distintos).mean, 0);
});

test('motivoOverlap conta os pares corretamente', () => {
  const result = motivoOverlap([
    { motivo: 'alpha bravo charlie' },
    { motivo: 'alpha delta echo' },
    { motivo: 'foxtrot golf hotel' },
  ]);
  assert.equal(result.pairs, 3);
  assert.ok(result.max > 0);
});

test('secondPerson aprova "você" e reprova jargão de laudo', () => {
  assert.equal(secondPerson('Você evita o meio-termo.').ok, true);
  const laudo = secondPerson('O usuário demonstra abertura alta.');
  assert.equal(laudo.ok, false);
  assert.ok(laudo.thirdPersonMarkers.length > 0);
  // "você" presente mas com marcador de laudo junto → reprova
  assert.equal(secondPerson('Você é assim; o perfil exibe abertura.').ok, false);
});

test('hasScoreEvidence detecta escore citado', () => {
  assert.equal(hasScoreEvidence('com abertura em 72% isso aparece'), true);
  assert.equal(hasScoreEvidence('com abertura alta isso aparece'), false);
});

test('hasQuote detecta citação entre aspas', () => {
  assert.equal(hasQuote('você escreveu "deixei um amigo levar a culpa"'), true);
  assert.equal(hasQuote('você escreveu algo revelador'), false);
});

test('bannedConstruction pega o padrão "não é X, é Y"', () => {
  assert.equal(bannedConstruction('A tensão não é fraqueza; é o ponto de virada.'), true);
  assert.equal(bannedConstruction('Não é fraqueza, é força.'), true);
  assert.equal(bannedConstruction('Você respondeu que não é fácil decidir.'), false);
});

test('vibeAudit conta palavras, palavras banidas e cópia do exemplo', () => {
  const bom = vibeAudit('Decide sob pressão, mas prefere o status quo.');
  assert.equal(bom.wordCount, 8);
  assert.equal(bom.withinLimit, true);
  assert.deepEqual(bom.bannedWords, []);
  assert.equal(bom.copiesExample, false);

  const ruim = vibeAudit('Conflito interno de impulsos e autoconsciência, buscando equilíbrio.');
  assert.ok(ruim.bannedWords.includes('autoconsciência'));
  assert.ok(ruim.bannedWords.includes('equilíbrio'));

  const copia = vibeAudit('Decide rápido, mas revisa tudo antes de entregar.');
  assert.equal(copia.copiesExample, true);
});

test('vibeAudit reprova frase acima de 10 palavras', () => {
  const longa = vibeAudit('uma frase absurdamente longa que passa do limite de dez palavras aqui');
  assert.equal(longa.withinLimit, false);
});

test('distinctCategories exige categorias diferentes', () => {
  assert.equal(distinctCategories([
    { categoria: 'Cientista' }, { categoria: 'Escritora' }, { categoria: 'Personagem' },
  ]), true);
  assert.equal(distinctCategories([
    { categoria: 'Ator' }, { categoria: 'ator' }, { categoria: 'Personagem' },
  ]), false);
});

test('clicheCount conta nomes da lista de clichês', () => {
  assert.equal(clicheCount([
    { nome: 'Albert Einstein' }, { nome: 'Lise Meitner' }, { nome: 'Immanuel Kant' },
  ]), 2);
});

test('fallbackCount identifica motivos gerados por fallback', () => {
  assert.equal(fallbackCount([
    { motivo: 'Aproximação direta por seus traços de Abertura.' },
    { motivo: 'Curiosidade lúdica diante de enigmas.' },
  ]), 1);
});

test('ancoraIsGrounded aceita âncora que cita resposta real', () => {
  assert.equal(
    ancoraIsGrounded('deixei um amigo levar a culpa por um atraso', SIGNALS_FIXTURE),
    true
  );
  assert.equal(
    ancoraIsGrounded('Adio a decisão o máximo possível', SIGNALS_FIXTURE),
    true
  );
});

test('ancoraIsGrounded aceita âncora que cita traço + escore', () => {
  assert.equal(ancoraIsGrounded('Conscienciosidade em 29.2%', SIGNALS_FIXTURE), true);
  // traço sem número não basta — é genérico
  assert.equal(ancoraIsGrounded('conscienciosidade baixa', SIGNALS_FIXTURE), false);
});

test('ancoraIsGrounded rejeita âncora inventada', () => {
  assert.equal(
    ancoraIsGrounded('sua paixão declarada por escalada no gelo', SIGNALS_FIXTURE),
    false
  );
  assert.equal(ancoraIsGrounded('', SIGNALS_FIXTURE), false);
});

test('groundedAncoraRate calcula a fração ancorada', () => {
  const refs = [
    { ancora: 'deixei um amigo levar a culpa por um atraso' },
    { ancora: 'sua paixão por escalada no gelo' },
  ];
  assert.equal(groundedAncoraRate(refs, SIGNALS_FIXTURE), 0.5);
  // sem âncora nenhuma → null (métrica não se aplica)
  assert.equal(groundedAncoraRate([{ nome: 'x' }], SIGNALS_FIXTURE), null);
});

test('worksShape valida 1 série + 1 filme + 1 anime', () => {
  assert.equal(worksShape([
    { tipo: 'serie' }, { tipo: 'filme' }, { tipo: 'anime' },
  ]).ok, true);
  assert.equal(worksShape([
    { tipo: 'serie' }, { tipo: 'serie' }, { tipo: 'anime' },
  ]).ok, false);
});
