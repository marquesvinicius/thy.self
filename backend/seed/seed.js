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

async function seed() {
  console.log('Starting seed...\n');

  const raw = await readFile(join(__dirname, 'questions.json'), 'utf-8');
  const data = JSON.parse(raw);

  // 1. Insert categories
  console.log('Inserting categories...');
  const { data: categories, error: catError } = await supabase
    .from('question_categories')
    .upsert(data.categories, { onConflict: 'slug' })
    .select();

  if (catError) {
    console.error('Error inserting categories:', catError);
    process.exit(1);
  }

  const categoryMap = {};
  for (const cat of categories) {
    categoryMap[cat.slug] = cat.id;
  }
  console.log(`  ${categories.length} categories inserted.\n`);

  // 2. Insert questions and alternatives
  let questionCount = 0;
  let altCount = 0;

  for (const q of data.questions) {
    const categoryId = categoryMap[q.category];
    if (!categoryId) {
      console.error(`  Unknown category: ${q.category}`);
      continue;
    }

    // Insert question
    const { data: question, error: qError } = await supabase
      .from('questions')
      .insert({
        category_id: categoryId,
        text: q.text,
        context: q.context,
        type: q.type || 'multiple_choice'
      })
      .select()
      .single();

    if (qError) {
      console.error(`  Error inserting question: ${q.text.slice(0, 50)}...`, qError);
      continue;
    }

    questionCount++;

    // Insert alternatives
    const alts = q.alternatives.map(a => ({
      question_id: question.id,
      text: a.text,
      sort_order: a.sort_order,
      impact_o: a.impact_o,
      impact_c: a.impact_c,
      impact_e: a.impact_e,
      impact_a: a.impact_a,
      impact_n: a.impact_n,
    }));

    const { data: insertedAlts, error: aError } = await supabase
      .from('alternatives')
      .insert(alts)
      .select();

    if (aError) {
      console.error(`  Error inserting alternatives for question ${question.id}:`, aError);
      continue;
    }

    altCount += insertedAlts.length;
  }

  console.log(`Inserting questions and alternatives...`);
  console.log(`  ${questionCount} questions inserted.`);
  console.log(`  ${altCount} alternatives inserted.\n`);

  // Summary
  const catBreakdown = {};
  for (const q of data.questions) {
    catBreakdown[q.category] = (catBreakdown[q.category] || 0) + 1;
  }
  console.log('Distribution by category:');
  for (const [cat, count] of Object.entries(catBreakdown)) {
    console.log(`  ${cat}: ${count}`);
  }

  console.log('\nSeed completed successfully!');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
