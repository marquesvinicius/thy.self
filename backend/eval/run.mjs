/**
 * Harness de avaliação do prompt interpretativo.
 *
 * Roda N gerações contra perfis FIXOS e mede aderência aos contratos do
 * prompt (2ª pessoa, citação de reflexão, ancoragem numérica, repetição de
 * léxico, clichês, diversidade entre execuções).
 *
 * Uso:
 *   node eval/run.mjs                      # 2 execuções por perfil
 *   node eval/run.mjs --runs 4             # 4 execuções por perfil
 *   node eval/run.mjs --runs 4 --ab        # compara com/sem exemplos de léxico
 *   node eval/run.mjs --out eval/out.json  # salva o bruto
 *
 * Custo: cada execução é UMA chamada ao Gemini (mais uma eventual repetição
 * quando a reflexão não é citada). O modo --ab dobra o total.
 */

import 'dotenv/config';
import { writeFile } from 'fs/promises';
import { PROFILES } from './fixtures.js';
import { evaluateInterpretation } from './metrics.js';

function parseArgs(argv) {
  const args = { runs: 2, ab: false, out: null, profile: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--runs') args.runs = Math.max(1, parseInt(argv[++i], 10) || 1);
    else if (argv[i] === '--ab') args.ab = true;
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--profile') args.profile = argv[++i];
  }
  return args;
}

/**
 * Import com cache-buster: variantes que dependam de env lida no topo do
 * módulo precisam de uma avaliação fresca. Hoje não há variante ativa
 * (o experimento de exemplos de léxico foi concluído e removido), mas o
 * mecanismo fica para o próximo A/B.
 */
async function loadService(variantKey = 'default') {
  const url = new URL('../src/services/llm.service.js', import.meta.url);
  url.searchParams.set('variant', variantKey);
  return import(url.href);
}

async function runVariant({ label, variantKey, runs, profiles }) {
  const service = await loadService(variantKey);
  const rows = [];

  for (const fixture of profiles) {
    for (let run = 1; run <= runs; run += 1) {
      process.stdout.write(`  ${label} · ${fixture.id} · execução ${run}/${runs} … `);
      const startedAt = Date.now();

      const interpretation = await service.generateInterpretation(
        fixture.profile,
        fixture.consistency,
        fixture.interpretativeSignals,
        fixture.archetype,
        {
          antiArchetype: fixture.antiArchetype,
          responseStyle: fixture.responseStyle,
        },
      );

      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

      if (!interpretation) {
        console.log(`FALHOU (${elapsed}s)`);
        rows.push({ variant: label, profile: fixture.id, run, failed: true });
        continue;
      }

      const citesReflection = service.interpretationCitesReflection(
        interpretation.interpretacao,
        fixture.interpretativeSignals,
      );

      const metrics = evaluateInterpretation(interpretation, {
        citesReflection,
        signals: fixture.interpretativeSignals,
      });
      rows.push({ variant: label, profile: fixture.id, run, failed: false, ...metrics });
      console.log(`ok (${elapsed}s)`);
    }
  }

  return rows;
}

// ── Agregação ──────────────────────────────────────────────────────────────

const rate = (rows, key) => {
  const valid = rows.filter(r => !r.failed && r[key] !== null && r[key] !== undefined);
  if (valid.length === 0) return null;
  return valid.filter(r => r[key] === true).length / valid.length;
};

const mean = (rows, key) => {
  const values = rows.filter(r => !r.failed).map(r => r[key]).filter(v => typeof v === 'number');
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
};

const sum = (rows, key) =>
  rows.filter(r => !r.failed).reduce((acc, r) => acc + (Number(r[key]) || 0), 0);

