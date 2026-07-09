import { describe, expect, it } from 'vitest';

import {
  coerceSeverity,
  enrichWithLineNumber,
  formatLastErrorPayload,
  matchByKeywords,
} from '@/lib/ksef/error-translator';
import { ksefNumericStatusCode } from '@/lib/ksef/normalize-status-code';

/**
 * TEST-1 + TEST-6 (audyt przedlaunchowy): pure logic tłumaczenia błędów KSeF.
 * Te funkcje decydują, jaki komunikat zobaczy użytkownik gdy faktura zostanie
 * odrzucona przez MF — i czy poprawnie klasyfikujemy błąd (retry vs nie).
 */

describe('coerceSeverity', () => {
  it('przepuszcza warning/info', () => {
    expect(coerceSeverity('warning')).toBe('warning');
    expect(coerceSeverity('info')).toBe('info');
  });
  it('wszystko inne ⇒ error (fail-safe)', () => {
    expect(coerceSeverity('error')).toBe('error');
    expect(coerceSeverity('krytyczny')).toBe('error');
    expect(coerceSeverity(null)).toBe('error');
    expect(coerceSeverity(undefined)).toBe('error');
    expect(coerceSeverity('')).toBe('error');
  });
});

describe('matchByKeywords — klasyfikacja błędów', () => {
  it('timeout ⇒ NETWORK_TIMEOUT, severity warning (retry-able)', () => {
    const r = matchByKeywords('Connection timed out after 30s');
    expect(r?.technicalCode).toBe('NETWORK_TIMEOUT');
    expect(r?.severity).toBe('warning');
  });

  it('401/unauthorized ⇒ AUTH_FAILED, error (nie retry)', () => {
    expect(matchByKeywords('401 Unauthorized')?.technicalCode).toBe('AUTH_FAILED');
    expect(matchByKeywords('authentication failed')?.severity).toBe('error');
  });

  it('429/rate limit ⇒ RATE_LIMIT warning', () => {
    expect(matchByKeywords('HTTP 429 too many requests')?.technicalCode).toBe('RATE_LIMIT');
  });

  it('5xx ⇒ SERVER_ERROR warning (Offline24 retry)', () => {
    expect(matchByKeywords('500 Internal Server Error')?.technicalCode).toBe('SERVER_ERROR');
    expect(matchByKeywords('503 Service Unavailable')?.technicalCode).toBe('SERVER_ERROR');
    expect(matchByKeywords('502 bad gateway')?.severity).toBe('warning');
  });

  it('invalid signature ⇒ INVALID_SIGNATURE error', () => {
    expect(matchByKeywords('Invalid signature on document')?.technicalCode).toBe('INVALID_SIGNATURE');
  });

  it('certyfikat wygasł ⇒ CERT_INVALID error', () => {
    expect(matchByKeywords('Certificate has expired')?.technicalCode).toBe('CERT_INVALID');
  });

  it('nieznany komunikat ⇒ null (fallthrough do DB/generic)', () => {
    expect(matchByKeywords('jakiś dziwny błąd bez wzorca xyz123')).toBeNull();
  });

  it('zwraca KOPIĘ (nie mutuje wzorca współdzielonego)', () => {
    const a = matchByKeywords('timeout');
    const b = matchByKeywords('timeout');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('enrichWithLineNumber — numer pozycji faktury', () => {
  const base = {
    id: 'x',
    error_code: 'E1',
    error_xpath: null,
    user_message_pl: 'Błąd w stawce VAT',
    technical_description: null,
    field_hint: 'vatRate',
    fix_suggestion: 'Popraw stawkę',
    severity: 'error',
    occurrence_count: 0,
    last_seen_at: null,
    created_at: '',
    updated_at: '',
  };

  it('wyciąga numer z FaWiersz[3] i mapuje field na lines.2.<pole>', () => {
    const r = enrichWithLineNumber(base, '/Faktura/FaWiersz[3]/StawkaPodatku', 'E1');
    expect(r.userMessage).toContain('Pozycja 3');
    expect(r.fieldHint).toBe('lines.2.vatRate'); // 0-indexed
  });

  it('podstawia {N} jeśli komunikat ma placeholder', () => {
    const r = enrichWithLineNumber(
      { ...base, user_message_pl: 'Pozycja {N} ma błędną stawkę' },
      '/Faktura/FaWiersz[5]/X',
      'E1',
    );
    expect(r.userMessage).toBe('Pozycja 5 ma błędną stawkę');
  });

  it('brak numeru w xpath ⇒ komunikat bez zmian', () => {
    const r = enrichWithLineNumber(base, '/Faktura/Naglowek', 'E1');
    expect(r.userMessage).toBe('Błąd w stawce VAT');
    expect(r.fieldHint).toBe('vatRate');
  });
});

describe('formatLastErrorPayload', () => {
  it('skleja kod + komunikat + suggestion + xpath', () => {
    const out = formatLastErrorPayload({
      userMessage: 'Zły NIP',
      fixSuggestion: 'Popraw NIP',
      fieldHint: 'buyer.nip',
      severity: 'error',
      technicalCode: 'E_NIP',
      rawXpath: '/Faktura/Nip',
    });
    expect(out).toContain('[E_NIP] Zły NIP');
    expect(out).toContain('Popraw NIP');
    expect(out).toContain('Pole UI: buyer.nip');
    expect(out).toContain('XPath: /Faktura/Nip');
  });

  it('minimalna wersja — tylko kod + komunikat', () => {
    const out = formatLastErrorPayload({
      userMessage: 'Błąd',
      severity: 'error',
      technicalCode: 'E',
    });
    expect(out).toBe('[E] Błąd');
  });
});

describe('ksefNumericStatusCode — string vs number (TEST-6)', () => {
  it('number przechodzi', () => {
    expect(ksefNumericStatusCode(200)).toBe(200);
    expect(ksefNumericStatusCode(150)).toBe(150);
  });
  it('string "200" ⇒ 200 (regresja: polling nie kończył się na ACCEPTED)', () => {
    expect(ksefNumericStatusCode('200')).toBe(200);
    expect(ksefNumericStatusCode('150')).toBe(150);
  });
  it('śmieci ⇒ NaN (a NaN===200 jest false, więc polling nie udaje sukcesu)', () => {
    expect(ksefNumericStatusCode('abc')).toBeNaN();
    expect(ksefNumericStatusCode(null)).toBeNaN();
    expect(ksefNumericStatusCode(undefined)).toBeNaN();
    expect(ksefNumericStatusCode({})).toBeNaN();
    expect(ksefNumericStatusCode(Infinity)).toBeNaN();
  });
});
