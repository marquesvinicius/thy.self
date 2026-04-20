import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const OBJECTIVE_CATEGORY = {
  slug: 'objective_bfi2s',
  name: 'BFI-2-S (objetivo)',
  description: 'Itens do BFI-2-S (Soto & John, 2017). Alimentam o cálculo determinístico OCEAN.',
};

const INTERPRETATIVE_CATEGORIES = [
  {
    slug: 'moral_dilemma',
    name: 'Dilema Moral',
    description: 'Situações éticas que revelam traços de personalidade',
  },
  {
    slug: 'paradoxical',
    name: 'Paradoxal / Provocativa',
    description: 'Perguntas que desafiam o pensamento convencional',
  },
  {
    slug: 'interest',
    name: 'Definidora de Interesses',
    description: 'Perguntas sobre preferências para melhor alocação de resultado',
  },
];

function impactColumnFor(trait) {
  return `impact_${trait.toLowerCase()}`;
}

async function upsertCategories() {
  const allCategories = [OBJECTIVE_CATEGORY, ...INTERPRETATIVE_CATEGORIES];

  const { data, error } = await supabase
    .from('question_categories')
    .upsert(allCategories, { onConflict: 'slug' })
    .select();

  if (error) throw error;

  const map = {};
  for (const cat of data) map[cat.slug] = cat.id;
  return map;
}

async function seedObjective(categoryId) {
  const raw = await readFile(join(__dirname, 'objective_bfi2s.json'), 'utf-8');
  const data = JSON.parse(raw);
  const { items, likert_scale: likertScale, stem } = data;

  let inserted = 0;
  let altInserted = 0;

  for (const item of items) {
    const questionText = `${stem} ${item.statement}`;

    const { data: question, error: qErr } = await supabase
      .from('questions')
      .upsert(
        {
          category_id: categoryId,
          text: questionText,
          context: null,
          type: 'multiple_choice',
          kind: 'objective',
          trait: item.trait,
          reverse_key: !!item.reverse_key,
          external_id: item.bfi2s_id,
        },
        { onConflict: 'external_id' }
      )
      .select()
      .single();

    if (qErr) {
      console.error(`  Error upserting BFI-2-S item ${item.bfi2s_id}:`, qErr);
      continue;
    }

    inserted++;

    // Clear any pre-existing alternatives for this question (idempotent reseed)
    await supabase.from('alternatives').delete().eq('question_id', question.id);

    const impactCol = impactColumnFor(item.trait);
    const alts = likertScale.map(step => ({
      question_id: question.id,
      text: step.text,
      sort_order: step.sort_order,
      impact_o: 0, impact_c: 0, impact_e: 0, impact_a: 0, impact_n: 0,
      [impactCol]: step.value,
    }));

    const { data: insertedAlts, error: aErr } = await supabase
      .from('alternatives')
      .insert(alts)
      .select();

    if (aErr) {
      console.error(`  Error inserting Likert alternatives for ${item.bfi2s_id}:`, aErr);
      continue;
    }

    altInserted += insertedAlts.length;
  }

  return { inserted, altInserted };
}

async function seedInterpretative(categoryMap) {
  const raw = await readFile(join(__dirname, 'interpretative.json'), 'utf-8');
  const data = JSON.parse(raw);

  let inserted = 0;
  let altInserted = 0;

  for (const q of data.items) {
    const categoryId = categoryMap[q.category];
    if (!categoryId) {
      console.error(`  Unknown interpretative category: ${q.category}`);
      continue;
    }

    const { data: question, error: qErr } = await supabase
      .from('questions')
      .insert({
        category_id: categoryId,
        text: q.text,
        context: q.context ?? null,
        type: q.type || 'multiple_choice',
        kind: 'interpretative',
        trait: null,
        reverse_key: false,
      })
      .select()
      .single();

    if (qErr) {
      console.error(`  Error inserting interpretative question: ${q.text.slice(0, 60)}…`, qErr);
      continue;
    }

    inserted++;

    if (Array.isArray(q.alternatives) && q.alternatives.length > 0) {
      const alts = q.alternatives.map(a => ({
        question_id: question.id,
        text: a.text,
        sort_order: a.sort_order,
        impact_o: 0, impact_c: 0, impact_e: 0, impact_a: 0, impact_n: 0,
      }));

      const { data: insertedAlts, error: aErr } = await supabase
        .from('alternatives')
        .insert(alts)
        .select();

      if (aErr) {
        console.error(`  Error inserting alternatives for interpretative q#${question.id}:`, aErr);
        continue;
      }

      altInserted += insertedAlts.length;
    }
  }

  return { inserted, altInserted };
}

async function seed() {
  console.log('Starting Dual-Core seed…\n');

  console.log('1) Upserting categories…');
  const categoryMap = await upsertCategories();
  console.log(`   ${Object.keys(categoryMap).length} categories ready.\n`);

  console.log('2) Seeding objective layer (BFI-2-S)…');
  const objective = await seedObjective(categoryMap[OBJECTIVE_CATEGORY.slug]);
  console.log(`   ${objective.inserted} objective items, ${objective.altInserted} Likert alternatives.\n`);

  console.log('3) Seeding interpretative layer…');
  const interpretative = await seedInterpretative(categoryMap);
  console.log(`   ${interpretative.inserted} interpretative items, ${interpretative.altInserted} alternatives.\n`);

  console.log('Seed completed successfully.');
  console.log(`Totals: questions=${objective.inserted + interpretative.inserted}, alternatives=${objective.altInserted + interpretative.altInserted}`);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
