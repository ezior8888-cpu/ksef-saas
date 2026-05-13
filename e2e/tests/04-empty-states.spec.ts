import { test, expect } from '../fixtures';

test.describe('Empty states (Faza 19)', () => {
  test('/invoices bez faktur pokazuje EmptyState z dwoma CTA', async ({
    authenticatedContext,
  }) => {
    const page = await authenticatedContext.newPage();
    await page.goto('/invoices');
    await expect(page.getByText(/brak faktur wystawionych/i)).toBeVisible();
    await expect(
      page.getByRole('link', { name: /wystaw pierwszą fakturę/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /importuj historię/i }),
    ).toBeVisible();
  });

  test('/inbox bez faktur przychodzących pokazuje empty state', async ({
    authenticatedContext,
  }) => {
    const page = await authenticatedContext.newPage();
    await page.goto('/inbox');
    await expect(page.getByText(/brak faktur przychodzących/i)).toBeVisible();
  });

  test('/contractors bez kontrahentów pokazuje empty state', async ({
    authenticatedContext,
  }) => {
    const page = await authenticatedContext.newPage();
    await page.goto('/contractors');
    await expect(page.getByText(/brak kontrahentów/i)).toBeVisible();
  });
});
