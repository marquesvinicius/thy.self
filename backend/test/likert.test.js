import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const { readObjectiveLikert } = await import('../src/engine/likert.js');

function answer({ kind = 'objective', trait = 'E', reverse = false, alternatives } = {}) {
  return {
    questions: { kind, trait, reverse_key: reverse },
    alternatives: alternatives ?? { [`impact_${String(trait).toLowerCase()}`]: 2 },
  };
}

test('lê o Likert do item objetivo na coluna do seu traço', () => {
  assert.deepEqual(readObjectiveLikert(answer({ trait: 'N', alternatives: { impact_n: -1, impact_e: 2 } })), {
    trait: 'N', value: -1, signed: -1, reverse: false,
  });
});

test('reverse_key inverte só o valor assinado; o valor bruto fica como respondido', () => {
  assert.deepEqual(readObjectiveLikert(answer({ reverse: true })), {
    trait: 'E', value: 2, signed: -2, reverse: true,
  });
});

test('item reverso neutro produz +0, não −0', () => {
  const { signed } = readObjectiveLikert(answer({ reverse: true, alternatives: { impact_e: 0 } }));
  assert.ok(Object.is(signed, 0));
});

test('Dual-Core: item interpretativo nunca é lido, mesmo com traço e impacto preenchidos', () => {
  // Invariante central. A fixture tem traço válido de propósito: se a
  // leitura dependesse só do traço, o item seria pontuado.
  assert.equal(readObjectiveLikert(answer({ kind: 'interpretative', trait: 'O' })), null);
});

test('traço ausente ou fora de OCEAN descarta a resposta', () => {
  assert.equal(readObjectiveLikert(answer({ trait: null, alternatives: { impact_o: 2 } })), null);
  assert.equal(readObjectiveLikert(answer({ trait: 'X', alternatives: { impact_x: 2 } })), null);
  assert.equal(readObjectiveLikert(answer({ trait: 'o', alternatives: { impact_o: 2 } })), null);
});

test('valor não numérico descarta; coluna ausente ou sem alternativa conta como neutro', () => {
  assert.equal(readObjectiveLikert(answer({ alternatives: { impact_e: 'abc' } })), null);
  assert.equal(readObjectiveLikert(answer({ alternatives: {} })).value, 0);
  assert.equal(readObjectiveLikert({ questions: { kind: 'objective', trait: 'E' }, alternatives: null }).value, 0);
});

test('resposta malformada (null, sem pergunta) não lança', () => {
  assert.equal(readObjectiveLikert(null), null);
  assert.equal(readObjectiveLikert({}), null);
  assert.equal(readObjectiveLikert({ questions: null }), null);
});
