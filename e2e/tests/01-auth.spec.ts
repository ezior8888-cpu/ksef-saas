import { AuthPage } from '../pages/auth-page';
import { TEST_PASSWORD, uniqueEmail } from '../helpers/test-data';
import { cleanupUser } from '../helpers/db-seed';
import { test, expect } from '../fixtures';

test.describe('Auth flow', () => {
  test('odrzuca błędne hasło z polskim komunikatem', async ({ page, seededUser }) => {
    const auth = new AuthPage(page);
    await auth.gotoLogin();
    await auth.submitLogin(seededUser.email, 'ZleHaslo123!');

    await expect(page).toHaveURL(/\/login\?error=invalid_credentials/);
    await expect(page.getByText(/nieprawidłowy email lub hasło/i)).toBeVisible();
  });

  test('zalogowany user trafia do dashboardu', async ({ page, seededUser }) => {
    const auth = new AuthPage(page);
    await auth.gotoLogin();
    await auth.submitLogin(seededUser.email, seededUser.password);

    await page.waitForURL(/\/(dashboard|onboarding)/);
    expect(page.url()).toMatch(/\/(dashboard|onboarding)/);
  });

  test('niezalogowany user widzi formularz na /login', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /zaloguj/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zaloguj się', exact: true })).toBeVisible();
  });

  test('niezalogowany user dostaje redirect z /dashboard na /login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/login/);
    expect(page.url()).toMatch(/\/login/);
  });

  test('rejestracja tworzy konto i pokazuje komunikat „check email"', async ({ page }) => {
    const email = uniqueEmail('e2e-register');
    const auth = new AuthPage(page);

    try {
      await auth.gotoRegister();
      await auth.submitRegister(email, TEST_PASSWORD);

      await expect(page).toHaveURL(/\/login\?success=check_email/);
      await expect(page.getByText(/sprawdź swoją skrzynkę/i)).toBeVisible();
    } finally {
      await cleanupUser(email);
    }
  });

  test('forgot-password przyjmuje email i pokazuje confirmation', async ({ page, seededUser }) => {
    const auth = new AuthPage(page);
    await auth.gotoForgotPassword();
    await page.locator('#email').fill(seededUser.email);
    await page.getByRole('button', { name: /(wyślij|reset)/i }).click();

    await expect(page.getByText(/(wysłaliśmy|sprawdź)/i)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Auth via injected session', () => {
  test('storageState injection daje dostęp do /dashboard bez UI loginu', async ({
    authenticatedContext,
  }) => {
    const page = await authenticatedContext.newPage();
    await page.goto('/dashboard');
    await page.waitForURL(/\/(dashboard|onboarding)/);
    expect(page.url()).toMatch(/\/(dashboard|onboarding)/);
  });
});
