import { defineConfig, devices } from '@playwright/test';

/**
 * Configuração dos testes end-to-end do thy.self.
 *
 * Por que existem: a suíte automatizada do backend cobre unidades
 * (motor de cálculo, parsing, seleção de perguntas) e um caso de
 * integração com dependências simuladas. Nenhum deles exercita o
 * produto como o usuário o usa — abrir o site, responder, ver o
 * resultado, auditar as respostas e exportar o PDF. Estes testes
 * cobrem exatamente essa faixa, que antes só era verificada
 * clicando manualmente.
 *
 * Pré-requisitos para rodar:
 *   1. Backend em pé na porta 3000 (`npm run dev` em backend/)
 *   2. Banco populado (`npm run seed` em backend/)
 *   O frontend sobe sozinho via `webServer` abaixo.
 */
export default defineConfig({
  testDir: './e2e',

  // A jornada completa tem 30 itens objetivos; o padrão de 30s não basta.
  timeout: 120_000,
  expect: { timeout: 15_000 },

  // Sem paralelismo: as sessões são anônimas mas compartilham o mesmo
  // banco, e o orçamento diário do LLM é um recurso global limitado.
  workers: 1,
  fullyParallel: false,

  // Em CI, falhar se alguém esqueceu um .only no código.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3001',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
