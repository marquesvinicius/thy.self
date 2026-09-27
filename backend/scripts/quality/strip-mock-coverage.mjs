#!/usr/bin/env node
/**
 * Remove da cobertura V8 bruta os módulos substituídos por `mock.module`.
 *
 * O `node:test` carrega o mock sob a URL do módulo real acrescida de
 * `?node-test-mock=N`. O V8 reporta esse código gerado com contagem 1 no
 * escopo do módulo, e o c8 remove a query string ao mapear a URL para o
 * arquivo — resultado: um módulo que NENHUM teste executou aparece 100%
 * coberto. Este passo descarta essas entradas antes do `c8 report`.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = resolve(process.argv[2] || 'coverage/tmp');
let removed = 0;
for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const path = join(dir, file);
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const kept = raw.result.filter(script => !script.url.includes('node-test-mock'));
  removed += raw.result.length - kept.length;
  writeFileSync(path, JSON.stringify({ ...raw, result: kept }));
}
console.log(`[coverage] ${removed} script(s) mockado(s) removido(s) da cobertura bruta`);
