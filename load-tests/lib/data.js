import {
  randomString,
  randomIntBetween,
} from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Fikcyjny NIP do testów — NIGDY prawdziwy (AGENTS.md, KSEF_ENV=test).
// 10 cyfr; środowisko KSeF TEST nie weryfikuje sumy kontrolnej.
export function fakeNip() {
  let nip = '';
  for (let i = 0; i < 10; i += 1) {
    nip += randomIntBetween(0, 9).toString();
  }
  return nip;
}

// Losowa faktura do scenariusza "Wystawiający fakturę". Minimalny, ale
// kompletny payload — generator FA(3) z `lib/xml/` dostaje sensowne dane.
export function fakeInvoice() {
  const net = randomIntBetween(100, 10000);
  return {
    buyerNip: fakeNip(),
    buyerName: `Testowy Nabywca ${randomString(6)}`,
    items: [
      {
        name: `Usługa testowa ${randomString(4)}`,
        netPrice: net,
        vatRate: 23,
        quantity: 1,
      },
    ],
  };
}

// Minimalna atrapa pliku JPEG do scenariusza OCR — markery SOI/EOI + losowy
// wypełniacz. Wystarcza, by route /share-target przyjął upload i zakolejkował
// job OCR. Realny stress pipeline'u OCR (parsowanie obrazu) to osobny test
// w Kroku 3 — tu mierzymy wyłącznie ścieżkę upload + enqueue.
export function fakeJpegBytes(sizeBytes = 4096) {
  const arr = new Uint8Array(sizeBytes);
  // SOI (Start Of Image) + APP0 — przeglądarka/route rozpozna typ jako JPEG.
  arr[0] = 0xff;
  arr[1] = 0xd8;
  arr[2] = 0xff;
  arr[3] = 0xe0;
  for (let i = 4; i < sizeBytes - 2; i += 1) {
    arr[i] = randomIntBetween(0, 255);
  }
  // EOI (End Of Image).
  arr[sizeBytes - 2] = 0xff;
  arr[sizeBytes - 1] = 0xd9;
  return arr.buffer;
}

export { randomString, randomIntBetween };
