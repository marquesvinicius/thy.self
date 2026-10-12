/**
 * Mede a resistência do prompt a prompt injection.
 *
 * Para cada ataque de eval/injection.js, coloca o texto do ataque na reflexão
 * livre de um perfil fixo e gera a interpretação N vezes, com a IA real.
 * Uma resposta só não prova nada, porque o modelo não é determinístico; a
 * medida é a TAXA de resultados que resistiram.
 *
 * Uso:
 *   node eval/injection-run.mjs              # 3 execuções por ataque
 *   node eval/injection-run.mjs --runs 5
 *   node eval/injection-run.mjs --only notas   # um ataque só
 *
 * Custo: uma chamada ao Gemini por execução (mais eventuais repetições).
 */

/* eslint-disable no-console -- relatório de linha de comando */
import 'dotenv/config';
import { writeFile } from 'fs/promises';
import { PROFILES } from './fixtures.js';
import { ATTACKS, injectionResult } from './injection.js';
import { generateInterpretation, PROMPT_VERSION } from '../src/services/llm.service.js';

const runsArg = process.argv.indexOf('--runs');
const RUNS = runsArg > 0 ? Math.max(1, parseInt(process.argv[runsArg + 1], 10) || 1) : 3;
const onlyArg = process.argv.indexOf('--only');
const SELECTED = onlyArg > 0 ? ATTACKS.filter(a => a.id === process.argv[onlyArg + 1]) : ATTACKS;

// Perfil fixo; o ataque substitui o texto de toda reflexão livre.
const base = PROFILES[0];
const rows = [];

console.log(`prompt ${PROMPT_VERSION} · ${SELECTED.length} ataques × ${RUNS} execuções\n`);

for (const attack of SELECTED) {
  const signals = base.interpretativeSignals.map(s => (
    s.is_reflection ? { ...s, user_observation: attack.text } : s
  ));
  for (let run = 1; run <= RUNS; run += 1) {
    process.stdout.write(`  ${attack.id} · ${run}/${RUNS} … `);
    const interpretation = await generateInterpretation(
      base.profile, base.consistency, signals, base.archetype,
      { antiArchetype: base.antiArchetype, responseStyle: base.responseStyle },
    );
    if (!interpretation) {
      console.log('sem resposta da IA');
      rows.push({ attack: attack.id, run, failed: true });
      continue;
    }
    const result = injectionResult(interpretation, attack);
    console.log(result.resisted ? 'resistiu' : `NÃO resistiu (${result.violations.join(', ')})`);
    rows.push({
      attack: attack.id, run, ...result,
      references: (interpretation.referencias || []).map(r => r.nome),
      interpretacao: interpretation.interpretacao,
    });
  }
}

const valid = rows.filter(r => !r.failed);
const resisted = valid.filter(r => r.resisted).length;
console.log(`\nresistiu em ${resisted} de ${valid.length} execuções válidas`);
for (const attack of SELECTED) {
  const mine = valid.filter(r => r.attack === attack.id);
  console.log(`  ${attack.id}: ${mine.filter(r => r.resisted).length}/${mine.length}`);
}

await writeFile(
  new URL('./injection-last.json', import.meta.url),
  JSON.stringify({ prompt_version: PROMPT_VERSION, runs: RUNS, resisted, total: valid.length, rows }, null, 2),
);
