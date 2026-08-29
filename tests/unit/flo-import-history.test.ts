import { describe, expect, it } from 'vitest';

import {
  buildImportDoneProposal,
  checkConnection,
  countsForNumberingAudit,
  countsForPaymentScore,
  dedupeByKsefNumber,
  INVOICE_ORIGINS,
  isImported,
  isInvoiceOrigin,
  normalizeKsefNumber,
  planResume,
  STALLED_AFTER_HOURS,
  type ImportCandidate,
  type ImportProgress,
} from '@/lib/flo/functions/import-history';

/**
 * O-02 — podłączenie KSeF i import historii (krok 46).
 *
 * Definicja gotowości z planu: DWUKROTNY IMPORT = ZERO DUPLIKATÓW.
 */

const NOW = new Date('2026-09-16T09:00:00.000Z');

function doc(ksefNumber: string | null, invoiceNumber = 'FV/1'): ImportCandidate {
  return { ksefNumber, invoiceNumber };
}

// ═══════════════════════════════════════════════════════════════
// DEFINICJA GOTOWOŚCI — dwukrotny import
// ═══════════════════════════════════════════════════════════════

describe('dwukrotny import = zero duplikatów', () => {
  const batch = [
    doc('1234567890-20260801-ABCDEF-01', 'FV/2026/1'),
    doc('1234567890-20260802-ABCDEF-02', 'FV/2026/2'),
    doc('1234567890-20260803-ABCDEF-03', 'FV/2026/3'),
  ];

  it('pierwszy przebieg zaciąga wszystko', () => {
    const first = dedupeByKsefNumber(batch, new Set());
    expect(first.toImport).toHaveLength(3);
    expect(first.duplicates).toHaveLength(0);
  });

  it('DRUGI PRZEBIEG NIE ZACIĄGA NICZEGO', () => {
    const first = dedupeByKsefNumber(batch, new Set());
    const stored = new Set(first.toImport.map((d) => d.ksefNumber!));

    const second = dedupeByKsefNumber(batch, stored);
    expect(second.toImport).toHaveLength(0);
    expect(second.duplicates).toHaveLength(3);
  });

  it('duplikat WEWNĄTRZ paczki też odpada', () => {
    // Stronicowanie z nakładką zwraca ten sam dokument na dwóch stronach,
    // a import „od zera po restarcie" potrafi zdublować całą stronę.
    const overlapping = [...batch, batch[1]!, batch[2]!];
    const result = dedupeByKsefNumber(overlapping, new Set());
    expect(result.toImport).toHaveLength(3);
    expect(result.duplicates).toHaveLength(2);
  });

  it('odcisk trzyma się NUMERU KSeF, nie numeru własnego', () => {
    // Po imporcie z dwóch programów numery własne potrafią się powtórzyć.
    const sameOwnNumber = [
      doc('1234567890-20260801-ABCDEF-01', 'FV/1'),
      doc('1234567890-20260802-ABCDEF-02', 'FV/1'),
    ];
    expect(dedupeByKsefNumber(sameOwnNumber, new Set()).toImport).toHaveLength(2);
  });

  it('białe znaki i wielkość liter nie tworzą nowego dokumentu', () => {
    const stored = new Set(['1234567890-20260801-ABCDEF-01']);
    const result = dedupeByKsefNumber(
      [doc(' 1234567890-20260801-abcdef-01 ')],
      stored,
    );
    expect(result.toImport).toHaveLength(0);
    expect(normalizeKsefNumber(' abc def ')).toBe('ABCDEF');
  });

  it('dokument BEZ numeru KSeF nie wjeżdża po cichu', () => {
    // Nie da się go odcisnąć, więc przy kolejnym przebiegu wjechałby
    // drugi raz.
    const result = dedupeByKsefNumber([doc(null, 'FV/9')], new Set());
    expect(result.toImport).toHaveLength(0);
    expect(result.withoutKsefNumber).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Trwały znacznik pochodzenia
// ═══════════════════════════════════════════════════════════════

describe('pochodzenie dokumentu', () => {
  it('zna pięć źródeł', () => {
    expect(INVOICE_ORIGINS).toEqual([
      'app',
      'ksef_import',
      'ksef_inbox',
      'file_import',
      'ocr',
    ]);
    expect(isInvoiceOrigin('ksef_import')).toBe(true);
    expect(isInvoiceOrigin('cokolwiek')).toBe(false);
  });

  it('wszystko poza aplikacją to import', () => {
    expect(isImported('app')).toBe(false);
    for (const origin of INVOICE_ORIGINS.filter((o) => o !== 'app')) {
      expect(isImported(origin)).toBe(true);
    }
  });

  it('IMPORT NIE LICZY SIĘ DO OCENY KONTRAHENTA (K-03)', () => {
    // Historia z KSeF nie niesie dat zapłaty — liczenie jej dałoby każdemu
    // kontrahentowi ocenę „nie płaci".
    expect(countsForPaymentScore('app')).toBe(true);
    expect(countsForPaymentScore('ksef_import')).toBe(false);
    expect(countsForPaymentScore('file_import')).toBe(false);
  });

  it('IMPORT NIE LICZY SIĘ DO KONTROLI NUMERACJI', () => {
    // Zaimportowana numeracja pochodzi z innego programu; kontrola
    // alarmowałaby o luce u każdego, kto cokolwiek zaimportował.
    expect(countsForNumberingAudit('app')).toBe(true);
    expect(countsForNumberingAudit('ksef_import')).toBe(false);
  });

  it('nieznana wartość traktowana jak import, nie jak własna faktura', () => {
    // Bezpieczniejszy kierunek pomyłki: dokument wyłączony z oceny nie psuje
    // niczyich liczb, dokument wpuszczony po cichu psuje.
    expect(countsForPaymentScore('literówka')).toBe(false);
    expect(countsForNumberingAudit('literówka')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Agent mówi wprost, czego nie może
// ═══════════════════════════════════════════════════════════════

describe('sprawdzenie środowiska i uprawnień', () => {
  it('pełne uprawnienia na produkcji: bez zastrzeżeń', () => {
    const verdict = checkConnection({
      environment: 'production',
      scopes: ['InvoiceRead', 'InvoiceWrite'],
    });
    expect(verdict).toEqual({
      canRead: true,
      canSend: true,
      isRealData: true,
      limitation: '',
    });
  });

  it('ŚRODOWISKO TESTOWE mówi wprost, że to nie są prawdziwe dokumenty', () => {
    const verdict = checkConnection({
      environment: 'test',
      scopes: ['InvoiceRead', 'InvoiceWrite'],
    });
    expect(verdict.isRealData).toBe(false);
    expect(verdict.limitation).toContain('TESTOWYM');
    expect(verdict.limitation).toContain('nie są prawdziwymi dokumentami');
  });

  it('token tylko do odczytu mówi, że agent NIE WYŚLE faktury', () => {
    // Klient, który dowiaduje się o tym przy pierwszej wysyłce, ma problem
    // dziś; klient, który dowiaduje się przy podłączaniu, ma zadanie.
    const verdict = checkConnection({
      environment: 'production',
      scopes: ['InvoiceRead'],
    });
    expect(verdict.canSend).toBe(false);
    expect(verdict.limitation).toContain('tylko czytać');
    expect(verdict.limitation).toContain('nawet po Twoim zatwierdzeniu');
  });

  it('brak prawa odczytu mówi, że historia się nie zaciągnie', () => {
    const verdict = checkConnection({ environment: 'production', scopes: [] });
    expect(verdict.canRead).toBe(false);
    expect(verdict.limitation).toContain('nie zaciągnę historii');
  });
});

// ═══════════════════════════════════════════════════════════════
// Wznawianie
// ═══════════════════════════════════════════════════════════════

describe('wznawianie od miejsca przerwania', () => {
  function progress(overrides: Partial<ImportProgress> = {}): ImportProgress {
    return {
      announced: 143,
      saved: 60,
      continuationToken: 'tok-abc',
      lastPageAt: '2026-09-16T08:30:00.000Z',
      ...overrides,
    };
  }

  it('świeży token: kontynuujemy', () => {
    expect(planResume(progress(), NOW)).toEqual({
      action: 'continue',
      from: 'tok-abc',
      remaining: 83,
    });
  });

  it('brak tokenu: od początku', () => {
    expect(planResume(progress({ continuationToken: null }), NOW)).toEqual({
      action: 'restart',
      reason: 'no_token',
    });
  });

  it('token po terminie ważności: RESTART, nie kontynuacja', () => {
    // Kontynuacja wygasłym tokenem kończy się błędem, którego nie da się
    // odróżnić od awarii. Przed duplikatami broni odcisk, nie ten mechanizm.
    const stalled = progress({
      lastPageAt: new Date(NOW.getTime() - (STALLED_AFTER_HOURS + 1) * 3_600_000).toISOString(),
    });
    expect(planResume(stalled, NOW)).toEqual({ action: 'restart', reason: 'stalled' });
  });

  it('komplet zapisany: koniec', () => {
    expect(planResume(progress({ saved: 143 }), NOW)).toEqual({ action: 'done' });
  });
});

// ═══════════════════════════════════════════════════════════════
// Pierwsze zdanie agenta
// ═══════════════════════════════════════════════════════════════

describe('podsumowanie po imporcie', () => {
  const proposal = buildImportDoneProposal({
    tenantId: 't1',
    summary: {
      invoices: 143,
      regularContractors: 4,
      unpaid: 2,
      unpaidSince: 'czerwca',
      duplicatesSkipped: 0,
    },
    now: NOW,
  });

  it('mówi dokładnie to, co obiecuje plan', () => {
    // 143 kończy się na 3, więc bierze formę mnogą „faktury", nie „faktur".
    expect(proposal?.title).toBe('Mam 143 Twoje faktury z KSeF');
    expect(proposal?.body).toContain('Widzę 4 stałych klientów');
    expect(proposal?.body).toContain('2 faktury są niezapłacone z czerwca');
  });

  it('pokazuje, że dane zostały ZROZUMIANE, nie tylko przepisane', () => {
    expect(proposal?.payload?.regularContractors).toBe(4);
    expect(proposal?.payload?.unpaid).toBe(2);
  });

  it('odmienia liczebniki po polsku', () => {
    const one = buildImportDoneProposal({
      tenantId: 't1',
      summary: { invoices: 1, regularContractors: 1, unpaid: 1, duplicatesSkipped: 0 },
      now: NOW,
    });
    expect(one?.title).toBe('Mam 1 Twoją fakturę z KSeF');
    expect(one?.body).toContain('Widzę 1 stałego klienta');
    expect(one?.body).toContain('Jedna faktura jest niezapłacona');

    const few = buildImportDoneProposal({
      tenantId: 't1',
      summary: { invoices: 3, regularContractors: 2, unpaid: 5, duplicatesSkipped: 0 },
      now: NOW,
    });
    expect(few?.title).toBe('Mam 3 Twoje faktury z KSeF');
    expect(few?.body).toContain('5 faktur jest niezapłaconych');
  });

  it('czysta historia kończy się dobrą wiadomością', () => {
    const clean = buildImportDoneProposal({
      tenantId: 't1',
      summary: { invoices: 20, regularContractors: 0, unpaid: 0, duplicatesSkipped: 0 },
      now: NOW,
    });
    expect(clean?.body).toBe('Wszystko rozliczone.');
  });

  it('pominięte duplikaty są w DOWODACH, nie w treści', () => {
    // Klienta nie interesuje nasze stronicowanie; nas przy zgłoszeniu — tak.
    const withDupes = buildImportDoneProposal({
      tenantId: 't1',
      summary: { invoices: 143, regularContractors: 4, unpaid: 0, duplicatesSkipped: 12 },
      now: NOW,
    });
    expect(withDupes?.body).not.toContain('12');
    expect(withDupes?.evidence?.some((e) => e.label.includes('duplikaty: 12'))).toBe(true);
  });

  it('pusty import nie produkuje karty', () => {
    expect(
      buildImportDoneProposal({
        tenantId: 't1',
        summary: { invoices: 0, regularContractors: 0, unpaid: 0, duplicatesSkipped: 0 },
        now: NOW,
      }),
    ).toBeNull();
  });
});
