import { test, expect } from '@playwright/test';

test.describe('Landing page (Faza 19)', () => {
  test('hero z głównym CTA i KSeF banner', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByText(/ksef obowiązkowy od lutego 2026/i),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: /faktury.*ksef.*kpir/i,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /wypróbuj 30 dni za darmo/i }).first(),
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

  test('comparison subpages (vs Fakturownia/inFakt/wFirma/iFirma) działają', async ({
    page,
  }) => {
    const slugs = ['fakturownia', 'infakt', 'wfirma', 'ifirma'] as const;
    for (const slug of slugs) {
      await page.goto(`/vs/${slug}`);
      await expect(page).toHaveURL(new RegExp(`/vs/${slug}`));
      const status = await page.evaluate(() => document.readyState);
      expect(status).toBe('complete');
    }
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
