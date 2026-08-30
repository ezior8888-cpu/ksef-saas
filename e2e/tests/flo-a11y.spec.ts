import AxeBuilder from '@axe-core/playwright';

import { expect, test } from '../fixtures';
import { cleanupProposals, seedProposal } from '../helpers/flo-seed';

/**
 * Dostępność wątku agenta (krok 34 toru B).
 *
 * Dwie rzeczy, bo automat nie wystarcza. Axe łapie kontrast, etykiety
 * i strukturę — czyli mniej więcej trzecią część kryteriów WCAG. Reszta to
 * pytanie „czy da się tym pracować bez myszy”, i na to odpowiada tu drugi
 * test: przejście klawiaturą przez pełną ścieżkę zatwierdzenia.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function seedThread(tenantId: string): Promise<void> {
  await seedProposal({
    tenantId,
    kind: 'payment.chase',
    title: 'Kontrahent testowy po terminie',
    body: 'Napisałem wiadomość — przeczytaj ją i zdecyduj.',
    evidence: [{ label: 'Faktura testowa', href: '/invoices' }],
    payload: {
      primaryLabel: 'Wyślij wiadomość',
      requiresPreview: true,
      preview: {
        type: 'message',
        to: 'ksiegowosc@example.com',
        subject: 'Przypomnienie o płatności',
        bodyText: 'Dzień dobry, przypominam o fakturze.',
        editable: true,
      },
    },
  });
}

test.describe('FLO — dostępność', () => {
  // Telefon nadal jest przekierowywany na /mobile — blokada BUG-008 siedzi
  // w lib/supabase/middleware.ts. Do czasu jej zdjęcia testy agenta na
  // projektach mobilnych sprawdzałyby wyłącznie działanie przekierowania.
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name.startsWith('mobile'),
      'aplikacja nie wpuszcza telefonów na trasy panelu (BUG-008)',
    );
  });

  test.afterEach(async ({ seededUser }) => {
    await cleanupProposals(seededUser.tenantId);
  });

  test('wątek nie ma naruszeń WCAG A/AA', async ({
    seededUser,
    authenticatedContext,
  }) => {
    await seedThread(seededUser.tenantId);

    const page = await authenticatedContext.newPage();
    await page.goto('/flo');
    await expect(page.getByText('Kontrahent testowy po terminie')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('rozwinięty podgląd też nie ma naruszeń', async ({
    seededUser,
    authenticatedContext,
  }) => {
    await seedThread(seededUser.tenantId);

    const page = await authenticatedContext.newPage();
    await page.goto('/flo');
    await page.getByRole('button', { name: /pokaż podgląd/i }).click();
    await expect(page.getByText('Przypomnienie o płatności')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('ustawienia agenta nie mają naruszeń', async ({
    authenticatedContext,
  }) => {
    const page = await authenticatedContext.newPage();
    await page.goto('/settings/flo');
    await expect(page.getByText('Cisza nocna')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('całą ścieżkę zatwierdzenia da się przejść bez myszy', async ({
    seededUser,
    authenticatedContext,
  }) => {
    await seedThread(seededUser.tenantId);

    const page = await authenticatedContext.newPage();
    await page.goto('/flo');
    await expect(page.getByText('Kontrahent testowy po terminie')).toBeVisible();

    const preview = page.getByRole('button', { name: /pokaż podgląd/i });
    const send = page.getByRole('button', { name: 'Wyślij wiadomość' });

    // Tabulatorem dochodzimy do podglądu — bez zgadywania, ile razy.
    for (let i = 0; i < 40; i++) {
      if (await preview.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(preview).toBeFocused();

    // Skupienie musi być WIDOCZNE, nie tylko obecne w drzewie.
    const outline = await preview.evaluate((el) => {
      const style = getComputedStyle(el);
      return `${style.outlineStyle} ${style.outlineWidth} ${style.boxShadow}`;
    });
    expect(outline).not.toBe('none 0px none');

    await page.keyboard.press('Enter');
    await expect(page.getByText('Przypomnienie o płatności')).toBeVisible();
    await expect(send).toBeEnabled();
  });

  test('powód blokady jest powiązany z przyciskiem, a nie tylko napisany obok', async ({
    seededUser,
    authenticatedContext,
  }) => {
    await seedThread(seededUser.tenantId);

    const page = await authenticatedContext.newPage();
    await page.goto('/flo');

    const send = page.getByRole('button', { name: 'Wyślij wiadomość' });
    const describedBy = await send.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    // Czytnik ekranu przeczyta to zdanie razem z etykietą przycisku.
    await expect(page.locator(`#${describedBy}`)).toContainText(
      /najpierw otwórz podgląd/i,
    );
  });
});
