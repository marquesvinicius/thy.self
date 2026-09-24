#!/usr/bin/env node
/**
 * CRAP (Change Risk Anti-Patterns) por função — Savoia & Evans (2007):
 *
 *   CRAP(f) = comp(f)² × (1 − cov(f))³ + comp(f)
 *
 *   comp(f) = complexidade ciclomática de McCabe (regra `complexity` do ESLint)
 *   cov(f)  = fração das instruções da função executadas pela suíte (c8/V8)
 *
 * Uma função 100% coberta tem CRAP = comp; uma função sem teste tem
 * CRAP = comp² + comp. O índice cresce rápido com complexidade sem teste,
 * que é exatamente o risco que ele quer expor.
 *
 * Pré-requisito: `npm run test:coverage` (gera coverage/coverage-final.json).
 *
 * Uso:
 *   node scripts/quality/crap.mjs [--threshold N] [--top N] [--gate glob,glob]
 *
 * --gate restringe a verificação do limiar (exit 1) aos arquivos do núcleo;
 * o relatório continua listando o projeto inteiro.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { ESLint } from 'eslint';
import { builtinRules } from 'eslint/use-at-your-own-risk';

const ROOT = resolve(import.meta.dirname, '../..');
const COVERAGE_FILE = resolve(ROOT, 'coverage/coverage-final.json');

function parseArgs(argv) {
  const args = { threshold: 30, top: 25, gate: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--threshold') { args.threshold = Number(value); i += 1; }
    else if (flag === '--top') { args.top = Number(value); i += 1; }
    else if (flag === '--gate') { args.gate = value.split(','); i += 1; }
  }
  return args;
}

export function crap(complexity, coverage) {
  return complexity ** 2 * (1 - coverage) ** 3 + complexity;
}

function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '(?:.*/)?')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`);
}

/**
 * Reaproveita a regra oficial `complexity` do ESLint (McCabe) por meio de um
 * "probe": a regra roda com limite 0 e o `report` é interceptado para
 * capturar o nó AST da função — que traz o intervalo completo (a mensagem
 * padrão só aponta a cabeça da função).
 */
async function collectComplexity(patterns) {
  const complexityRule = builtinRules.get('complexity');
  const functions = [];
  const probe = {
    meta: { ...complexityRule.meta, schema: [], defaultOptions: undefined },
    create(context) {
      const proxy = Object.create(context, {
        options: { value: [0] },
        report: {
          value: descriptor => {
            const { node, data } = descriptor;
            functions.push({
              file: context.filename,
              name: String(data.name).replace(/^(async )?(method|function|arrow function|getter|setter) ?/i, '').replace(/'/g, '') || '(anônima)',
              complexity: Number(data.complexity),
              start: { line: node.loc.start.line, column: node.loc.start.column },
              end: { line: node.loc.end.line, column: node.loc.end.column },
            });
          },
        },
      });
      return complexityRule.create(proxy);
    },
  };

  const eslint = new ESLint({
    cwd: ROOT,
    overrideConfigFile: true,
    overrideConfig: {
      languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      plugins: { quality: { rules: { complexity: probe } } },
      rules: { 'quality/complexity': 'error' },
    },
  });
  await eslint.lintFiles(patterns);
  return functions;
}

const spanOf = fn => fn.end.line - fn.start.line;
const coversLine = (fn, line) => fn.start.line <= line && line <= fn.end.line;

/**
 * O c8 (v8-to-istanbul) mapeia uma instrução por linha. Cada linha é
 * atribuída à função MAIS INTERNA que a contém, de modo que uma função
 * externa não herda (nem dilui) a cobertura das funções aninhadas, que têm
 * CRAP próprio. Função sem nenhuma linha própria (ex.: callback de uma linha
 * na mesma linha da chamada) herda a contagem de chamadas do fnMap do V8.
 */
function attributeLines(functions, fileCoverage) {
  const perFunction = new Map(functions.map(fn => [fn, { total: 0, covered: 0 }]));
  if (!fileCoverage) return perFunction;
  for (const [id, loc] of Object.entries(fileCoverage.statementMap)) {
    const owners = functions.filter(fn => coversLine(fn, loc.start.line));
    if (owners.length === 0) continue; // código de topo do módulo
    const innermost = owners.reduce((a, b) => (spanOf(b) < spanOf(a) ? b : a));
    const bucket = perFunction.get(innermost);
    bucket.total += 1;
    if (fileCoverage.s[id] > 0) bucket.covered += 1;
  }
  return perFunction;
}

function coverageOf(fn, bucket, fileCoverage) {
  if (bucket.total > 0) return bucket.covered / bucket.total;
  if (!fileCoverage) return 0;
  const entry = Object.values(fileCoverage.fnMap)
    .map((f, i) => ({ f, hits: Object.values(fileCoverage.f)[i] }))
    .find(({ f }) => f.loc.start.line === fn.start.line);
  return entry && entry.hits > 0 ? 1 : 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(COVERAGE_FILE)) {
    console.error('coverage/coverage-final.json não encontrado. Rode `npm run test:coverage` antes.');
    process.exit(2);
  }
  const coverage = JSON.parse(readFileSync(COVERAGE_FILE, 'utf8'));
  const functions = await collectComplexity(['src/**/*.js', 'eval/metrics.js']);

  const byFile = Map.groupBy(functions, fn => fn.file);
  const rows = functions.map(fn => {
    const buckets = attributeLines(byFile.get(fn.file), coverage[fn.file]);
    const cov = coverageOf(fn, buckets.get(fn), coverage[fn.file]);
    return {
      file: relative(ROOT, fn.file),
      line: fn.start.line,
      name: fn.name,
      complexity: fn.complexity,
      coverage: cov,
      crap: crap(fn.complexity, cov),
    };
  }).sort((a, b) => b.crap - a.crap);

  const gated = args.gate
    ? rows.filter(r => args.gate.some(g => globToRegExp(g).test(r.file)))
    : rows;
  const offenders = gated.filter(r => r.crap > args.threshold);

  console.log(`CRAP por função — ${rows.length} funções, limiar ${args.threshold}${args.gate ? ` (gate: ${args.gate.join(', ')})` : ''}\n`);
  console.log('  CRAP   comp  cov%   função (arquivo:linha)');
  for (const r of rows.slice(0, args.top)) {
    const flag = gated.includes(r) && r.crap > args.threshold ? '✗' : ' ';
    console.log(`${flag} ${r.crap.toFixed(1).padStart(6)} ${String(r.complexity).padStart(5)} ${(r.coverage * 100).toFixed(0).padStart(5)}   ${r.name} (${r.file}:${r.line})`);
  }
  const sum = gated.reduce((acc, r) => acc + r.crap, 0);
  console.log(`\nfunções no gate: ${gated.length} · acima do limiar: ${offenders.length} · CRAP máx: ${gated[0]?.crap.toFixed(1) ?? '-'} · CRAP médio: ${(sum / (gated.length || 1)).toFixed(2)}`);
  if (offenders.length > 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
