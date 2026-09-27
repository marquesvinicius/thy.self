import js from '@eslint/js';
import globals from 'globals';

/**
 * Análise estática do servidor.
 *
 * Base: regras recomendadas do ESLint (erros prováveis: variável não
 * declarada, código inalcançável, comparação consigo mesmo…), mais regras
 * de corretude escolhidas para este código. A complexidade ciclomática é
 * controlada à parte pelo gate de CRAP (npm run quality:crap), que a cruza
 * com a cobertura.
 */
export default [
  { ignores: ['node_modules/', 'coverage/', 'reports/', '.stryker-tmp/', 'test-gemini.js'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_|^(req|res|next)$' }],
      'no-shadow': 'error',
      'no-return-await': 'error',
      'no-param-reassign': ['error', { props: false }],
      'no-console': ['error', { allow: ['error'] }],
    },
  },
  {
    // Testes e scripts de linha de comando escrevem no console de propósito.
    files: ['test/**', 'scripts/**', 'seed/**', 'eval/run.mjs'],
    rules: { 'no-console': 'off' },
  },
];
