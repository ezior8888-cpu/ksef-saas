import http from 'k6/http';
import { group, sleep, check } from 'k6';
import { BASE_URL, standaloneOptions } from '../config.js';
import { assertCredentials } from '../lib/auth.js';
import { ensureLoggedIn } from '../lib/session.js';
import { checkPage } from '../lib/checks.js';
import { fakeJpegBytes, randomIntBetween } from '../lib/data.js';

// Scenariusz "OCR scanner" — login → ekran wydatków → upload zdjęcia paragonu →
// polling statusu OCR.
//
// Upload idzie przez REALNY route POST /share-target (PWA Web Share Target),
// który wewnętrznie woła `uploadExpensePhotoAction` i enqueue'uje job OCR —
// dzięki temu nie potrzebujemy ID Server Action. Route zwraca 303 z parametrem
// `ocr_pending=<jobId>` w Location.
//
// Polling modelujemy jako powtarzane GET-y na /expenses?ocr_pending=<id> —
// odwzorowuje obciążenie odczytami, które generuje realny klient. Ciężki
// pipeline OCR (parsowanie obrazu) jest osobnym stress-testem w Kroku 3.

export const options = standaloneOptions();

export function setup() {
  assertCredentials();
}

function think(min, max) {
  sleep(randomIntBetween(min, max));
}

export function journey() {
  if (!ensureLoggedIn()) return;

  group('ocr-scanner', () => {
    // Ekran wydatków / skanowania paragonów.
    const expenses = http.get(`${BASE_URL}/expenses`, {
      tags: { name: 'page_expenses' },
    });
    checkPage(expenses, 'page_expenses');

    // Robienie zdjęcia paragonu telefonem.
    think(3, 8);

    // Upload przez Web Share Target. redirects: 0 — chcemy odczytać 303
    // i wyciągnąć jobId z nagłówka Location.
    const upload = http.post(
      `${BASE_URL}/share-target`,
      { photo: http.file(fakeJpegBytes(4096), 'paragon.jpg', 'image/jpeg') },
      { tags: { name: 'ocr_upload' }, redirects: 0 },
    );
    const uploadOk = check(upload, {
      'ocr_upload: status 303': (r) => r.status === 303,
    });

    if (!uploadOk) return;

    // jobId z Location: /expenses?ocr_pending=<id>
    const location = upload.headers['Location'] || '';
    const match = location.match(/ocr_pending=([^&]+)/);
    const jobId = match ? match[1] : '';

    // Polling statusu OCR — realny klient odpytuje co kilka sekund.
    for (let i = 0; i < 4; i += 1) {
      sleep(randomIntBetween(2, 4));
      const poll = http.get(
        `${BASE_URL}/expenses${jobId ? `?ocr_pending=${jobId}` : ''}`,
        { tags: { name: 'ocr_poll' } },
      );
      checkPage(poll, 'ocr_poll');
    }
  });
}

export default function () {
  journey();
}
