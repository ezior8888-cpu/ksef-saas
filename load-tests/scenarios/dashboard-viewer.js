import http from 'k6/http';
import { group, sleep } from 'k6';
import { BASE_URL, standaloneOptions } from '../config.js';
import { assertCredentials } from '../lib/auth.js';
import { ensureLoggedIn } from '../lib/session.js';
import { checkPage } from '../lib/checks.js';
import { randomIntBetween } from '../lib/data.js';

// Scenariusz "Dashboard viewer" — najczęstszy profil ruchu: użytkownik loguje
// się i przegląda kolejne ekrany. Czysto GET-owy, więc niezawodnie obciąża
// realne wąskie gardła: auth w middleware, render RSC, zapytania Supabase,
// cache Redis i materialized views z Fazy 21.

export const options = standaloneOptions();

export function setup() {
  assertCredentials();
}

// Czas namysłu — symuluje czytanie ekranu przez realnego użytkownika.
function think() {
  sleep(randomIntBetween(2, 5));
}

// Ekrany odwiedzane w trakcie jednej "sesji przeglądania".
const PAGES = [
  { path: '/dashboard', label: 'page_dashboard' },
  { path: '/invoices', label: 'page_invoices' },
  { path: '/contractors', label: 'page_contractors' },
  { path: '/reports', label: 'page_reports' },
  { path: '/inbox', label: 'page_inbox' },
];

export function journey() {
  if (!ensureLoggedIn()) return;

  group('dashboard-viewer', () => {
    for (const page of PAGES) {
      const res = http.get(`${BASE_URL}${page.path}`, {
        tags: { name: page.label },
      });
      checkPage(res, page.label);
      think();
    }
  });
}

export default function () {
  journey();
}
