import http from 'k6/http';
import { group, sleep } from 'k6';
import { BASE_URL, standaloneOptions } from '../config.js';
import { assertCredentials } from '../lib/auth.js';
import { ensureLoggedIn } from '../lib/session.js';
import { checkPage, checkAccepted } from '../lib/checks.js';
import { randomIntBetween } from '../lib/data.js';
import { serverAction, hasAction } from '../lib/server-action.js';

// Scenariusz "Bulk importer" — login → ekran importu danych → upload pliku
// (CSV / Magic Import) → oczekiwanie na wynik.
//
// Krok importu to Server Action (`startFileImportAction`), która enqueue'uje
// job `bulkImport` w Inngest i wraca — mierzymy ją tylko, gdy podane jest
// `-e ACTION_BULK_IMPORT=<id>` (patrz runbook Kroku 7). Ciężkie przetwarzanie
// 10K faktur to osobny stress-test w Kroku 3.

export const options = standaloneOptions();

export function setup() {
  assertCredentials();
}

function think(min, max) {
  sleep(randomIntBetween(min, max));
}

// Mała atrapa CSV — kilka wierszy faktur. Pełne przetworzenie i tak idzie
// asynchronicznie przez Inngest; tu mierzymy ścieżkę upload + enqueue.
function fakeCsv() {
  const rows = ['numer,data,nip_nabywcy,netto,vat'];
  for (let i = 0; i < 10; i += 1) {
    rows.push(`FV/${i}/2026,2026-05-01,1234567890,${1000 + i},23`);
  }
  return rows.join('\n');
}

export function journey() {
  if (!ensureLoggedIn()) return;

  group('bulk-importer', () => {
    // Ekran importu danych.
    const importPage = http.get(`${BASE_URL}/import-danych`, {
      tags: { name: 'page_import' },
    });
    checkPage(importPage, 'page_import');

    // Wybór pliku przez użytkownika.
    think(4, 10);

    // Upload + start importu (Server Action).
    if (hasAction('ACTION_BULK_IMPORT')) {
      const start = serverAction(
        '/import-danych',
        'ACTION_BULK_IMPORT',
        [{ csv: fakeCsv(), source: 'csv' }],
        'action_bulk_import',
      );
      if (start) checkAccepted(start, 'action_bulk_import');
    }

    // Oczekiwanie na zakończenie importu — użytkownik patrzy na ekran.
    think(5, 12);

    // Sprawdzenie wyniku na liście faktur.
    const list = http.get(`${BASE_URL}/invoices`, {
      tags: { name: 'page_invoices_after_import' },
    });
    checkPage(list, 'page_invoices_after_import');
  });
}

export default function () {
  journey();
}
