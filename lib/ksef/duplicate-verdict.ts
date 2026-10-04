/**
 * Werdykt przy cudzym 440 (decyzja D-A4-1, plan „zero zgubionych faktur”):
 * KSeF ma już fakturę tej firmy o tym numerze (duplikat wykrywa po NIP
 * sprzedawcy, rodzaju faktury i P_2), a sesji oryginału nie ma w historii
 * tej faktury — albo jest, ale treść mogła się zmienić. Porównujemy plik
 * oryginału pobrany z KSeF z naszymi plikami.
 *
 * Kierunek bezpieczny prawnie: „numer zajęty” (klient wystawia z nowym
 * numerem) tylko wtedy, gdy oryginał NIE pochodzi z FaktFlow. Każda
 * wątpliwość — oryginał z FaktFlow o innej treści albo innej dacie
 * wytworzenia — idzie do operatora, bo może to być nasza wcześniejsza
 * wysyłka tej samej sprzedaży (ponowne wystawienie = dwie faktury).
 *
 * Czysty moduł: bez KSeF i bazy.
 */

import { createHash } from 'node:crypto';

/** `<SystemInfo>` w nagłówku każdego pliku FA(3) z FaktFlow (fa3-generator, korekty, ZAL/ROZ). */
export const FAKTFLOW_SYSTEM_INFO = 'KSeF SaaS v1.0';

export type DuplicateVerdict =
  /**
   * Nasza faktura: oryginał to bajt w bajt bieżący plik — albo plik
   * wcześniejszej próby, której treść poza nagłówkiem jest ta sama co teraz.
   */
  | 'identical'
  /**
   * Nie wolno rozstrzygnąć automatycznie — operator: oryginał wygenerował
   * FaktFlow (może to być nasza wcześniejsza wysyłka tej sprzedaży) albo ma
   * tę samą treść co nasza faktura, tylko inny nagłówek (ta sama sprzedaż).
   */
  | 'operator'
  /** Oryginał z innego programu o innej treści — numer zajęty. */
  | 'foreign';

export type OperatorReason = 'faktflow-original' | 'same-content-other-program';

export interface OriginalInvoiceSummary {
  systemInfo: string | null;
  number: string | null;
  issueDate: string | null;
  buyerNip: string | null;
  buyerName: string | null;
  gross: string | null;
  currency: string | null;
}

export interface DuplicateComparison {
  verdict: DuplicateVerdict;
  /** Przy `operator` — dlaczego automat nie rozstrzyga. */
  reason: OperatorReason | null;
  /** Skrót (Base64) naszego pliku zgodnego z oryginałem — przy `identical`. */
  matchedHash: string | null;
  /** Treść zgodna z naszą poza nagłówkiem (data wytworzenia, SystemInfo) — tylko informacja dla operatora. */
  sameContentExceptHeader: boolean;
  summary: OriginalInvoiceSummary;
}

const sha256Base64 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('base64');

/** Skrót z bazy (hex, `request_payload_hash`) → Base64 jak w KSeF; `null` dla wartości innej niż 64 znaki hex. */
export function hexHashToBase64(hex: string | null | undefined): string | null {
  return hex && /^[0-9a-f]{64}$/i.test(hex) ? Buffer.from(hex, 'hex').toString('base64') : null;
}

function element(xml: string, name: string): string | null {
  const m = new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([^<]*)</(?:[\\w.-]+:)?${name}>`).exec(xml);
  return m ? m[1]!.trim() : null;
}

function block(xml: string, name: string): string | null {
  const m = new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`).exec(xml);
  return m ? m[1]! : null;
}

/** Dane oryginału do komunikatu (klient decyduje: ta sama sprzedaż czy inna). */
export function summarizeInvoiceXml(xml: string): OriginalInvoiceSummary {
  const buyer = block(xml, 'Podmiot2') ?? '';
  return {
    systemInfo: element(xml, 'SystemInfo'),
    number: element(xml, 'P_2'),
    issueDate: element(xml, 'P_1'),
    buyerNip: element(buyer, 'NIP'),
    buyerName: element(buyer, 'Nazwa'),
    gross: element(xml, 'P_15'),
    currency: element(xml, 'KodWaluty'),
  };
}

/** Treść bez `<Naglowek>` i bez białych znaków między znacznikami — porównanie „ta sama treść, inny nagłówek”. */
function withoutHeader(xml: string): string {
  return xml
    .replace(/^﻿/, '')
    .replace(/<(?:[\w.-]+:)?Naglowek(?:\s[^>]*)?>[\s\S]*?<\/(?:[\w.-]+:)?Naglowek>/, '')
    .replace(/>\s+</g, '><')
    .trim();
}

