import { expect, test } from '../fixtures';
import { cleanupProposals, seedProposal } from '../helpers/flo-seed';

/**
 * Funkcje promienia 4 (krok 33 toru B).
 *
 * Trzy miejsca, w których błąd interfejsu kosztuje najwięcej: paczka faktur
 * do rejestru państwowego, wiadomość do obcej firmy i komplet dokumentów
 * firmy wysłany na cudzy adres. Wszystkie trzy są nieodwracalne.
 *
 * Te testy nie sprawdzają wyglądu. Sprawdzają, czy DA SIĘ kliknąć rzeczy,
 * których kliknąć nie wolno.
 */
test.describe('FLO — promień 4', () => {
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

  test('paczka faktur: pozycji odstającej nie da się zaznaczyć bez obejrzenia', async ({
    seededUser,
    authenticatedContext,
  }) => {
    await seedProposal({
      tenantId: seededUser.tenantId,
      kind: 'invoice.batch',
      title: 'Faktury na nowy miesiąc',
      body: 'Pozycje odbiegające od zwykłych są odznaczone.',
      payload: {
        primaryLabel: 'Wyślij zaznaczone',
        requiresPreview: true,
        items: [
          {
            id: 'zwykla',
            label: 'Kontrahent zwykły',
            sublabel: 'Usługi',
            amount: '1 000,00 zł',
            preselected: true,
            needsPreview: false,
          },
          {
            id: 'odstajaca',
            label: 'Kontrahent odstający',
            sublabel: 'Kwota inna niż zwykle',
            amount: '99 000,00 zł',
            preselected: false,
            needsPreview: true,
          },
        ],
      },
    });

    const page = await authenticatedContext.newPage();
    await page.goto('/flo');

    const risky = page.locator('#flo-item-odstajaca');
    await expect(risky).toBeDisabled();
    await expect(risky).not.toBeChecked();

    // Dopiero rozwinięcie wiersza odblokowuje pole wyboru.
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Kontrahent odstający' })
      .getByRole('button', { name: 'Pokaż' })
      .click();

    await expect(risky).toBeEnabled();
    await risky.check();
    await expect(risky).toBeChecked();
  });

  test('paczka faktur: bez zaznaczenia nie ma czego wysłać', async ({
    seededUser,
    authenticatedContext,
  }) => {
    await seedProposal({
      tenantId: seededUser.tenantId,
      kind: 'invoice.batch',
      title: 'Faktury bez domyślnego zaznaczenia',
      body: 'Wszystko wymaga obejrzenia.',
      payload: {
        primaryLabel: 'Wyślij zaznaczone',
        requiresPreview: true,
        items: [
          {
            id: 'jedna',
            label: 'Kontrahent do obejrzenia',
            sublabel: 'Nietypowa pozycja',
            amount: '5 000,00 zł',
            preselected: false,
            needsPreview: true,
          },
        ],
      },
    });

    const page = await authenticatedContext.newPage();
    await page.goto('/flo');

    await expect(
      page.getByRole('button', { name: /wyślij zaznaczone/i }),
    ).toBeDisabled();
    await expect(page.getByText(/zaznacz przynajmniej jedną/i)).toBeVisible();
  });

  test('ponaglenie: treść trzeba przeczytać, a po edycji wysyłamy ją, nie swoją', async ({
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
          to: 'ksiegowosc@example.com',
          subject: 'Przypomnienie o płatności',
          bodyText: 'Dzień dobry, przypominam o płatności.',
          editable: true,
        },
      },
    });

    const page = await authenticatedContext.newPage();
    await page.goto('/flo');

    const send = page.getByRole('button', { name: 'Wyślij wiadomość' });
    await expect(send).toBeDisabled();

    await page.getByRole('button', { name: /pokaż podgląd/i }).click();
    const editor = page.getByRole('textbox', { name: /treść wiadomości/i });
    await expect(editor).toHaveValue(/przypominam o płatności/i);

    await editor.fill('Moja własna treść ponaglenia.');
    await expect(page.getByText(/wyślę dokładnie tę treść/i)).toBeVisible();

    // Zwinięcie podglądu NIE kasuje poprawki ani nie zamyka przycisku.
    await page.getByRole('button', { name: /ukryj podgląd/i }).click();
    await expect(send).toBeEnabled();
    await page.getByRole('button', { name: /pokaż podgląd/i }).click();
    await expect(editor).toHaveValue('Moja własna treść ponaglenia.');
  });

  test('paczka do księgowej: adres trzeba potwierdzić', async ({
    seededUser,
    authenticatedContext,
  }) => {
    await seedProposal({
      tenantId: seededUser.tenantId,
      kind: 'accountant.package',
      title: 'Miesiąc domknięty — wysłać paczkę?',
      body: 'Zajrzyj do środka, podaj adres i potwierdź.',
      payload: {
        primaryLabel: 'Wyślij paczkę',
        requiresPreview: true,
        inputLabel: 'Adres e-mail księgowej',
        inputKind: 'email',
        preview: {
          type: 'file',
          label: 'paczka-testowa.zip',
          href: '/reports/exports',
          sizeLabel: '1,0 MB',
        },
      },
    });

    const page = await authenticatedContext.newPage();
    await page.goto('/flo');

    const send = page.getByRole('button', { name: 'Wyślij paczkę' });
    await expect(send).toBeDisabled();

    await page.getByRole('button', { name: /pokaż, co jest w środku/i }).click();
    await expect(page.getByText('paczka-testowa.zip')).toBeVisible();
    await expect(send).toBeDisabled();

    const field = page.getByLabel('Adres e-mail księgowej');
    await field.fill('nie-adres');
    await expect(send).toBeDisabled();

    await field.fill('anna@biuro.pl');
    // Sam poprawny adres nie wystarcza — musi paść pytanie i potwierdzenie.
    await expect(page.getByText(/zgadza się\?/i)).toBeVisible();
    await expect(send).toBeDisabled();

    await page.getByRole('button', { name: /tak, ten adres/i }).click();
    await expect(send).toBeEnabled();

    // Poprawka adresu ZAMYKA przycisk z powrotem.
    await page.getByRole('button', { name: 'Popraw' }).click();
    await expect(send).toBeDisabled();
  });
});
