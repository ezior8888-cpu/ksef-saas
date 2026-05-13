import { test as base, type BrowserContext } from '@playwright/test';

import { injectSupabaseSession } from './helpers/auth';
import {
  cleanupUser,
  seedUserWithOrg,
  seedUserWithoutOrg,
  type SeededUser,
  type SeedOptions,
} from './helpers/db-seed';
import { uniqueEmail, TEST_NIP_SELLER } from './helpers/test-data';

type Fixtures = {
  /**
   * Tworzy świeżego usera + tenanta przed testem i usuwa wszystko po. Każdy
   * test dostaje unikalny email/NIP, żeby równoległe runy się nie biły.
   */
  seededUser: SeededUser;

  /**
   * User bez żadnej organizacji — używany w testach onboardingu, gdzie
   * sprawdzamy flow tworzenia pierwszej organizacji.
   */
  noOrgUser: { userId: string; email: string; password: string };

  /**
   * Context z już wstrzykniętą sesją Supabase — wystarczy `page.goto('/dashboard')`.
   * Wymaga `seededUser` jako pre-requisite.
   */
  authenticatedContext: BrowserContext;

  /**
   * Context dla `noOrgUser` — wstrzyknięta sesja, ale bez aktywnej org.
   * Każde wejście na `/dashboard` natychmiast redirectuje na `/onboarding`.
   */
  noOrgContext: BrowserContext;
};

function randomNip(): string {
  return String(Math.floor(1_000_000_000 + Math.random() * 8_999_999_999));
}

export const test = base.extend<Fixtures>({
  seededUser: async ({}, use, testInfo) => {
    const email = uniqueEmail('e2e');
    const opts: SeedOptions = {
      email,
      nip: testInfo.project.name === 'setup' ? TEST_NIP_SELLER : randomNip(),
    };
    const user = await seedUserWithOrg(opts);
    await use(user);
    await cleanupUser(email);
  },

  authenticatedContext: async ({ browser, seededUser, baseURL }, use) => {
    const context = await browser.newContext({ baseURL });
    await injectSupabaseSession(context, seededUser.userId);
    await use(context);
    await context.close();
  },

  noOrgUser: async ({}, use) => {
    const email = uniqueEmail('e2e-no-org');
    const user = await seedUserWithoutOrg({ email });
    await use(user);
    await cleanupUser(email);
  },

  noOrgContext: async ({ browser, noOrgUser, baseURL }, use) => {
    const context = await browser.newContext({ baseURL });
    await injectSupabaseSession(context, noOrgUser.userId);
    await use(context);
    await context.close();
  },
});

export { expect } from '@playwright/test';
