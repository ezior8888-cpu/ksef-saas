import { describe, expect, it } from 'vitest';

import {
  describeDuplicateOriginal,
  mergeDuplicateCheck,
  parseDuplicateCheck,
  type KsefDuplicateCheck,
} from '@/lib/ksef/duplicate-check';

/**
 * D-A4-1b-3, PR A: dane oryginału przy nierozstrzygniętym 440
 * (`ksef_submissions.original_check`, 00144) — odczyt z bazy i panel dla
 * klienta. Klient ma widzieć FAKTY z KSeF i nigdy przycisku, którego nie ma.
 */

const K = '5260001246-20260928-0100A0B0C0D0-1A';
const check = (over: Partial<KsefDuplicateCheck> = {}): KsefDuplicateCheck => ({
  v: 1, env: 'test', checkedAt: '2026-10-04T12:00:00Z', reason: 'faktflow-original',
  sha256: 'a'.repeat(64), archivePath: `t/ksef-import/${K}.xml`, sizeBytes: 100,
  summary: { systemInfo: 'KSeF SaaS v1.0', number: 'FV/1', issueDate: '2026-09-28', buyerNip: '5252241585', buyerName: 'Klient', gross: '123.00', currency: 'PLN' },
  sameContentExceptHeader: false, ownHistory: false, acquiredAt: '2026-09-28T07:15:00.000Z', httpStatus: null, knownInvoice: null,
  recheck: null,
  ...over,
});

describe('mergeDuplicateCheck — nieudane ponowne sprawdzenie nie kasuje danych oryginału', () => {
  const full = check();
  const failedRecheck = (reason: 'download-pending' | 'download-refused' | 'storage-pending', over: Partial<KsefDuplicateCheck> = {}) =>
    check({ reason, sha256: null, archivePath: null, sizeBytes: null, summary: null, sameContentExceptHeader: null,
      ownHistory: null, acquiredAt: null, httpStatus: 503, checkedAt: '2026-10-06T10:00:00Z', ...over });

  it('pobranie nieudane → zostają dane z udanego sprawdzenia, wynik próby w recheck', () => {
    expect(mergeDuplicateCheck(full, failedRecheck('download-pending'))).toEqual({
      ...full, recheck: { reason: 'download-pending', httpStatus: 503, checkedAt: '2026-10-06T10:00:00Z' },
    });
  });

  it('nowe dane oryginału, znany numer albo inne środowisko → nowy zapis w całości', () => {
    const fresh = check({ sha256: 'b'.repeat(64), checkedAt: '2026-10-06T10:00:00Z' });
    expect(mergeDuplicateCheck(full, fresh)).toEqual({ ...fresh, recheck: null });
    const known = check({ reason: 'known-number', sha256: null, summary: null, knownInvoice: { id: 'y', internalNumber: 'FV/Y' } });
    expect(mergeDuplicateCheck(full, known)).toEqual({ ...known, recheck: null });
    const prod = failedRecheck('download-pending', { env: 'production' });
    expect(mergeDuplicateCheck(full, prod)).toEqual({ ...prod, recheck: null });
    expect(mergeDuplicateCheck(null, failedRecheck('download-refused'))).toMatchObject({ reason: 'download-refused', recheck: null });
  });
});

