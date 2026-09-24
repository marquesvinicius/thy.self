import { test, expect } from '@playwright/test';

/**
 * Acessibilidade — protege as correções feitas na navegação por teclado
 * e no suporte a leitor de tela.
 *
 * Contexto: antes destes testes a interface não tinha nenhum estilo de
 * foco (quem navega por teclado não enxergava onde estava) e a troca de
 * pergunta no quiz era silenciosa para leitor de tela. São regressões
 * fáceis de reintroduzir sem perceber, porque não aparecem para quem
 * usa mouse — daí valerem um teste dedicado.
 */

test.describe('acessibilidade', () => {
  test('a página inicial expõe idioma, landmark e foco visível por teclado', async ({ page }) => {
    await page.goto('/');

    // Idioma declarado: leitores de tela escolhem a voz por aqui.
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');

    // Landmark principal, para navegação por regiões.
    await expect(page.locator('main')).toBeVisible();

    // Foco visível: navega por teclado e confere que o elemento focado
    // realmente recebe contorno (outline), e não a largura zero do padrão.
    await page.keyboard.press('Tab');

    const outline = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = window.getComputedStyle(el);
      return {
        tag: el.tagName,
        width: style.outlineWidth,
        style: style.outlineStyle,
      };
    });

    expect(outline, 'algum elemento deve receber foco ao pressionar Tab').not.toBeNull();
    expect(outline.style, 'o elemento focado precisa ter contorno visível').not.toBe('none');
    expect(
      parseFloat(outline.width),
      'o contorno de foco precisa ter espessura'
    ).toBeGreaterThan(0);
  });

  test('o quiz anuncia a pergunta atual e agrupa as opções sob o enunciado', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /começar/i }).first().click();

    const tutorialCta = page.getByRole('button', { name: /entendi, começar/i });
    if (await tutorialCta.isVisible().catch(() => false)) {
      await tutorialCta.click();
    }

    await expect(page).toHaveURL(/\/quiz/, { timeout: 20_000 });

    // Região live: anuncia o avanço, que de outro modo seria só visual.
    const live = page.locator('[aria-live="polite"]');
    await expect(live).toHaveCount(1);
    await expect(live).toContainText(/Pergunta \d+ de \d+/i, { timeout: 20_000 });

    // As opções formam um grupo rotulado pelo enunciado: sem isso o
    // leitor de tela anuncia cinco botões soltos, sem dizer a que
    // pergunta respondem.
    const group = page.locator('[role="group"][aria-labelledby]').first();
    await expect(group).toBeVisible({ timeout: 20_000 });

    const labelResolves = await page.evaluate(() => {
      const g = document.querySelector('[role="group"][aria-labelledby]');
      if (!g) return false;
      const target = document.getElementById(g.getAttribute('aria-labelledby'));
      return !!target && target.textContent.trim().length > 0;
    });
    expect(labelResolves, 'aria-labelledby deve apontar para o enunciado').toBe(true);

    // Cada opção da escala precisa de nome acessível próprio.
    await expect(page.getByRole('button', { name: 'Neutro' })).toBeVisible();
  });
});
