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
 * RF005 (arquétipo + interpretação da IA) NÃO é verificado aqui, por
 * escolha: o texto da IA muda a cada execução e a camada é opcional por
 * definição, então não há o que conferir com segurança pelo navegador.
 * Ele é coberto pelos testes de integração da camada de IA no backend.
 *
 * RN010 e RNF008 também são conferidos: o aviso de "não é diagnóstico"
 * precisa aparecer antes do perfil, e a sessão é identificada só por UUID.
 */

const OBJECTIVE_ITEMS = 30;

const LIKERT_LABELS = [
  'Discordo totalmente',
  'Discordo',
  'Neutro',
  'Concordo',
  'Concordo totalmente',
];

/** Lê o contador "respostas: N" da barra de status do quiz. */
async function answeredCount(page) {
  const text = await page.getByText(/^respostas:\s*\d+$/i).first().textContent();
  return Number(text.match(/\d+/)[0]);
}

/**
 * Responde a pergunta atual e só retorna quando o avanço foi registrado.
 *
 * Duas armadilhas que este helper evita (ambas observadas):
 *   - espera fixa entre cliques: a transição é animada e de duração
 *     variável; um clique cedo demais se perde (30 cliques → 28 respostas);
 *   - "corrida" entre pergunta e tela de decisão: depois da 30ª resposta o
 *     modal de decisão aparece POR CIMA dos botões, que continuam no DOM.
 *     O botão coberto parece visível e o clique fica esperando para sempre.
 * Por isso o laço é guiado pelo contador da própria tela, e não por
 * visibilidade: nunca se clica depois da 30ª resposta.
 */
/** Id do enunciado na tela (`question-<id>-text`), para detectar a troca. */
async function currentQuestionId(page) {
  return page.locator('h2[id^="question-"]').first().getAttribute('id').catch(() => null);
}

async function answerNext(page, labelIndex) {
  const before = await answeredCount(page);
  const questionBefore = await currentQuestionId(page);

  // `exact: true` é obrigatório: sem ele "Discordo" também casa com
  // "Discordo totalmente" e o clique vai para o alvo errado.
  await page
    .getByRole('button', { name: LIKERT_LABELS[labelIndex], exact: true })
    .first()
    .click();

  await expect
    .poll(() => answeredCount(page), { timeout: 20_000, intervals: [100, 200, 400] })
    .toBeGreaterThan(before);

  // O contador sobe com a resposta do servidor, mas quando não há pergunta
  // pré-carregada a próxima só aparece depois de uma nova busca. Clicar nesse
  // intervalo acerta a pergunta antiga (já respondida) e o app descarta o
  // clique — foi o que travou o teste na 3ª resposta. Então, exceto na
  // última (depois dela vem a tela de decisão), espera a pergunta trocar.
  if (before + 1 < OBJECTIVE_ITEMS) {
    await expect
      .poll(() => currentQuestionId(page), { timeout: 20_000, intervals: [100, 200, 400] })
      .not.toBe(questionBefore);
  }
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
    for (let i = 0; (await answeredCount(page)) < OBJECTIVE_ITEMS; i += 1) {
      await answerNext(page, i % 5);
    }
    expect(await answeredCount(page)).toBe(OBJECTIVE_ITEMS);

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

    await expect(page).toHaveURL(/\/result/, { timeout: 90_000 });

    // ---- RN010: isenção de responsabilidade ANTES do perfil ----
    // A regra exige que o aviso venha antes da revelação: o perfil só
    // aparece depois que a pessoa confirma ter lido que não é diagnóstico.
    await expect(
      page.getByText(/não é um diagnóstico/i).first(),
      'RN010: o aviso deve aparecer antes do perfil'
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByText(/Conscienciosidade/i),
      'RN010: o perfil não pode estar visível antes do aceite'
    ).toHaveCount(0);
    await page.getByRole('button', { name: /revelar meu perfil/i }).click();

    // ---- RF004: perfil OCEAN visível ----
    for (const trait of ['Abertura', 'Conscienciosidade', 'Extroversão', 'Amabilidade', 'Neuroticismo']) {
      await expect(page.getByText(new RegExp(trait, 'i')).first()).toBeVisible({
        timeout: 30_000,
      });
    }

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

  test('voltar desfaz a última resposta e a pergunta pode ser respondida de novo', async ({ page }) => {
    await startSession(page);
    for (let i = 0; i < 3; i += 1) await answerNext(page, i);
    expect(await answeredCount(page)).toBe(3);

    await page.getByRole('button', { name: /voltar/i }).click();
    await expect
      .poll(() => answeredCount(page), { timeout: 20_000 })
      .toBe(2);

    // Regressão: a pergunta desfeita continuava marcada como respondida no
    // navegador, o clique era ignorado e o quiz travava.
    await answerNext(page, 4);
    expect(await answeredCount(page)).toBe(3);
    await answerNext(page, 0);
    expect(await answeredCount(page)).toBe(4);
  });
});
