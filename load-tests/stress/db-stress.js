import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL } from '../config.js';
import { assertCredentials } from '../lib/auth.js';
import { ensureLoggedIn } from '../lib/session.js';
import { checkPage } from '../lib/checks.js';
import { randomIntBetween } from '../lib/data.js';

// Stress-test bazy danych — utrzymuje stałą, wysoką liczbę równoległych
// użytkowników bijących w ścieżki odczytowe trafiające wprost do Postgresa
// (paginacja kursorowa listy faktur, lista kontrahentów, raporty/agregaty).
// Cel: ocenić, jak pooler Supabase i CPU bazy znoszą 1000 concurrent.
//
// W TRAKCIE BIEGU obserwuj dashboard Supabase: liczbę połączeń, CPU, slow
// queries. Definition of Done Fazy 34: utilization bazy < 70%.
//
// Próg p95 jest tu luźniejszy (800 ms) niż budżet docelowy (500 ms) — to
// świadomy stress ponad realistyczny miks; budżet 500 ms weryfikuje main.js.
//
//   k6 run load-tests/stress/db-stress.js -e VUS=1000 -e DURATION=3m \
//     -e BASE_URL=... -e LOAD_TEST_PASSWORD=...

export const options = {
  scenarios: {
    db: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 1000),
      duration: __ENV.DURATION || '3m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<800'],
  },
};

export function setup() {
  assertCredentials();
}

// Ścieżki najmocniej obciążające bazę danych.
const DB_HEAVY = ['/invoices', '/contractors', '/reports'];

export default function () {
  if (!ensureLoggedIn()) return;
  const path = DB_HEAVY[randomIntBetween(0, DB_HEAVY.length - 1)];
  const res = http.get(`${BASE_URL}${path}`, { tags: { name: `db${path}` } });
  checkPage(res, `db${path}`);
  sleep(randomIntBetween(1, 2));
}
