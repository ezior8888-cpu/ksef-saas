import http from 'k6/http';
import { group, sleep } from 'k6';
import { BASE_URL, standaloneOptions } from '../config.js';
import { assertCredentials } from '../lib/auth.js';
import { ensureLoggedIn } from '../lib/session.js';
import { checkPage, checkAccepted } from '../lib/checks.js';
import { fakeInvoice, randomIntBetween } from '../lib/data.js';
import { serverAction, hasAction } from '../lib/server-action.js';

// Scenariusz "Wystawiający fakturę" — login → hub wyboru typu faktury → formularz
// faktury zwykłej → wysyłka do KSeF → powrót na listę.
//
// Page loady (GET) są niezawodne. Krok wysyłki to Server Action — mierzony tylko
// gdy podane jest `-e ACTION_INVOICE_SUBMIT=<id>` (hash z deployu, patrz runbook
// Kroku 7). Bez ID scenariusz wciąż obciąża renderowanie ciężkiego formularza.

export const options = standaloneOptions();

export function setup() {
  assertCredentials();
}

function think(min, max) {
  sleep(randomIntBetween(min, max));
}

export function journey() {
  if (!ensureLoggedIn()) return;

  group('invoice-issuer', () => {
    // Hub wyboru typu faktury.
    const hub = http.get(`${BASE_URL}/invoices/new`, {
      tags: { name: 'page_invoice_new_hub' },
    });
    checkPage(hub, 'page_invoice_new_hub');
    think(1, 3);

    // Formularz faktury zwykłej — najcięższy render w aplikacji.
    const form = http.get(`${BASE_URL}/invoices/new/regular`, {
      tags: { name: 'page_invoice_form' },
    });
    checkPage(form, 'page_invoice_form');

    // Wypełnianie formularza — realnie trwa najdłużej z całego flow.
    think(8, 20);

    // Wysyłka do KSeF (Server Action). Pipeline submitInvoice z Fazy 23 jest
    // asynchroniczny — Server Action enqueue'uje event Inngest i wraca, więc
    // akceptujemy 2xx/202.
    if (hasAction('ACTION_INVOICE_SUBMIT')) {
      const submit = serverAction(
        '/invoices/new/regular',
        'ACTION_INVOICE_SUBMIT',
        [fakeInvoice()],
        'action_invoice_submit',
      );
      if (submit) checkAccepted(submit, 'action_invoice_submit');
      think(1, 3);
    }

    // Powrót na listę faktur — weryfikacja statusu.
    const list = http.get(`${BASE_URL}/invoices`, {
      tags: { name: 'page_invoices_list' },
    });
    checkPage(list, 'page_invoices_list');
  });
}

export default function () {
  journey();
}
