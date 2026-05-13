import type { Locator, Page } from '@playwright/test';

/**
 * Page Object Model dla `/login`, `/register`, `/forgot-password`.
 * Selektory bazują na `id` (Input ma `id={fieldName}` w shadcn), żeby
 * nie zależeć od polskich labelek (które się zmieniają w copy-roundach).
 */
export class AuthPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorBanner: Locator;
  readonly successBanner: Locator;

  constructor(private readonly page: Page) {
    this.emailInput = page.locator('#email');
    this.passwordInput = page.locator('#password');
    this.submitButton = page.locator('button[type="submit"]');
    this.errorBanner = page.locator('[role="alert"], div[class*="border-red"]').first();
    this.successBanner = page.locator('div[class*="border-green"]').first();
  }

  async gotoLogin(): Promise<void> {
    await this.page.goto('/login');
  }

  async gotoRegister(): Promise<void> {
    await this.page.goto('/register');
  }

  async gotoForgotPassword(): Promise<void> {
    await this.page.goto('/forgot-password');
  }

  async submitLogin(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  }

  async submitRegister(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.page
      .getByRole('button', { name: /(zarejestruj|utwórz konto)/i })
      .click();
  }
}
