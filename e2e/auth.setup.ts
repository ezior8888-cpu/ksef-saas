import { test as setup, expect } from '@playwright/test';

/**
 * Globalny setup uruchamiany raz przed wszystkimi projektami (zob.
 * `playwright.config.ts` → `dependencies: ['setup']`). Tutaj robimy tylko
 * smoke check, że dev server odpalił się i kluczowe env vars są dostępne.
 * Per-test seeding leci przez `fixtures.ts`.
 */
setup('env + server smoke', async ({ page }) => {
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL missing').toBeTruthy();
  expect(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY missing').toBeTruthy();
  expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY missing').toBeTruthy();

  await page.goto('/login');
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
});
