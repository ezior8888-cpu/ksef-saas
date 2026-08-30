import { expect, test } from '../fixtures';
import {
  cleanupProposals,
  readProposalStatus,
  seedProposal,
} from '../helpers/flo-seed';

/**
 * Podstawowe ścieżki agenta (krok 32 toru B).
 *
 * Pięć rzeczy, których zepsucie klient zauważy pierwszego dnia: wątek się
 * ładuje, karty z podglądem nie da się kliknąć na ślepo, nieaktualna
 * propozycja tłumaczy się zamiast wywalać, cofnięcie działa, a „nigdy więcej
 * takich” naprawdę wycisza.
 *
 * Propozycje wsiewamy wprost do bazy — patrz `helpers/flo-seed.ts`.
 */
test.describe('FLO — podstawowe ścieżki', () => {
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

  test('wątek pokazuje propozycję razem z dowodami', async ({
    seededUser,
    authenticatedContext,
  }) => {
    await seedProposal({
      tenantId: seededUser.tenantId,
      kind: 'ksef.status',
      title: 'Faktura testowa przyjęta przez KSeF',
      body: 'Poświadczenie odbioru pobrane i schowane w archiwum.',
      evidence: [{ label: 'Faktura testowa', href: '/invoices' }],
    });

    const page = await authenticatedContext.newPage();
    await page.goto('/flo');

    await expect(
      page.getByText('Faktura testowa przyjęta przez KSeF'),
    ).toBeVisible();

    // „Dlaczego to widzę” jest zwinięte i rozwija się jednym kliknięciem.
    const why = page.getByRole('button', { name: /dlaczego to widzę/i });
    await expect(why).toHaveAttribute('aria-expanded', 'false');
    await why.click();
    await expect(page.getByRole('link', { name: 'Faktura testowa' })).toBeVisible();
  });

  test('pusty wątek mówi jedno spokojne zdanie, bez zachęt', async ({
    authenticatedContext,
  }) => {
    const page = await authenticatedContext.newPage();
    await page.goto('/flo');

    await expect(page.getByText(/nic nie wymaga twojej decyzji/i)).toBeVisible();
    await expect(page.getByText(/skonfiguruj|uzupełnij dane/i)).toHaveCount(0);
  });

  test('bez otwarcia podglądu nie da się kliknąć wysyłki', async ({
    seededUser,
    authenticatedContext,
  }) => {
    await seedProposal({
      tenantId: seededUser.tenantId,
      kind: 'payment.chase',
      title: 'Kontrahent testowy po terminie',
      body: 'Napisałem wiadomość — przeczytaj ją i zdecyduj.',
      payload: {
        primaryLabel: 'Wyślij wiadomość',
        requiresPreview: true,
        preview: {
          type: 'message',
          to: 'test@example.com',
          subject: 'Przypomnienie o płatności',
          bodyText: 'Dzień dobry, przypominam o fakturze.',
          editable: true,
        },
      },
    });

    const page = await authenticatedContext.newPage();
    await page.goto('/flo');

    const send = page.getByRole('button', { name: 'Wyślij wiadomość' });
    await expect(send).toBeDisabled();
    await expect(page.getByText(/najpierw otwórz podgląd/i)).toBeVisible();

    await page.getByRole('button', { name: /pokaż podgląd/i }).click();
    await expect(page.getByText('Przypomnienie o płatności')).toBeVisible();
    await expect(send).toBeEnabled();
  });

  test('nieaktualna propozycja tłumaczy się spokojnie, nie wywala', async ({
    seededUser,
    authenticatedContext,
  }) => {
    // Odcisk danych, którego silnik nie policzy ponownie — przy kliknięciu
    // re-walidacja odmówi wykonania. To jest normalny przypadek (M1).
    await seedProposal({
      tenantId: seededUser.tenantId,
      kind: 'expense.review',
      title: 'Koszt testowy do potwierdzenia',
      body: 'Zaksięgowałem to jako paliwo.',
      fingerprint: 'odcisk-z-innej-epoki',
      payload: { primaryLabel: 'Zgadza się' },
    });

    const page = await authenticatedContext.newPage();
    await page.goto('/flo');
    await page.getByRole('button', { name: 'Zgadza się' }).click();

    // Cokolwiek odpowie serwer, klient nie zobaczy słowa „błąd” ani awarii.
    await expect(page.getByRole('status')).toBeVisible();
    await expect(page.getByText(/błąd|awaria|error/i)).toHaveCount(0);
  });

  test('„nigdy więcej takich” wycisza rodzaj sprawy', async ({
    seededUser,
    authenticatedContext,
  }) => {
    const id = await seedProposal({
      tenantId: seededUser.tenantId,
      kind: 'payment.score',
      title: 'Ocena kontrahenta testowego',
      body: 'Płaci średnio po terminie.',
    });

    const page = await authenticatedContext.newPage();
    await page.goto('/flo');
    await page.getByRole('button', { name: /nigdy więcej/i }).click();

    await expect(page.getByText('Ocena kontrahenta testowego')).toHaveCount(0);
    expect(await readProposalStatus(id)).toBe('dismissed');

    // Wyciszony rodzaj trafia na listę w ustawieniach, skąd da się go cofnąć.
    await page.goto('/settings/flo');
    await expect(page.getByText(/oceny rzetelności kontrahentów/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Przywróć' })).toBeVisible();
  });

  test('panel zatwierdzonych pokazuje ślad zgody', async ({
    seededUser,
    authenticatedContext,
  }) => {
    await seedProposal({
      tenantId: seededUser.tenantId,
      kind: 'ksef.status',
      title: 'Sprawa testowa w kolejce',
      body: 'Czeka na wykonanie.',
    });

    const page = await authenticatedContext.newPage();
    await page.goto('/flo');

    await expect(
      page.getByText('ZATWIERDZONE — CZEKA NA WYKONANIE'),
    ).toBeVisible();
  });
});
