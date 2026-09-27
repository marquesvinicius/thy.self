import assert from 'node:assert/strict';
import test from 'node:test';

import { isUuid } from '../src/utils/uuid.js';

// isUuid barra identificador malformado antes da consulta ao banco: sem
// isso, o Postgres recusa o texto (erro 22P02) e a API responderia 500.

const VALID = '5b686f0d-e80f-42bf-9ca3-b7cb181004c1';

test('isUuid aceita UUID v4, em maiúsculas ou minúsculas', () => {
  assert.equal(isUuid(VALID), true);
  assert.equal(isUuid(VALID.toUpperCase()), true);
});

test('isUuid tolera espaços nas pontas (ex.: valor copiado de um log)', () => {
  assert.equal(isUuid(`  ${VALID}\n`), true);
});

test('isUuid recusa lixo antes ou depois de um UUID válido', () => {
  // O padrão é ancorado: um UUID "dentro" de outro texto não passa.
  assert.equal(isUuid(`x${VALID}`), false);
  assert.equal(isUuid(`${VALID}x`), false);
  assert.equal(isUuid(`${VALID}; drop table sessions`), false);
});

test('isUuid recusa formato que não é v4', () => {
  assert.equal(isUuid('5b686f0d-e80f-12bf-9ca3-b7cb181004c1'), false, 'versão 1 no lugar de 4');
  assert.equal(isUuid('5b686f0d-e80f-42bf-7ca3-b7cb181004c1'), false, 'variante inválida');
  assert.equal(isUuid('5b686f0de80f42bf9ca3b7cb181004c1'), false, 'sem hífens');
  assert.equal(isUuid('nao-e-um-uuid'), false);
  assert.equal(isUuid(''), false);
});

test('isUuid recusa valor que não é texto, sem lançar exceção', () => {
  for (const value of [undefined, null, 42, {}, [VALID]]) {
    assert.equal(isUuid(value), false, String(value));
  }
});
