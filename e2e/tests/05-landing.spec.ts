import { test, expect } from '@playwright/test';

test.describe('Landing page (Faza 19)', () => {
  test('hero z głównym CTA i nagłówkiem', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/ksef 2\.0/i).first()).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: /wystawiaj faktury w ksef/i,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /wypróbuj za darmo/i }).first(),
    ).toBeVisible();
  });

  test('sekcja porównawcza Problem/Solution', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /stare apki to formularze/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/zdjęcie paragonu.*automatycznie kpir/i),
    ).toBeVisible();
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

  test('savings calculator preview renderuje się', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', {
        name: /ile zaoszczędzisz/i,
      }),
    ).toBeVisible();
  });

  test('legal pages dostępne z footera', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /regulamin/i }).click();
    await page.waitForURL(/\/legal\/regulamin/);
    expect(page.url()).toContain('/legal/regulamin');
  });
});
