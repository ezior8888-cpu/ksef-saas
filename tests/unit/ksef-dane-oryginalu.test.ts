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

/**
 * D-A4-1b-3 PR B: decyzja klienta przy 440. Zapis `original_check.decision`
 * (00148) wraca z odczytu; notatki karty bez „zajmujemy się” i „operator”
 * (reguła 07.10, ta sama przyczyna co notatka domyślna — reguła 3 protokołu),
 * z adresem pomocy; `known-number` ma własną notatkę „dokument {Y}” i odnośnik
 * do niego (C16).
 */
const PR_B_DOWNLOAD_REFUSED =
  'Nie mogliśmy pobrać treści tej faktury z KSeF — sprawdzimy ją ponownie automatycznie (zwykle w ciągu 2 dni); pytania: pomoc FaktFlow (pomoc@faktflow.pl), podaj numer faktury. Nie wystawiaj tej faktury ponownie.';
const PR_B_PENDING =
  'Nie udało się jeszcze sprawdzić treści tej faktury w KSeF — sprawdzimy ponownie automatycznie (zwykle w ciągu 2 dni). Jeśli ten komunikat zostanie dłużej, napisz do nas: pomoc@faktflow.pl, podając numer faktury. Nie wystawiaj tej faktury ponownie.';
const prBDefault = (doc: string) =>
  `${doc} nie została przyjęta, bo KSeF ma już fakturę Twojej firmy o tym numerze (dane wyżej). Tej sprawy nie rozstrzygniesz jeszcze w panelu — pytania: pomoc FaktFlow (pomoc@faktflow.pl), podaj numer faktury. Nie wystawiaj tej faktury ponownie.`;
const prBOwnHistory = (doc: string) =>
  `${doc} nie została przyjęta, bo KSeF ma już wcześniejszą wersję tej faktury wysłaną z FaktFlow (dane wyżej). Tej sprawy nie rozstrzygniesz jeszcze w panelu — pytania: pomoc FaktFlow (pomoc@faktflow.pl), podaj numer faktury. Nie wystawiaj tej faktury ponownie.`;
const prBKnownNumber = (y: string, nr: string) =>
  `W FaktFlow numer KSeF ${K} ma już dokument ${y} — te dane się nie zgadzają i musimy je wyjaśnić, zanim zdecydujesz, czym jest ten dokument. Napisz do nas: pomoc@faktflow.pl, podając numer ${nr}. Nie wystawiaj tej faktury ponownie.`;

describe('U2a: parseDuplicateCheck — decyzja klienta (00148)', () => {
  it('zapisana decyzja wraca jako {choice, via, at}; zniekształcona — bez klucza', () => {
    const decided = { ...check(), decision: { choice: 'other_sale', via: 'client', at: '2026-10-05T10:00:00.000Z', reason: 'faktflow-original', env: 'test' } };
    expect(parseDuplicateCheck(JSON.parse(JSON.stringify(decided)))?.decision)
      .toEqual({ choice: 'other_sale', via: 'client', at: '2026-10-05T10:00:00.000Z' });
    const byOperator = { ...check(), decision: { choice: 'same_sale', via: 'operator', at: '2026-10-05T11:00:00.000Z' } };
    expect(parseDuplicateCheck(byOperator)?.decision).toEqual({ choice: 'same_sale', via: 'operator', at: '2026-10-05T11:00:00.000Z' });
    for (const decision of [{ choice: 'cokolwiek', via: 'client', at: '2026-10-05T10:00:00.000Z' }, { choice: 'same_sale', via: 'ktoś', at: 'x' }, 'other_sale', null]) {
      expect(parseDuplicateCheck({ ...check(), decision }), JSON.stringify(decision)).not.toHaveProperty('decision');
    }
  });

  it('strażnik: bez klucza decision zapis wraca bez niego (odczyt PR A bez zmian)', () => {
    expect(parseDuplicateCheck(JSON.parse(JSON.stringify(check())))).not.toHaveProperty('decision');
  });
});

