import AxeBuilder from '@axe-core/playwright';

import { test, expect } from '../fixtures';

/**
 * Plan Finora E7: `/analizy/sprzedaz` i `/analizy/koszty` (P10, P11) na
 * świeżym koncie — nagłówek, wybór miesiąca, puste stany z §7.3 zamiast
 * pustych wykresów, pozycje w menu i audyt WCAG 2.1 AA (jak 06).
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.describe('Analizy (plan Finora E7)', () => {
  test('/analizy/sprzedaz bez faktur: puste stany i „Wystaw fakturę”', async ({ authenticatedContext }) => {
    const page = await authenticatedContext.newPage();
    await page.goto('/analizy/sprzedaz');
    await expect(page.getByRole('heading', { level: 1, name: 'Analiza sprzedaży' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Wybierz miesiąc' })).toBeVisible();
    await expect(page.getByText('Pokażemy to, gdy wystawisz pierwszą fakturę').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Wystaw fakturę' }).first()).toBeVisible();
    await expect(page.getByText('Klienci: rośnie')).toBeVisible();
    await expect(page.getByText('Klienci: spada')).toBeVisible();
    await page.close();
  });

  test('/analizy/koszty bez wydatków: puste stany, miesiąc z adresu', async ({ authenticatedContext }) => {
    const page = await authenticatedContext.newPage();
    await page.goto('/analizy/koszty?miesiac=1999-01');
    await expect(page.getByRole('heading', { level: 1, name: 'Analiza kosztów' })).toBeVisible();
    // Miesiąc spoza wyboru → bieżący, bez błędu strony.
    await expect(page.getByText('Trend wydatków')).toBeVisible();
    await expect(page.getByText('Stałe koszty pokażemy, gdy ten sam dostawca wystąpi w 3 z 4 ostatnich miesięcy')).toBeVisible();
    await page.close();
  });

  for (const path of ['/analizy/sprzedaz', '/analizy/koszty']) {
    test(`a11y zalogowana: ${path}`, async ({ authenticatedContext }) => {
      const page = await authenticatedContext.newPage();
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      await page.close();
    });
  }
});
