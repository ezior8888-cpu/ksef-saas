import { test, expect } from '@playwright/test';

test.describe('Strona główna i strony marketingowe', () => {
  // Strona główna od 23.10.2026 (app/(home)): o FaktWay, agent FLO jako
  // dodatek. Wcześniejsze testy szukały sekcji („Problem/Solution”,
  // kalkulator), których nie było już na stronie Zova.
  test('hero: faktury w KSeF i główne CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: /faktury w\s+ksef bez stresu/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /wypróbuj za darmo/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /od faktury do księgowej/i })).toBeVisible();
  });

  test('sekcja FLO: zakładka pokazuje scenę do końca', async ({ page }) => {
    await page.goto('/#flo');
    const tabs = page.getByRole('tablist', { name: 'Co robi FLO' });
    await tabs.getByRole('tab', { name: /odrzucone faktury/i }).click();
    const panel = page.getByRole('tabpanel');
    await expect(panel).toContainText('KSeF odrzucił fakturę');
    // Napis na przycisku zmienia się dopiero na końcu sceny (toBeVisible
    // nie wystarczy: Playwright liczy opacity 0 jako widoczne). Po kliknięciu
    // zakładki sceny już się nie zmieniają same.
    await expect(panel).not.toContainText('Wysłano');
    await expect(panel).toContainText('Wysłano', { timeout: 8000 });
    await expect(panel).toContainText('KSeF odrzucił fakturę');
  });

  // Strony porównawcze wyłączone 15.10.2026 do weryfikacji treści
  // (lib/marketing/comparisons.ts, uzasadnienie w app/(marketing)/vs/layout.tsx).
  // Po włączeniu flagi wróć do sprawdzania, że się renderują.
  test('comparison subpages (vs Inni/inFakt/wFirma/iFirma) są wyłączone (404)', async ({
    page,
  }) => {
    const slugs = ['inni', 'infakt', 'wfirma', 'ifirma'] as const;
    for (const slug of slugs) {
      const response = await page.goto(`/vs/${slug}`);
      expect(response?.status()).toBe(404);
    }
  });

  test('/vs/fakturownia przekierowuje na /vs/inni', async ({ page }) => {
    await page.goto('/vs/fakturownia');
    await expect(page).toHaveURL(/\/vs\/inni/);
  });

  test('legal pages dostępne z footera', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /regulamin/i }).click();
    await page.waitForURL(/\/legal\/regulamin/);
    expect(page.url()).toContain('/legal/regulamin');
  });
});
