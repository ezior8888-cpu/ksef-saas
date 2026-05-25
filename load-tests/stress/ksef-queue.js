import http from 'k6/http';
import { check } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { fakeNip } from '../lib/data.js';

// Stress-test kolejki KSeF — zalewa Inngest 10 000 eventami
// `invoice/submit.requested`. Weryfikuje ingestion Inngest oraz zachowanie
// throttle/concurrency z Fazy 23 (limit 100 + 60/min per tenant).
//
// TRYB DOMYŚLNY (bez seedowania): eventy odnoszą się do nieistniejących
// faktur, więc joby fail-fast na pobraniu z DB — to i tak testuje kolejkę,
// dispatch i throttling. Aby zmierzyć PEŁNY pipeline KSeF (z realną wysyłką
// do KSEF_ENV=test), najpierw zaseeduj faktury i uruchom z prawdziwymi ID.
//
// INNGEST_EVENT_KEY — klucz z dashboardu Inngest (Manage → Event Keys).
//
//   k6 run load-tests/stress/ksef-queue.js \
//     -e INNGEST_EVENT_KEY=... -e TENANT_ID=<uuid> -e COUNT=10000

const COUNT = Number(__ENV.COUNT || 10000);
const EVENT_KEY = __ENV.INNGEST_EVENT_KEY || '';
const TENANT_ID = __ENV.TENANT_ID || '';
// Endpoint Inngest Cloud przyjmujący eventy.
const INNGEST_URL = `https://inn.gs/e/${EVENT_KEY}`;

export const options = {
  scenarios: {
    flood: {
      executor: 'shared-iterations',
      vus: Number(__ENV.VUS || 200),
      iterations: COUNT,
      maxDuration: __ENV.MAX_DURATION || '10m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

export function setup() {
  if (!EVENT_KEY) {
    throw new Error(
      'Brak INNGEST_EVENT_KEY — pobierz klucz eventów z dashboardu Inngest.',
    );
  }
  if (!TENANT_ID) {
    throw new Error('Brak TENANT_ID — podaj UUID tenanta testowego.');
  }
}

export default function () {
  const payload = JSON.stringify({
    name: 'invoice/submit.requested',
    data: {
      tenantId: TENANT_ID,
      invoiceId: uuidv4(),
      nip: fakeNip(),
      // Marker syntetyczny — job rozpozna, że to event loadtestowy.
      invoice: { syntheticLoadTest: true },
    },
  });

  const res = http.post(INNGEST_URL, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'inngest_event' },
  });

  check(res, { 'inngest: event przyjęty (200)': (r) => r.status === 200 });
}
