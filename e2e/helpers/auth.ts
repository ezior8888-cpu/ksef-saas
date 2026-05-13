import type { BrowserContext, Page } from '@playwright/test';

import { generateSessionTokens } from './db-seed';

const SUPABASE_PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(
  /https?:\/\/([^.]+)\./,
)?.[1];

/**
 * Wstrzykuje sesję Supabase do `localStorage` przeglądarki Playwrighta — bez
 * tego musielibyśmy klikać UI logowania w każdym teście. Klucz w localStorage
 * to `sb-<project_ref>-auth-token`, format zgodny z @supabase/ssr.
 *
 * Wywołaj PRZED `page.goto()`. Po tym `goto('/dashboard')` od razu działa.
 */
export async function injectSupabaseSession(
  context: BrowserContext,
  userId: string,
): Promise<void> {
  if (!SUPABASE_PROJECT_REF) {
    throw new Error('E2E auth: NEXT_PUBLIC_SUPABASE_URL not parseable');
  }

  const { accessToken, refreshToken } = await generateSessionTokens(userId);

  const storageKey = `sb-${SUPABASE_PROJECT_REF}-auth-token`;
  const payload = JSON.stringify({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });

  await context.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: storageKey, value: payload },
  );
}

/**
 * UI-driven login — klikamy w prawdziwy formularz logowania. Wolniejsze niż
 * `injectSupabaseSession`, ale potrzebne do testów samego flow logowania.
 */
export async function loginViaUI(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await page.waitForURL(/\/(dashboard|onboarding)/);
}
