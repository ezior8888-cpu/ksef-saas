import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL } from '../config.js';
import { assertCredentials } from '../lib/auth.js';
import { ensureLoggedIn } from '../lib/session.js';
import { fakeJpegBytes, randomIntBetween } from '../lib/data.js';

// Stress-test pipeline'u OCR — utrzymuje ~100 użytkowników uploadujących
// paragony jednocześnie przez realny route POST /share-target. Job processOcr
// ma `concurrency: { limit: 5 }`, więc test pokazuje, jak szybko drenuje się
// kolejka OCR i czy synchroniczny upload nie degraduje przy 100 concurrent.
//
//   k6 run load-tests/stress/ocr-pipeline.js -e VUS=100 -e DURATION=2m \
//     -e BASE_URL=... -e LOAD_TEST_PASSWORD=...

export const options = {
  scenarios: {
    ocr: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 100),
      duration: __ENV.DURATION || '2m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1500'],
  },
};

export function setup() {
  assertCredentials();
}

export default function () {
  if (!ensureLoggedIn()) return;

  // redirects: 0 — route zwraca 303; chcemy zmierzyć sam upload bez follow.
  const res = http.post(
    `${BASE_URL}/share-target`,
    {
      photo: http.file(
        fakeJpegBytes(randomIntBetween(3000, 8000)),
        'paragon.jpg',
        'image/jpeg',
      ),
    },
    { tags: { name: 'ocr_upload' }, redirects: 0 },
  );

  check(res, { 'ocr_upload: status 303': (r) => r.status === 303 });
  sleep(randomIntBetween(1, 3));
}