describe('U2b–U2d: notatki karty bez „zajmujemy się” i operatora, z adresem pomocy; known-number z odnośnikiem (C16)', () => {
  const NOTE_CASES: Array<[string, Partial<KsefDuplicateCheck>]> = [
    ['download-refused (nie 403)', { reason: 'download-refused', httpStatus: 404, summary: null, sha256: null }],
    ['download-pending', { reason: 'download-pending' }],
    ['storage-pending', { reason: 'storage-pending' }],
    ['archive-pending', { reason: 'archive-pending' }],
    ['domyślna (faktflow-original)', {}],
    ['domyślna (no-own-file)', { reason: 'no-own-file', summary: { ...check().summary!, systemInfo: 'Inny Program' } }],
    ['wcześniejsza wersja (ownHistory)', { ownHistory: true }],
    ['known-number', { reason: 'known-number', knownInvoice: { id: 'y', internalNumber: 'FV/Y' } }],
  ];

  it.each(NOTE_CASES)('U2b: %s — bez „operator” i „zajmujemy się”', (_name, over) => {
    const note = describeDuplicateOriginal('FV/1', K, check(over)).note;
    expect(note).not.toMatch(/operator/i);
    expect(note).not.toMatch(/zajmujemy się/i);
  });

  it('U2c: notatka domyślna i pozostałe — adres pomocy, tekst słowo w słowo', () => {
    expect(describeDuplicateOriginal('FV/1', K, check()).note).toBe(prBDefault('Faktura FV/1'));
    expect(describeDuplicateOriginal(null, K, check({ reason: 'no-own-file' })).note).toBe(prBDefault('Ta faktura'));
    expect(describeDuplicateOriginal('FV/1', K, check()).note).toContain('pomoc@faktflow.pl');
    expect(describeDuplicateOriginal('FV/1', K, check({ ownHistory: true })).note).toBe(prBOwnHistory('Faktura FV/1'));
    expect(describeDuplicateOriginal('FV/1', K, check({ reason: 'download-refused', httpStatus: 404 })).note).toBe(PR_B_DOWNLOAD_REFUSED);
    for (const reason of ['download-pending', 'storage-pending', 'archive-pending'] as const) {
      expect(describeDuplicateOriginal('FV/1', K, check({ reason })).note, reason).toBe(PR_B_PENDING);
    }
  });

  it('U2d: known-number — „dokument {Y}” i odnośnik „Zobacz dokument {Y}”; bez Y — „bez numeru” i bez odnośnika', () => {
    const v = describeDuplicateOriginal('FV/1', K, check({ reason: 'known-number', knownInvoice: { id: 'y', internalNumber: 'FV/Y' } }));
    expect(v.note).toBe(prBKnownNumber('FV/Y', 'FV/1'));
    expect(v.note).toContain('dokument FV/Y');
    expect(v.link).toEqual({ href: '/invoices/y', label: 'Zobacz dokument FV/Y' });
    const withoutNumber = describeDuplicateOriginal('FV/1', K, check({ reason: 'known-number', knownInvoice: { id: 'y', internalNumber: null } }));
    expect(withoutNumber.note).toBe(prBKnownNumber('bez numeru', 'FV/1'));
    expect(withoutNumber.link).toEqual({ href: '/invoices/y', label: 'Zobacz dokument bez numeru' });
    const noKnown = describeDuplicateOriginal('FV/1', K, check({ reason: 'known-number', knownInvoice: null }));
    expect(noKnown.link).toBeNull();
  });

  it('U2d: każdy inny powód (i brak zapisu) — link: null', () => {
    for (const reason of ['download-refused', 'download-pending', 'storage-pending', 'archive-pending',
      'faktflow-original', 'same-content-other-program', 'no-own-file', 'archive-conflict'] as const) {
      // knownInvoice przy innym powodzie nie daje odnośnika (odnośnik tylko przy known-number).
      const v = describeDuplicateOriginal('FV/1', K, check({ reason, knownInvoice: { id: 'y', internalNumber: 'FV/Y' } }));
      expect(v.link, reason).toBeNull();
    }
    expect(describeDuplicateOriginal('FV/1', K, null).link).toBeNull();
  });

  it('strażnik: notatka 403 bez zmian (InvoiceRead, Ustawienia → KSeF)', () => {
    const note = describeDuplicateOriginal('FV/1', K, check({ reason: 'download-refused', httpStatus: 403, summary: null, sha256: null })).note;
    expect(note).toBe(
      'Nie mogliśmy pobrać treści tej faktury z KSeF — dane logowania KSeF w FaktFlow nie mają uprawnienia do odczytu ' +
      'faktur (InvoiceRead). Sprawdź uprawnienia w Aplikacji Podatnika KSeF albo podłącz KSeF ponownie w Ustawieniach → KSeF. ' +
      'Nie wystawiaj tej faktury ponownie.',
    );
  });
});