describe('parseDuplicateCheck', () => {
  it('zapis runnera wraca bez zmian', () => {
    const c = check({
      knownInvoice: { id: 'inna', internalNumber: 'FV/INNA/1' }, httpStatus: 403,
      recheck: { reason: 'download-refused', httpStatus: 403, checkedAt: '2026-10-06T10:00:00Z' },
    });
    expect(parseDuplicateCheck(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });

  it('brak, inna wersja albo nieznany powód → null (stary albo obcy zapis nie psuje karty)', () => {
    expect(parseDuplicateCheck(null)).toBeNull();
    expect(parseDuplicateCheck({ ...check(), v: 2 })).toBeNull();
    expect(parseDuplicateCheck({ ...check(), reason: 'cokolwiek' })).toBeNull();
    expect(parseDuplicateCheck('tekst')).toBeNull();
  });
});

describe('describeDuplicateOriginal — panel dla klienta', () => {
  it('dane oryginału: numer KSeF, data nadania, numer, data, nabywca, kwota, program', () => {
    const v = describeDuplicateOriginal('FV/1', K, check());
    expect(v.title).toBe('W KSeF jest już faktura o tym numerze');
    expect(v.rows).toEqual([
      { label: 'Numer KSeF', value: K },
      { label: 'Numer nadany w KSeF', value: '2026-09-28' },
      { label: 'Numer faktury', value: 'FV/1' },
      { label: 'Data wystawienia', value: '2026-09-28' },
      { label: 'Nabywca', value: 'Klient, NIP 5252241585' },
      { label: 'Kwota brutto', value: '123.00 PLN' },
      { label: 'Program', value: 'FaktFlow' },
    ]);
    expect(v.note).toContain('Faktura FV/1');
    expect(v.note).toContain('Nie wystawiaj tej faktury ponownie');
  });

  it('bez danych (oryginału nie pobrano) — numer KSeF i data z numeru; nie udaje, że zna treść', () => {
    const v = describeDuplicateOriginal('FV/1', K, null);
    expect(v.rows).toEqual([
      { label: 'Numer KSeF', value: K },
      { label: 'Numer nadany w KSeF', value: '2026-09-28' },
    ]);
  });

  it('403: mówi, co klient ma zrobić (uprawnienie InvoiceRead), i żeby nie wystawiał ponownie', () => {
    const v = describeDuplicateOriginal('FV/1', K, check({ reason: 'download-refused', httpStatus: 403, summary: null, sha256: null }));
    expect(v.note).toContain('InvoiceRead');
    expect(v.note).toContain('Nie wystawiaj tej faktury ponownie');
  });

  it('sprawdzanie nieudane chwilowo (pobranie, magazyn, archiwum) — panel widać dopiero po wyczerpaniu ponowień, więc bez „odśwież za kilka minut”', () => {
    for (const reason of ['download-pending', 'storage-pending', 'archive-pending'] as const) {
      const note = describeDuplicateOriginal('FV/1', K, check({ reason })).note;
      expect(note).not.toMatch(/odśwież/);
      expect(note).toContain('sprawdzimy ponownie automatycznie');
      expect(note).toContain('Nie wystawiaj tej faktury ponownie');
    }
  });

  it('data nadania numeru po polsku (Europe/Warsaw), nie dzień w UTC', () => {
    const v = describeDuplicateOriginal('FV/1', K, check({ acquiredAt: '2026-09-28T22:30:00.000Z' }));
    expect(v.rows).toContainEqual({ label: 'Numer nadany w KSeF', value: '2026-09-29' });
  });

  it('oryginał to wcześniejsza wersja TEJ faktury (ownHistory) — tak to nazywamy', () => {
    const note = describeDuplicateOriginal('FV/1', K, check({ ownHistory: true })).note;
    expect(note).toContain('wcześniejsz');
    expect(note).toContain('Nie wystawiaj');
  });

  it('403: nie zakłada logowania tokenem — wskazuje też Ustawienia → KSeF', () => {
    const note = describeDuplicateOriginal('FV/1', K, check({ reason: 'download-refused', httpStatus: 403 })).note;
    expect(note).toContain('Ustawienia');
  });

  it('dane z udanego sprawdzenia mają pierwszeństwo przed nieudaną próbą (recheck)', () => {
    const v = describeDuplicateOriginal('FV/1', K, check({ recheck: { reason: 'download-pending', httpStatus: 503, checkedAt: '2026-10-06T10:00:00Z' } }));
    expect(v.rows).toContainEqual({ label: 'Kwota brutto', value: '123.00 PLN' });
    expect(v.note).not.toMatch(/odśwież/);
  });

  it('żaden komunikat nie obiecuje przycisku decyzji ani nie każe wystawiać od nowa', () => {
    for (const reason of ['known-number', 'download-refused', 'download-pending', 'storage-pending', 'archive-pending',
      'faktflow-original', 'same-content-other-program', 'no-own-file', 'archive-conflict'] as const) {
      const note = describeDuplicateOriginal('FV/1', K, check({ reason })).note;
      expect(note).not.toMatch(/kliknij|wybierz|przycisk|poprosimy/i);
      expect(note).not.toMatch(/wystaw (ją|fakturę) (ponownie|od nowa)/i);
    }
  });
});
