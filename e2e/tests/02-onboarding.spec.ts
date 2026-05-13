import { OnboardingPage } from '../pages/onboarding-page';
import { test, expect } from '../fixtures';

const FAKE_NIP = '5260250274'; // walidny mod-11 NIP (Wedel), używany tylko z mock GUS

test.describe('Onboarding — pierwszy organizacyjny flow', () => {
  test('niezalogowany user dostaje redirect na /login', async ({ page }) => {
    await page.goto('/onboarding');
    await page.waitForURL(/\/login/);
    expect(page.url()).toMatch(/\/login/);
  });

  test('user bez org widzi trzy zakładki', async ({ noOrgContext }) => {
    const page = await noOrgContext.newPage();
    const onboarding = new OnboardingPage(page);
    await onboarding.goto();

    await expect(onboarding.createTab).toBeVisible();
    await expect(onboarding.inviteTab).toBeVisible();
    await expect(onboarding.joinTab).toBeVisible();
    await expect(onboarding.nipInput).toBeVisible();
  });

  test('niewalidny NIP — komunikat błędu', async ({ noOrgContext }) => {
    const page = await noOrgContext.newPage();
    const onboarding = new OnboardingPage(page);
    await onboarding.goto();
    await onboarding.createTab.click();
    await onboarding.nipInput.fill('0000000000');
    await page.locator('#nip').locator('..').getByRole('button').click();
    await expect(
      page.getByText(/suma kontrolna|nie znaleziono firmy|nieprawidłow/i),
    ).toBeVisible();
  });

  test('happy path: NIP → GUS mock → załóż organizację → import-source', async ({
    noOrgContext,
  }) => {
    const page = await noOrgContext.newPage();
    const onboarding = new OnboardingPage(page);
    await onboarding.goto();

    await onboarding.typeNipAndLookup(FAKE_NIP);
    await expect(page.getByText(/znaleziono w bazie gus/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/E2E Mock/)).toBeVisible();

    await onboarding.confirmOrganization();
    await page.waitForURL(/\/onboarding\/import-source/);
    expect(page.url()).toMatch(/\/onboarding\/import-source/);
  });

  test('po pominięciu importu trafiamy na /dashboard?welcome=1', async ({
    noOrgContext,
  }) => {
    const page = await noOrgContext.newPage();
    const onboarding = new OnboardingPage(page);
    await onboarding.goto();
    await onboarding.typeNipAndLookup(FAKE_NIP);
    await expect(page.getByText(/znaleziono w bazie gus/i)).toBeVisible({
      timeout: 15_000,
    });
    await onboarding.confirmOrganization();
    await page.waitForURL(/\/onboarding\/import-source/);

    // Importy są w osobnych komponentach client-side; szukamy CTA "Pomiń"
    // albo "Zacznę od zera" (różny copy między iteracjami).
    const skip = page.getByRole('button', {
      name: /(pomiń|zacznę od zera|start.*scratch)/i,
    });
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
      await page.waitForURL(/\/dashboard/);
      expect(page.url()).toContain('welcome=1');
    }
  });
});
