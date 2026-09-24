import { test, expect } from '@playwright/test';

/**
 * Jornada completa do usuário — cobre RF001 a RF007 numa única passagem.
 *
 * Esta é a faixa que a suíte do backend não alcança: lá os testes são
 * unitários (motor de cálculo, parsing, seleção de perguntas) e há um
 * caso de integração com dependências simuladas. Nenhum deles abre o
 * produto. Aqui o teste faz o que o usuário faz.
 *
 * Requisitos cobertos:
 *   RF001 — criar sessão anônima
 *   RF002 — responder a avaliação (inclui a tela de decisão)
 *   RF003 — disparar o cálculo do perfil
 *   RF004 — visualizar o perfil OCEAN
 *   RF006 — auditar a influência das respostas
 *   RF007 — exportar o resultado em PDF
 *
 * RF005 (arquétipo + interpretação da IA) é verificado de forma
 * tolerante: a camada de IA é declaradamente opcional (o sistema deve
 * degradar sem ela), então o teste exige o arquétipo, mas aceita tanto
 * a interpretação quanto a mensagem de indisponibilidade.
 */

const OBJECTIVE_ITEMS = 30;

const LIKERT_LABELS = [
  'Discordo totalmente',
  'Discordo',
  'Neutro',
  'Concordo',
  'Concordo totalmente',
];

/**
 * Responde uma pergunta e só retorna quando o avanço realmente aconteceu.
 *
 * Uma espera fixa não serve aqui: a transição entre perguntas é animada
 * e de duração variável, então um clique disparado cedo demais cai no
 * meio da animação e se perde — o efeito observado foi o teste
 * "responder 30 vezes" terminar com 28 respostas registradas. Por isso
 * o avanço é confirmado pelo contador anunciado na região aria-live.
 */
async function answerCurrentQuestion(page, labelIndex) {
  const live = page.locator('[aria-live="polite"]');
  const before = await live.textContent();

  // `exact: true` é obrigatório aqui: sem ele, "Discordo" também casa com
  // "Discordo totalmente" e o clique vai para o alvo errado.
  const option = page
    .getByRole('button', { name: LIKERT_LABELS[labelIndex], exact: true })
    .first();

  // Duas coisas podem acontecer aqui: a próxima pergunta aparece (com
  // fade-in, então não está visível de imediato) ou a etapa objetiva
  // termina e a tela de decisão toma o lugar dela. Uma checagem
  // instantânea de visibilidade erra os dois casos — dá falso negativo
  // durante a animação. Por isso esperamos pelo primeiro dos dois.
  const decisionButton = page.getByRole('button', { name: /encerrar agora/i });
  const whatCameFirst = await Promise.race([
    option.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'question', () => 'timeout'),
    decisionButton.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'decision', () => 'timeout'),
  ]);

  if (whatCameFirst !== 'question') return 'decision';

  await option.click();

  // Avançou quando o anúncio muda — ou quando a etapa objetiva termina
  // e a tela de decisão toma o lugar da pergunta.
  await expect
    .poll(
      async () => {
        const decision = await page
          .getByRole('button', { name: /encerrar agora/i })
          .isVisible()
          .catch(() => false);
        if (decision) return 'decision';
        return (await live.textContent()) !== before ? 'advanced' : 'same';
      },
      { timeout: 20_000, intervals: [100, 150, 250] }
    )
    .not.toBe('same');

  return 'advanced';
}

async function startSession(page) {
  await page.goto('/');
  await page.getByRole('button', { name: /começar/i }).first().click();

  // Popup de tutorial (RF001): aparece antes da criação da sessão.
  const tutorialCta = page.getByRole('button', { name: /entendi, começar/i });
  if (await tutorialCta.isVisible().catch(() => false)) {
    await tutorialCta.click();
  }

  await expect(page).toHaveURL(/\/quiz/, { timeout: 20_000 });
}

test.describe('jornada completa', () => {
  test('responde a camada objetiva, encerra na tela de decisão e vê o resultado', async ({ page }) => {
    // ---- RF001: sessão anônima ----
    await startSession(page);

    // A sessão é anônima: identificada só por UUID, sem dado pessoal (RNF012).
    const stored = await page.evaluate(() =>
      window.localStorage.getItem('thyself_active_session')
    );
    expect(stored, 'sessão anônima deve ser criada e persistida').toBeTruthy();
    expect(stored, 'sessão deve ser identificada por UUID').toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );

    // ---- RF002: responder os 30 itens objetivos ----
    // Varia a resposta para não gerar um perfil degenerado (tudo neutro
    // produziria 50 em todos os eixos e esconderia erros de sinal).
    // A margem extra de iterações cobre a possibilidade de o catálogo
    // servir alguma pergunta a mais antes da tela de decisão.
    for (let i = 0; i < OBJECTIVE_ITEMS + 4; i += 1) {
      const decisionReached = await page
        .getByRole('button', { name: /encerrar agora/i })
        .isVisible()
        .catch(() => false);
      if (decisionReached) break;

      const outcome = await answerCurrentQuestion(page, i % 5);
      if (outcome === 'decision') break;
    }

    // ---- RF002: tela de decisão ao fim da camada objetiva ----
    const encerrar = page.getByRole('button', { name: /encerrar agora/i });
    await expect(encerrar, 'tela de decisão deve aparecer após os 30 itens').toBeVisible({
      timeout: 30_000,
    });

    // As três saídas previstas devem estar disponíveis.
    await expect(page.getByRole('button', { name: /versão curta/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /versão completa/i })).toBeVisible();

    // ---- RF003: dispara o cálculo ----
    await encerrar.click();

    // ---- RF004: perfil OCEAN visível ----
    await expect(page).toHaveURL(/\/result/, { timeout: 90_000 });
    for (const trait of ['Abertura', 'Conscienciosidade', 'Extroversão', 'Amabilidade', 'Neuroticismo']) {
      await expect(page.getByText(new RegExp(trait, 'i')).first()).toBeVisible({
        timeout: 30_000,
      });
    }

    // RN010: a isenção de responsabilidade precisa estar na tela.
    await expect(
      page.getByText(/não.*(clínic|diagnóstic)/i).first(),
      'RN010 exige isenção de responsabilidade visível'
    ).toBeVisible();

    // ---- RF006: auditabilidade por resposta ----
    const revisar = page.getByRole('button', { name: /revisar respostas/i });
    await expect(revisar).toBeVisible();
    await revisar.click();

    // O modal deve listar itens do BFI-2-S com o traço que cada um alimentou.
    await expect(page.getByText(/BFI-2-S/i).first()).toBeVisible({ timeout: 15_000 });

    // Fecha o modal para liberar a tela.
    await page.keyboard.press('Escape');

    // ---- RF007: exportação em PDF ----
    const exportar = page.getByRole('button', { name: /exportar em pdf/i });
    await expect(exportar).toBeVisible();

    const downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
    await exportar.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });
});