function pct(value) {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function num(value, digits = 3) {
  return value === null ? '—' : value.toFixed(digits);
}

/** Repetição de referências ENTRE execuções do mesmo perfil. */
function repetitionIndex(rows) {
  const byProfile = new Map();
  for (const row of rows) {
    if (row.failed) continue;
    const list = byProfile.get(row.profile) || [];
    list.push(row.reference_names || []);
    byProfile.set(row.profile, list);
  }

  const scores = [];
  for (const runsForProfile of byProfile.values()) {
    if (runsForProfile.length < 2) continue;
    const all = runsForProfile.flat().map(n => n.toLowerCase());
    const unique = new Set(all).size;
    // 0 = todas as referências inéditas; 1 = sempre as mesmas.
    scores.push(all.length === 0 ? 0 : 1 - unique / all.length);
  }

  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function summarize(label, rows) {
  const ok = rows.filter(r => !r.failed);
  return {
    label,
    generations: rows.length,
    failures: rows.length - ok.length,
    second_person: rate(ok, 'second_person'),
    cites_reflection: rate(ok, 'cites_reflection'),
    score_evidence: rate(ok, 'score_evidence'),
    has_quote: rate(ok, 'has_quote'),
    banned_construction: rate(ok, 'banned_construction'),
    ends_on_evidence: rate(ok, 'ends_on_evidence'),
    vibe_within_limit: rate(ok, 'vibe_within_limit'),
    vibe_copies_example: rate(ok, 'vibe_copies_example'),
    vibe_banned_total: sum(ok, 'vibe_banned'),
    distinct_categories: rate(ok, 'distinct_categories'),
    works_ok: rate(ok, 'works_ok'),
    motivo_overlap_mean: mean(ok, 'motivo_overlap_mean'),
    motivo_overlap_max: mean(ok, 'motivo_overlap_max'),
    grounded_ancora_rate: mean(ok, 'grounded_ancora_rate'),
    reference_count_mean: mean(ok, 'reference_count'),
    cliche_refs_total: sum(ok, 'cliche_refs'),
    fallback_refs_total: sum(ok, 'fallback_refs'),
    repetition_index: repetitionIndex(ok),
  };
}

function printSummary(summaries) {
  const metrics = [
    ['2ª pessoa (sem laudo)', 'second_person', pct, 'maior'],
    ['cita a reflexão', 'cites_reflection', pct, 'maior'],
    ['cita escore (%)', 'score_evidence', pct, 'maior'],
    ['tem citação entre aspas', 'has_quote', pct, 'maior'],
    ['termina em evidência', 'ends_on_evidence', pct, 'maior'],
    ['construção proibida "não é X, é Y"', 'banned_construction', pct, 'menor'],
    ['vibe ≤ 10 palavras', 'vibe_within_limit', pct, 'maior'],
    ['vibe copia o exemplo', 'vibe_copies_example', pct, 'menor'],
    ['categorias distintas', 'distinct_categories', pct, 'maior'],
    ['obras 1/1/1 corretas', 'works_ok', pct, 'maior'],
    ['ÂNCORA aponta p/ resposta real', 'grounded_ancora_rate', pct, 'maior'],
    ['referências por geração (média)', 'reference_count_mean', v => num(v, 2), 'maior'],
    ['SOBREPOSIÇÃO LÉXICA (média)', 'motivo_overlap_mean', v => num(v), 'menor'],
    ['sobreposição léxica (pior par)', 'motivo_overlap_max', v => num(v), 'menor'],
    ['repetição entre execuções', 'repetition_index', v => num(v), 'menor'],
    ['refs clichê (total)', 'cliche_refs_total', v => String(v), 'menor'],
    ['refs por fallback (total)', 'fallback_refs_total', v => String(v), 'menor'],
    ['palavras banidas no vibe (total)', 'vibe_banned_total', v => String(v), 'menor'],
    ['falhas de geração', 'failures', v => String(v), 'menor'],
  ];

  const width = 38;
  const header = ['MÉTRICA'.padEnd(width), ...summaries.map(s => s.label.padStart(12))].join(' │ ');
  console.log('\n' + header);
  console.log('─'.repeat(header.length));

  for (const [name, key, fmt, direction] of metrics) {
    const cells = summaries.map(s => String(fmt(s[key])).padStart(12));
    const arrow = direction === 'maior' ? '↑' : '↓';
    console.log([`${name} ${arrow}`.padEnd(width), ...cells].join(' │ '));
  }
}

// ── Execução ───────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profiles = args.profile
    ? PROFILES.filter(p => p.id === args.profile)
    : PROFILES;

  if (profiles.length === 0) {
    console.error(`Perfil desconhecido: ${args.profile}`);
    process.exit(1);
  }

  // Para um novo A/B: adicione aqui as variantes e o gatilho correspondente
  // no llm.service.js (ver eval/README.md).
  const variants = args.ab
    ? [
        { label: 'controle', variantKey: 'control' },
        { label: 'variante', variantKey: 'experiment' },
      ]
    : [{ label: 'atual', variantKey: 'default' }];

  const totalCalls = variants.length * profiles.length * args.runs;
  console.log(`\nHarness de avaliação do prompt`);
  console.log(`Perfis: ${profiles.map(p => p.id).join(', ')}`);
  console.log(`Execuções por perfil: ${args.runs} · variantes: ${variants.length}`);
  console.log(`Chamadas mínimas ao LLM: ${totalCalls}\n`);

  const allRows = [];
  const summaries = [];

  for (const variant of variants) {
    const rows = await runVariant({ ...variant, runs: args.runs, profiles });
    allRows.push(...rows);
    summaries.push(summarize(variant.label, rows));
  }

  printSummary(summaries);

  // Amostras: um vibe_resumo por perfil/variante + uma interpretação inteira.
  console.log('\n\n── AMOSTRAS ─────────────────────────────────────────────────\n');
  for (const variant of variants) {
    console.log(`\n[${variant.label}]`);
    for (const fixture of profiles) {
      const rows = allRows.filter(
        r => r.variant === variant.label && r.profile === fixture.id && !r.failed
      );
      console.log(`\n  ${fixture.id}:`);
      for (const row of rows) {
        console.log(`    vibe: "${row.vibe_text}" (${row.vibe_words}p, overlap ${num(row.motivo_overlap_mean)})`);
        console.log(`    refs: ${(row.reference_names || []).join(' · ')}`);
      }
    }
  }

  const firstOk = allRows.find(r => !r.failed);
  if (firstOk) {
    console.log('\n\n── INTERPRETAÇÃO COMPLETA (amostra) ─────────────────────────\n');
    console.log(`[${firstOk.variant} · ${firstOk.profile}]\n`);
    console.log(firstOk.interpretacao);
  }

  if (args.out) {
    await writeFile(args.out, JSON.stringify({ summaries, rows: allRows }, null, 2), 'utf-8');
    console.log(`\n\nBruto salvo em ${args.out}`);
  }
}

main().catch(err => {
  console.error('Harness falhou:', err);
  process.exit(1);
});
