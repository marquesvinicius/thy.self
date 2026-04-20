/**
 * Health-check: confirma que a migration 005_public_share.sql foi aplicada.
 *
 * Uso:
 *   cd thy.self/backend
 *   node scripts/check_share_columns.js
 *
 * O script faz uma SELECT mínima em `results` pedindo apenas as colunas que a
 * migração 005 adiciona. Se alguma estiver ausente, o Supabase devolve o erro
 * "column ... does not exist" e o script sai com código 1.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('ERRO: SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY ausentes no .env.');
  process.exit(1);
}

const supabase = createClient(url, key);

const required = ['public_token', 'is_public', 'published_at'];

async function main() {
  console.log('Verificando colunas de compartilhamento em `results`...');

  const { error } = await supabase
    .from('results')
    .select(required.join(','))
    .limit(1);

  if (error) {
    console.error('\n[FAIL] Supabase recusou a consulta:');
    console.error('  code:   ', error.code || '(sem codigo)');
    console.error('  message:', error.message);
    console.error('\nProvavel causa: a migration 005_public_share.sql ainda');
    console.error('nao foi aplicada. Abra o SQL Editor do Supabase e rode o');
    console.error('conteudo de backend/sql/migration_005_public_share.sql.');
    process.exit(1);
  }

  console.log('\n[OK] Todas as colunas existem:');
  for (const col of required) console.log('   ·', col);
  console.log('\nO botao "publicar e gerar link" deve funcionar.');
}

main().catch(err => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
