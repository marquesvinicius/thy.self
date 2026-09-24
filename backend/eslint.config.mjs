import js from '@eslint/js';
import globals from 'globals';

/**
 * Configuração de lint do backend.
 *
 * O frontend já tinha lint (via `eslint-config-next`); o backend não tinha
 * nenhum. O objetivo aqui não é estilo — é pegar a classe de erro que passa
 * despercebida em revisão: variável e import não usados (foi assim que
 * constantes mortas como `MAX_QUESTIONS_PER_SESSION` sobreviveram meses),
 * `case` sem `break`, promessa órfã, redeclaração.
 */
export default [
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Argumentos não usados são comuns e legítimos em middleware do
      // Express (`next` na assinatura do errorHandler, por exemplo), então
      // só reclamamos dos que vêm ANTES de um argumento usado.
      'no-unused-vars': ['error', {
        args: 'after-used',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    // Os testes usam o runner nativo do Node; nada de globals de framework.
    files: ['test/**/*.js', 'eval/**/*.js', 'eval/**/*.mjs'],
    rules: {
      'no-unused-vars': 'off',
    },
  },
  {
    ignores: ['node_modules/**', 'coverage/**', 'seed/*.json'],
  },
];