/**
 * Porównanie pliku oryginału z naszymi plikami tej faktury.
 *  - `currentHashBase64` — skrót pliku, który właśnie odrzucono jako duplikat;
 *  - `earlierHashesBase64` — skróty wcześniejszych prób z historii;
 *  - `ourXml` — bieżący plik (treść do porównania poza nagłówkiem).
 * Zgodność z WCZEŚNIEJSZĄ próbą nie wystarcza: po powrocie do szkicu treść
 * mogła się zmienić, a wtedy numer KSeF należy do starej treści. Taka
 * zgodność jest „nasza” tylko, gdy treść poza nagłówkiem jest ta sama co teraz;
 * inaczej — operator.
 */
export function compareDuplicate(input: {
  originalBytes: Buffer;
  currentHashBase64: string | null | undefined;
  earlierHashesBase64: ReadonlyArray<string | null | undefined>;
  ourXml?: string | null;
}): DuplicateComparison {
  const originalXml = input.originalBytes.toString('utf8');
  const summary = summarizeInvoiceXml(originalXml);
  const sameContentExceptHeader = Boolean(input.ourXml) && withoutHeader(input.ourXml!) === withoutHeader(originalXml);
  const hash = sha256Base64(input.originalBytes);
  if (input.currentHashBase64 && input.currentHashBase64 === hash) {
    return { verdict: 'identical', reason: null, matchedHash: hash, sameContentExceptHeader: true, summary };
  }
  if (sameContentExceptHeader && input.earlierHashesBase64.some((h) => h && h === hash)) {
    return { verdict: 'identical', reason: null, matchedHash: hash, sameContentExceptHeader, summary };
  }
  if (summary.systemInfo === FAKTFLOW_SYSTEM_INFO) {
    return { verdict: 'operator', reason: 'faktflow-original', matchedHash: null, sameContentExceptHeader, summary };
  }
  // Inny program, ale ta sama treść co nasza — ta sama sprzedaż, nie „numer zajęty”.
  if (sameContentExceptHeader) {
    return { verdict: 'operator', reason: 'same-content-other-program', matchedHash: null, sameContentExceptHeader, summary };
  }
  return { verdict: 'foreign', reason: null, matchedHash: null, sameContentExceptHeader, summary };
}

function describeOriginal(ksefNumber: string, s: OriginalInvoiceSummary): string {
  const parts = [`numer KSeF ${ksefNumber}`];
  if (s.issueDate) parts.push(`z ${s.issueDate}`);
  const buyer = [s.buyerName, s.buyerNip ? `NIP ${s.buyerNip}` : null].filter(Boolean).join(', ');
  if (buyer) parts.push(`dla ${buyer}`);
  if (s.gross) parts.push(`na ${s.gross} ${s.currency ?? 'PLN'}`);
  return parts.join(', ');
}

/** Komunikat `KSEF_NUMBER_TAKEN` dla klienta (trafia do `last_error`). */
export function numberTakenMessage(invoiceNumber: string, ksefNumber: string, s: OriginalInvoiceSummary): string {
  return (
    `W KSeF jest już faktura Twojej firmy o numerze ${invoiceNumber} (${describeOriginal(ksefNumber, s)})` +
    `${s.systemInfo ? `, wystawiona w programie „${s.systemInfo}”` : ', wystawiona poza FaktFlow'}. ` +
    'Jeśli to ta sama sprzedaż — nie wystawiaj jej ponownie (zmiany: korekta tamtej faktury). ' +
    'Jeśli to inna sprzedaż — wróć do szkicu, usuń go i wystaw fakturę z nowym numerem.'
  );
}

/** Komunikat werdyktu „operator” (trafia do `last_error`; klient widzi „zajmujemy się”). */
export function operatorVerdictMessage(ksefNumber: string, cmp: DuplicateComparison): string {
  const original = describeOriginal(ksefNumber, cmp.summary);
  if (cmp.reason === 'same-content-other-program') {
    return (
      `KSeF ma już fakturę o tym numerze (${original}) z tą samą treścią, wystawioną w programie ` +
      `„${cmp.summary.systemInfo ?? 'nieznany'}” — to ta sama sprzedaż. Nie wystawiaj jej ponownie; do uzgodnienia przez operatora.`
    );
  }
  return (
    `KSeF ma już fakturę o tym numerze (${original}) wygenerowaną przez FaktFlow, ` +
    `ale ${cmp.sameContentExceptHeader ? 'z inną datą wytworzenia (treść zgodna)' : 'o innej treści'}. ` +
    'Najpewniej to wcześniejsza wysyłka tej faktury — do uzgodnienia przez operatora; nie wystawiaj jej ponownie.'
  );
}
