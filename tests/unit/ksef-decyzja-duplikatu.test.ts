import { describe, expect, it } from 'vitest';

import { formatWarsawDateTime } from '@/lib/format/warsaw-date';
import { KSEF_SEND_MESSAGES } from '@/lib/invoices/ksef-send-policy';
import {
  DUPLICATE_DECISION_SQL_TEXTS,
  DUPLICATE_DECISION_TEXTS,
  duplicateCheckAllows,
  duplicateDecisionOptions,
  fillSqlText,
  retiredDraftSendRefusal,
  retiredDraftView,
} from '@/lib/ksef/duplicate-decision';

import {
  decisionFacts,
  DUP_DECIDED_AT,
  DUP_K,
  DUP_K2,
  DUP_KNOWN_ID,
  DUP_KNOWN_NUMBER,
  DUP_NR,
  DUP_PROGRAM,
  DUP_SHA,
  DUPLICATE_CHECK_CASES,
  EXPECTED_SQL_TEXTS,
  fillExpected,
  knownNumberCheck,
  knownNumberFacts,
  numberTakenRow,
  olderSentRow,
  validCheck,
  type DuplicateFactsShape,
  type DuplicateFactsSubmission,
} from './helpers/ksef-duplicate-decision-cases';

/**
 * D-A4-1b-3 PR B (plan „zero zgubionych faktur”, decyzje Bartosza 04.10
 * i 07.10.2026): czysta polityka decyzji klienta przy nierozstrzygniętym 440
 * (`lib/ksef/duplicate-decision.ts`) — lustro blokady SQL
 * `ksef_duplicate_decision_blocker` (00148), widok panelu, baner szkicu
 * wycofanego każdego rodzaju (decyzja 9) i teksty z przeglądu prawnika
 * (decyzje A i 8).
 *
 * Do PR B karta faktury pokazuje przy 440 tylko fakty i notatkę
 * (`duplicate-check.ts:165-210`): klient nie ma żadnej drogi wyjścia,
 * a szkic po automatycznym „numer zajęty” nie ma banera ani blokady.
 */

const NOW = new Date('2026-10-07T10:00:00.000Z');

type Options = {
  actor?: 'client' | 'operator';
  canManage?: boolean;
  environment?: 'test' | 'demo' | 'production' | null;
};

function view(facts: DuplicateFactsShape, over: Options = {}) {
  return duplicateDecisionOptions({
    facts,
    actor: over.actor ?? 'client',
    canManage: over.canManage ?? true,
    environment: over.environment === undefined ? 'test' : over.environment,
    now: NOW,
  });
}

/** Widok do decyzji — zawężony typ (inny rodzaj widoku czerwieni test z treścią widoku). */
function decidableView(facts: DuplicateFactsShape, over: Options = {}) {
  const v = view(facts, over);
  if (v.kind !== 'decidable') throw new Error(`oczekiwano widoku do decyzji, jest ${JSON.stringify(v)}`);
  return v;
}

/** Odmowa klienta (2.11.B „Refusals in the panel”). */
const CLIENT_ROLE = 'Decyzję, czym jest ten dokument, zapisuje właściciel lub administrator firmy — poproś go o to. Nie wystawiaj tej faktury ponownie.';

const clone = <T>(v: T): T => structuredClone(v);

/** Znacznik w faktach z `decisionFacts` (pierwszy wpis). */
const markerOf = (f: DuplicateFactsShape): DuplicateFactsSubmission => f.submissions[0]!;
const checkOf = (f: DuplicateFactsShape): Record<string, unknown> | null =>
  (markerOf(f).original_check as Record<string, unknown> | null) ?? null;

interface Ctx { facts: DuplicateFactsShape; environment: 'test' | 'production' | null; canManage: boolean }

/**
 * Kolejność blokad (2.1.2), potem env-unknown, env i rola (2.2.1). Każda
 * usterka zmienia fakty tak, żeby zadziałała tylko jej blokada; nakładane
 * od końca listy, więc wcześniejsza blokada zawsze wygrywa.
 */
const ORDER: Array<{ code: string; apply: (c: Ctx) => void; message: (nr: string) => string | null | undefined }> = [
  { code: 'not-found', apply: (c) => { c.facts.invoice.direction = 'incoming'; }, message: () => undefined },
  { code: 'not-pending', apply: (c) => { c.facts.invoice.last_error_code = 'RESULT_UNCERTAIN'; }, message: (nr) => fillExpected('not-pending', nr) },
  { code: 'in-ksef', apply: (c) => { c.facts.invoice.ksef_number = DUP_K2; }, message: (nr) => fillExpected('in-ksef', nr) },
  { code: 'kind', apply: (c) => { c.facts.invoice.invoice_kind = 'advance'; }, message: (nr) => fillExpected('kind', nr) },
  { code: 'billing', apply: (c) => { c.facts.invoice.stripe_invoice_id = 'in_test_1'; }, message: (nr) => fillExpected('billing', nr) },
  { code: 'offline', apply: (c) => { c.facts.invoice.offline_idempotency_key = 'offline-1'; }, message: (nr) => fillExpected('offline', nr) },
  { code: 'no-marker', apply: (c) => { markerOf(c.facts).original_ksef_number = null; }, message: (nr) => fillExpected('no-marker', nr) },
  {
    code: 'conflicting-originals',
    apply: (c) => { c.facts.submissions.push(olderSentRow({ id: 'sub-0-inny-oryginal', status: 'duplicate', original_ksef_number: DUP_K2 })); },
    message: (nr) => fillExpected('conflicting-originals', nr),
  },
  { code: 'no-check', apply: (c) => { markerOf(c.facts).original_check = null; }, message: (nr) => fillExpected('no-check', nr) },
  {
    code: 'reason',
    apply: (c) => { const ch = checkOf(c.facts); if (ch) ch.reason = 'faktflow-original'; },
    // `reason` zostawia notatkę PR A (2.2.1).
    message: () => null,
  },
  {
    code: 'known-stale',
    apply: (c) => {
      const ch = checkOf(c.facts);
      if (ch) Object.assign(ch, { reason: 'known-number', knownInvoice: { id: DUP_KNOWN_ID, internalNumber: DUP_KNOWN_NUMBER } });
      c.facts.knownInvoice = { id: DUP_KNOWN_ID, internalNumber: DUP_KNOWN_NUMBER, holdsOriginal: false };
    },
    message: (nr) => fillExpected('known-stale', DUP_K, nr),
  },
  {
    code: 'own-history',
    // Sesja oryginału w historii tej faktury — sprawdzane na wpisach, nie z JSON.
    apply: (c) => { c.facts.submissions.push(olderSentRow({ id: 'sub-0-sesja-oryginalu', status: 'abandoned', session_reference_number: 'SES-ORIG-1' })); },
    message: (nr) => fillExpected('own-history', DUP_K, nr),
  },
  { code: 'payments', apply: (c) => { c.facts.invoice.paid_amount = 100; }, message: (nr) => fillExpected('payments', nr) },
  { code: 'env-unknown', apply: (c) => { c.environment = null; }, message: () => KSEF_SEND_MESSAGES.envUnknown },
  {
    code: 'env',
    apply: (c) => { const ch = checkOf(c.facts); if (ch) ch.env = 'production'; },
    message: (nr) => fillExpected('ENV', DUP_K, 'produkcyjne', 'testowe', nr),
  },
  { code: 'role', apply: (c) => { c.canManage = false; }, message: () => CLIENT_ROLE },
];

/** Fakty z usterkami od `from` do końca listy. */
function withFaults(from: number, base: DuplicateFactsShape = decisionFacts()): Ctx {
  const c: Ctx = { facts: clone(base), environment: 'test', canManage: true };
  for (let i = ORDER.length - 1; i >= from; i -= 1) ORDER[i]!.apply(c);
  return c;
}

describe('U1a: kolejność odmów — blokada SQL (2.1.2), potem środowisko i rola', () => {
  it('klient: każda blokada wygrywa ze wszystkimi późniejszymi, z tekstem 2.11.A dla numeru dokumentu', () => {
    for (let i = 0; i < ORDER.length; i += 1) {
      const { code, message } = ORDER[i]!;
      const c = withFaults(i);
      const v = view(c.facts, { canManage: c.canManage, environment: c.environment });
      expect(v, code).toMatchObject({ kind: 'refused', refusal: code });
      const expected = message(DUP_NR);
      if (expected !== undefined) expect((v as { message: string | null }).message, code).toBe(expected);
    }
    expect(view(decisionFacts()).kind).toBe('decidable');
  });

  it('operator: ta sama kolejność bez roli — członek firmy widzi prawdziwą blokadę, operator roli nie potrzebuje', () => {
    for (let i = 0; i < ORDER.length - 1; i += 1) {
      const c = withFaults(i);
      const v = view(c.facts, { actor: 'operator', canManage: c.canManage, environment: c.environment });
      expect(v, ORDER[i]!.code).toMatchObject({ kind: 'refused', refusal: ORDER[i]!.code });
    }
    const roleOnly = withFaults(ORDER.length - 1);
    expect(view(roleOnly.facts, { actor: 'operator', canManage: false }).kind).toBe('decidable');
  });

  it('in-ksef także z wpisu: próba accepted albo wpis z numerem KSeF w odpowiedzi', () => {
    const accepted = decisionFacts({ extra: [olderSentRow({ id: 'sub-0-przyjeta', status: 'accepted' })] });
    expect(view(accepted)).toMatchObject({ refusal: 'in-ksef', message: fillExpected('in-ksef', DUP_NR) });
    const answered = decisionFacts({ extra: [olderSentRow({ id: 'sub-0-odpowiedz', status: 'duplicate', response_ksef_number: DUP_K2 })] });
    expect(view(answered)).toMatchObject({ refusal: 'in-ksef' });
  });

  it('not-pending: stan inny niż failed (queued, szkic bez decyzji) albo kod inny niż KSEF_DUPLICATE_RECONCILE', () => {
    expect(view(decisionFacts({ invoice: { ksef_status: 'queued' } }))).toMatchObject({ refusal: 'not-pending' });
    expect(view(decisionFacts({ invoice: { ksef_status: 'rejected' } }))).toMatchObject({ refusal: 'not-pending' });
    expect(view(decisionFacts({ invoice: { last_error_code: 'KSEF_NUMBER_TAKEN' } }))).toMatchObject({ refusal: 'not-pending' });
    const automaticDraft = decisionFacts({
      invoice: { ksef_status: 'draft', last_error_code: null },
      submissions: [numberTakenRow('automatic')],
    });
    expect(view(automaticDraft)).toMatchObject({ kind: 'refused', refusal: 'not-pending' });
  });

  it('znacznik = najnowszy wpis intent/sent z numerem oryginału; wpis duplicate nie jest znacznikiem', () => {
    const newerWithoutCheck = decisionFacts({
      submissions: [
        markerRow2('sub-1-starszy-znacznik', validCheck(), '2026-09-30T10:00:00.000Z'),
        markerRow2('sub-2-nowszy-znacznik', null, '2026-10-01T10:00:00.000Z'),
      ],
    });
    expect(view(newerWithoutCheck)).toMatchObject({ refusal: 'no-check' });
    const newerWithCheck = decisionFacts({
      submissions: [
        markerRow2('sub-1-starszy-znacznik', null, '2026-09-30T10:00:00.000Z'),
        markerRow2('sub-2-nowszy-znacznik', validCheck(), '2026-10-01T10:00:00.000Z'),
      ],
    });
    expect(view(newerWithCheck).kind).toBe('decidable');
    const onlyDuplicate = decisionFacts({ marker: { status: 'duplicate' } });
    expect(view(onlyDuplicate)).toMatchObject({ refusal: 'no-marker' });
  });

  it('conflicting-originals: wpis w dowolnym stanie z innym numerem oryginału; own-history także po pliku (skrót bez względu na wielkość liter)', () => {
    const abandoned = decisionFacts({ extra: [olderSentRow({ id: 'sub-0-porzucona', status: 'abandoned', original_ksef_number: DUP_K2 })] });
    expect(view(abandoned)).toMatchObject({ refusal: 'conflicting-originals' });
    const sameOriginal = decisionFacts({ extra: [olderSentRow({ id: 'sub-0-ten-sam', status: 'duplicate', original_ksef_number: DUP_K })] });
    expect(view(sameOriginal).kind).toBe('decidable');
    const ownFile = decisionFacts({ extra: [olderSentRow({ id: 'sub-0-nasz-plik', status: 'abandoned', request_payload_hash: DUP_SHA.toUpperCase() })] });
    expect(view(ownFile)).toMatchObject({ refusal: 'own-history', message: fillExpected('own-history', DUP_K, DUP_NR) });
  });

  it('teksty: numer „(bez numeru)” jak v_num w SQL; etykiety środowisk ENV', () => {
    expect(view(decisionFacts({ invoice: { internal_number: null, paid_amount: 50 } })))
      .toMatchObject({ refusal: 'payments', message: fillExpected('payments', '(bez numeru)') });
    expect(view(decisionFacts({ check: validCheck({ env: 'demo' }) })))
      .toMatchObject({ refusal: 'env', message: fillExpected('ENV', DUP_K, 'demo', 'testowe', DUP_NR) });
    expect(view(decisionFacts({ check: validCheck({ env: 'test' }) }), { environment: 'production' }))
      .toMatchObject({ refusal: 'env', message: fillExpected('ENV', DUP_K, 'testowe', 'produkcyjne', DUP_NR) });
    expect(view(decisionFacts({ check: validCheck({ env: 'gdzie-indziej' }) })))
      .toMatchObject({ refusal: 'env', message: fillExpected('ENV', DUP_K, 'nieznane', 'testowe', DUP_NR) });
  });

  it('szkic z decyzją: widok `decided` (ponowienie po zgubionej odpowiedzi), nie odmowa', () => {
    const decided = decisionFacts({
      invoice: { ksef_status: 'draft', last_error_code: null },
      submissions: [numberTakenRow('decided', { choice: 'same_sale', via: 'operator' }), numberTakenRow('unmarked', { completedAt: DUP_DECIDED_AT })],
    });
    expect(view(decided)).toEqual({ kind: 'decided', choice: 'same_sale', via: 'operator', at: DUP_DECIDED_AT, originalKsefNumber: DUP_K });
  });
});

/** Otwarty wpis `sent` z numerem oryginału (do testów wyboru znacznika). */
function markerRow2(id: string, check: unknown, attemptedAt: string): DuplicateFactsSubmission {
  return olderSentRow({
    id,
    original_ksef_number: DUP_K,
    original_session_reference_number: 'SES-ORIG-1',
    original_check: check,
    attempted_at: attemptedAt,
    session_reference_number: `SES-${id}`,
  });
}

describe('U1b (C2): known-stale tylko przy powodzie known-number', () => {
  it('no-own-file: bez knownInvoice i z nieaktualnym knownInvoice — nadal do decyzji', () => {
    expect(view(decisionFacts()).kind).toBe('decidable');
    const staleKnown = decisionFacts({
      check: validCheck({ knownInvoice: { id: DUP_KNOWN_ID, internalNumber: DUP_KNOWN_NUMBER } }),
      knownInvoice: { id: DUP_KNOWN_ID, internalNumber: DUP_KNOWN_NUMBER, holdsOriginal: false },
    });
    expect(view(staleKnown).kind).toBe('decidable');
  });

  it('known-number: Y nie ma już K, nie jest przyjęta (holdsOriginal false) albo jej nie ma — known-stale; Y z K — do decyzji', () => {
    expect(view(knownNumberFacts(false))).toMatchObject({ kind: 'refused', refusal: 'known-stale', message: fillExpected('known-stale', DUP_K, DUP_NR) });
    const missingY = decisionFacts({ check: knownNumberCheck(), knownInvoice: null });
    expect(view(missingY)).toMatchObject({ kind: 'refused', refusal: 'known-stale' });
    expect(view(knownNumberFacts(true)).kind).toBe('decidable');
  });
});

describe('U1c: widok do decyzji, tabela porównania i „Rozumiem skutki” (decyzje 7 i 12)', () => {
  const sameOf = (v: { comparison: Array<{ label: string; same: boolean | null }> }) =>
    Object.fromEntries(v.comparison.map((r) => [r.label, r.same]));

  it('no-own-file: numer, K, skrót, powód, program; tabela sześciu wierszy bez liczby pozycji', () => {
    const v = decidableView(decisionFacts({
      check: validCheck({ summary: { ...(validCheck().summary as object), number: ` ${DUP_NR} `, buyerNip: '1234567890' } }),
      invoice: { buyer_nip: 'PL 123-456-78-90' },
    }));
    expect(v).toMatchObject({
      kind: 'decidable', reason: 'no-own-file', invoiceNumber: DUP_NR, originalKsefNumber: DUP_K, originalSha256: DUP_SHA,
      sameContent: null, program: DUP_PROGRAM, knownInvoice: null, heldCorrections: false,
    });
    expect(v.comparison.map((r: { label: string }) => r.label))
      .toEqual(['Numer faktury', 'Data wystawienia', 'Nabywca', 'NIP nabywcy', 'Kwota brutto', 'Program']);
    // Numer po przycięciu spacji, NIP po samych cyfrach, kwota w tej samej walucie; program bez porównania.
    expect(sameOf(v)).toEqual({
      'Numer faktury': true, 'Data wystawienia': true, Nabywca: true, 'NIP nabywcy': true, 'Kwota brutto': true, Program: null,
    });
  });

  it('różnice: data, nabywca, NIP i kwota; kwota w innej albo nieznanej walucie — bez porównania (same null)', () => {
    const differs = decidableView(decisionFacts({
      check: validCheck({ summary: { ...(validCheck().summary as object), issueDate: '2026-09-30', buyerName: 'Inny Nabywca', buyerNip: '9876543210', gross: '999.99' } }),
    }));
    expect(sameOf(differs)).toMatchObject({ 'Data wystawienia': false, Nabywca: false, 'NIP nabywcy': false, 'Kwota brutto': false });
    const eur = decidableView(decisionFacts({ check: validCheck({ summary: { ...(validCheck().summary as object), currency: 'EUR' } }) }));
    expect(sameOf(eur)['Kwota brutto']).toBeNull();
    const noCurrency = decidableView(decisionFacts({ check: validCheck({ summary: { ...(validCheck().summary as object), currency: null } }) }));
    expect(sameOf(noCurrency)['Kwota brutto']).toBeNull();
  });

  it.each([
    ['ten sam NIP i kwota', {}, {}, { same_sale: false, other_sale: true }],
    ['inny NIP', { buyerNip: '9876543210' }, {}, { same_sale: true, other_sale: false }],
    ['inna kwota w tej samej walucie', { gross: '999.99' }, {}, { same_sale: true, other_sale: true }],
    ['ta sama wartość w innej walucie', { currency: 'EUR' }, {}, { same_sale: true, other_sale: true }],
    ['waluta oryginału nieznana', { currency: null }, {}, { same_sale: true, other_sale: true }],
    ['kwota oryginału nieznana', { gross: null }, {}, { same_sale: true, other_sale: true }],
    ['NIP oryginału nieznany', { buyerNip: null }, {}, { same_sale: true, other_sale: true }],
    ['NIP naszego dokumentu nieznany', {}, { buyer_nip: null }, { same_sale: true, other_sale: true }],
    ['kwota naszego dokumentu nieznana', {}, { gross_total: null }, { same_sale: true, other_sale: true }],
  ] as const)('„Rozumiem skutki”: %s', (_name, summary, invoice, expected) => {
    const v = decidableView(decisionFacts({
      check: validCheck({ summary: { ...(validCheck().summary as object), ...summary } }),
      invoice: { ...invoice },
    }));
    expect(v.needsConfirmation).toEqual(expected);
  });

  it('known-number: knownInvoice {id, internalNumber}, sameContent z porównania; oryginał z FaktFlow nadal do decyzji (decyzja 12)', () => {
    const v = decidableView(knownNumberFacts(true, { check: { sameContentExceptHeader: true } }));
    expect(v).toMatchObject({ kind: 'decidable', reason: 'known-number', sameContent: true });
    expect(v.knownInvoice).toEqual({ id: DUP_KNOWN_ID, internalNumber: DUP_KNOWN_NUMBER });
    const faktflow = view(knownNumberFacts(true, { check: { summary: { ...(validCheck().summary as object), systemInfo: 'KSeF SaaS v1.0' } } }));
    expect(faktflow).toMatchObject({ kind: 'decidable', program: 'FaktFlow' });
    const noProgram = view(decisionFacts({ check: validCheck({ summary: { ...(validCheck().summary as object), systemInfo: null } }) }));
    expect(noProgram).toMatchObject({ kind: 'decidable', program: null });
  });

  it('heldCorrections: korekty wstrzymane na produkcyjnym KSeF (isCorrectionHeldForEnv)', () => {
    const prod = view(decisionFacts({ check: validCheck({ env: 'production' }) }), { environment: 'production' });
    expect(prod).toMatchObject({ kind: 'decidable', heldCorrections: true });
    expect(decidableView(decisionFacts()).heldCorrections).toBe(false);
  });

  it('ponowne sprawdzenie nieudane (recheck) nie blokuje — dane z udanego są ważne', () => {
    const v = view(decisionFacts({ check: validCheck({ recheck: { reason: 'download-pending', httpStatus: 503, checkedAt: '2026-10-06T10:00:00.000Z' } }) }));
    expect(v.kind).toBe('decidable');
  });
});

describe('U1d: baner szkicu wycofanego — każdy rodzaj (decyzja 9)', () => {
  const data = formatWarsawDateTime(DUP_DECIDED_AT);
  const title = `Dokument wycofany — numer ${DUP_NR} jest zajęty w KSeF`;
  const regularCta = { href: '/invoices/new/regular', label: 'Wystaw nową fakturę' };
  const deleteRefusal = fillExpected('TRIGGER_DELETE', DUP_NR, `faktura ${DUP_K}`);
  const retired = (invoiceKind: string, submissions: DuplicateFactsSubmission[], kindHeld = false) =>
    retiredDraftView({ invoiceNumber: DUP_NR, invoiceKind, submissions, kindHeld });

  it('zwykła, ta sama sprzedaż: bez przycisku, nie do usunięcia, odmowa wysyłki = TRIGGER_SAME', () => {
    expect(retired('regular', [numberTakenRow('decided', { choice: 'same_sale' })])).toEqual({
      title,
      body: `Zapisano ${data}: to ta sama sprzedaż co faktura ${DUP_NR} w KSeF (numer KSeF ${DUP_K}), wystawiona w programie „${DUP_PROGRAM}”. Tam ją rozliczasz i korygujesz; FaktFlow nie ujmuje jej w JPK ani w KPiR. Tego dokumentu nie wyślesz do KSeF. Jeśli to jednak inna sprzedaż, wystaw ją jako nową fakturę z nowym numerem.`,
      cta: null,
      knownInvoice: null,
      sendRefusal: fillExpected('TRIGGER_SAME', DUP_NR, DUP_K),
      deletable: false,
      deleteRefusal,
    });
  });

  it('zwykła, ta sama sprzedaż przy known-number: dokument Y i odnośnik do niego; zapis operatora — „zapisała pomoc FaktFlow”', () => {
    const v = retired('regular', [numberTakenRow('decided', { choice: 'same_sale', reason: 'known-number', via: 'operator' })]);
    expect(v).toMatchObject({
      body: `Zapisano ${data} (zapisała pomoc FaktFlow na Twoją prośbę): to ta sama sprzedaż co faktura ${DUP_NR} w KSeF (numer KSeF ${DUP_K}), którą w FaktFlow ma dokument ${DUP_KNOWN_NUMBER}. Tego dokumentu nie wyślesz do KSeF. Jeśli to jednak inna sprzedaż, wystaw ją jako nową fakturę z nowym numerem.`,
      cta: null,
      deletable: false,
    });
    expect(v!.knownInvoice).toEqual({ id: DUP_KNOWN_ID, internalNumber: DUP_KNOWN_NUMBER });
  });

  it('zwykła, inna sprzedaż: jedyny przycisk „Wystaw nową fakturę”, odmowa wysyłki = TRIGGER_OTHER', () => {
    expect(retired('regular', [numberTakenRow('decided', { choice: 'other_sale' })])).toEqual({
      title,
      body: `Zapisano ${data}: to inna sprzedaż niż faktura ${DUP_K} w KSeF. Wystaw ją jako nową fakturę — z nowym numerem i dzisiejszą datą. Tego dokumentu nie wyślesz do KSeF ani nie usuniesz; numer ${DUP_NR} zostaje przy nim, żeby FaktFlow nie podpowiedział go ponownie.`,
      cta: regularCta,
      knownInvoice: null,
      sendRefusal: fillExpected('TRIGGER_OTHER', DUP_NR, DUP_K),
      deletable: false,
      deleteRefusal,
    });
  });

  it('zwykła, automatyczny „numer zajęty” (decyzja 3): ten sam baner, przycisk i blokada usunięcia', () => {
    expect(retired('regular', [numberTakenRow('automatic'), numberTakenRow('unmarked', { completedAt: '2026-10-04T09:00:00.000Z' })])).toEqual({
      title,
      body: `KSeF ma już fakturę Twojej firmy o numerze ${DUP_NR} (numer KSeF ${DUP_K}), wystawioną poza FaktFlow — tego dokumentu nie wyślesz do KSeF ani nie usuniesz; numer zostaje przy nim, żeby FaktFlow nie podpowiedział go ponownie. Jeśli to ta sama sprzedaż — nie wystawiaj jej ponownie (zmiany: korekta tamtej faktury w programie, w którym ją wystawiono). Jeśli inna — wystaw ją jako nową fakturę z nowym numerem.`,
      cta: regularCta,
      knownInvoice: null,
      sendRefusal: fillExpected('TRIGGER_AUTO', DUP_NR, `fakturę ${DUP_K}`),
      deletable: false,
      deleteRefusal,
    });
  });

  it('zwykła bez K (tylko wpisy bez numeru oryginału): bez „(numer KSeF …)”, „inna faktura Twojej firmy” w odmowach', () => {
    const v = retired('regular', [numberTakenRow('unmarked')]);
    expect(v).toMatchObject({
      body: `KSeF ma już fakturę Twojej firmy o numerze ${DUP_NR}, wystawioną poza FaktFlow — tego dokumentu nie wyślesz do KSeF ani nie usuniesz; numer zostaje przy nim, żeby FaktFlow nie podpowiedział go ponownie. Jeśli to ta sama sprzedaż — nie wystawiaj jej ponownie (zmiany: korekta tamtej faktury w programie, w którym ją wystawiono). Jeśli inna — wystaw ją jako nową fakturę z nowym numerem.`,
      sendRefusal: fillExpected('TRIGGER_AUTO', DUP_NR, 'inną fakturę Twojej firmy'),
      deleteRefusal: fillExpected('TRIGGER_DELETE', DUP_NR, 'inna faktura Twojej firmy'),
      deletable: false,
    });
  });

  it('ZAL (automatycznie): nie do usunięcia, przycisk „Wystaw nową fakturę zaliczkową”', () => {
    expect(retired('advance', [numberTakenRow('automatic')])).toEqual({
      title,
      body: `KSeF ma już dokument Twojej firmy o numerze ${DUP_NR} (numer KSeF ${DUP_K}), wystawiony poza FaktFlow — tej faktury zaliczkowej nie wyślesz do KSeF ani nie usuniesz; numer zostaje przy niej, żeby FaktFlow nie podpowiedział go ponownie. Jeśli to ta sama sprzedaż — nie wystawiaj jej ponownie. Jeśli inna — wystaw nową fakturę zaliczkową z nowym numerem.`,
      cta: { href: '/invoices/new/advance', label: 'Wystaw nową fakturę zaliczkową' },
      knownInvoice: null,
      sendRefusal: fillExpected('TRIGGER_AUTO', DUP_NR, `fakturę ${DUP_K}`),
      deletable: false,
      deleteRefusal,
    });
  });

  it.each([
    ['correction', 'korekty', 'korektę'],
    ['final', 'faktury rozliczeniowej', 'fakturę rozliczeniową'],
  ] as const)('%s (automatycznie): usuwalny szkic — bez przycisku na banerze, „Usuń szkic” w tekście; rodzaj wstrzymany — „po zdjęciu blokady”', (kind, G, A) => {
    const lead = `KSeF ma już dokument Twojej firmy o numerze ${DUP_NR} (numer KSeF ${DUP_K}), wystawiony poza FaktFlow — tego szkicu ${G} nie wyślesz do KSeF. Jeśli w KSeF jest ten sam dokument — nie wystawiaj go ponownie. Jeśli inny — `;
    expect(retired(kind, [numberTakenRow('automatic')])).toEqual({
      title,
      body: `${lead}usuń ten szkic („Usuń szkic”) i wystaw ${A} od nowa z nowym numerem.`,
      cta: null,
      knownInvoice: null,
      sendRefusal: fillExpected('TRIGGER_AUTO', DUP_NR, `fakturę ${DUP_K}`),
      deletable: true,
      deleteRefusal: null,
    });
    const held = retired(kind, [numberTakenRow('automatic')], true);
    expect(held!.body).toBe(`${lead}usuń ten szkic („Usuń szkic”), a po zdjęciu blokady wysyłki wystaw ${A} od nowa z nowym numerem.`);
    expect(held!.body).toContain('po zdjęciu blokady');
  });

  it('wpis z decyzją przy korekcie (uszkodzone dane — decyzja jest tylko dla zwykłej): tekst automatyczny korekty', () => {
    const kor = retired('correction', [numberTakenRow('decided', { choice: 'other_sale' })]);
    expect(kor).toMatchObject({ deletable: true, deleteRefusal: null, cta: null, knownInvoice: null });
    expect(kor!.body).toBe(retired('correction', [numberTakenRow('automatic')])!.body);
  });

  it('bez wpisu number_taken — brak banera dla każdego rodzaju', () => {
    const rows = [olderSentRow({ status: 'abandoned' }), olderSentRow({ id: 'sub-x', status: 'duplicate', original_ksef_number: DUP_K })];
    for (const kind of ['regular', 'advance', 'correction', 'final']) {
      expect(retiredDraftView({ invoiceNumber: DUP_NR, invoiceKind: kind, submissions: rows, kindHeld: false }), kind).toBeNull();
      expect(retiredDraftView({ invoiceNumber: DUP_NR, invoiceKind: kind, submissions: [], kindHeld: true }), kind).toBeNull();
    }
  });
});

describe('U1e: retiredDraftSendRefusal — każdy rodzaj, kolejność wpisów jak wyzwalacz (2.1.4 krok 2)', () => {
  it('decyzja przed wpisem automatycznym (nawet późniejszym); wpis z K przed wpisem bez numeru; potem completed_at malejąco', () => {
    expect(retiredDraftSendRefusal(DUP_NR, [
      numberTakenRow('automatic', { id: 'nt-pozniejszy', k: DUP_K2, completedAt: '2026-10-06T10:00:00.000Z' }),
      numberTakenRow('decided', { choice: 'other_sale', k: DUP_K }),
    ])).toBe(fillExpected('TRIGGER_OTHER', DUP_NR, DUP_K));
    expect(retiredDraftSendRefusal(DUP_NR, [
      numberTakenRow('automatic', { completedAt: '2026-10-04T10:00:00.000Z' }),
      numberTakenRow('unmarked', { completedAt: '2026-10-06T10:00:00.000Z' }),
    ])).toBe(fillExpected('TRIGGER_AUTO', DUP_NR, `fakturę ${DUP_K}`));
    expect(retiredDraftSendRefusal(DUP_NR, [
      numberTakenRow('automatic', { id: 'nt-a', k: DUP_K, completedAt: '2026-10-03T10:00:00.000Z' }),
      numberTakenRow('automatic', { id: 'nt-b', k: DUP_K2, completedAt: '2026-10-04T10:00:00.000Z' }),
    ])).toBe(fillExpected('TRIGGER_AUTO', DUP_NR, `fakturę ${DUP_K2}`));
    expect(retiredDraftSendRefusal(DUP_NR, [
      numberTakenRow('automatic', { id: 'nt-bez-daty', k: DUP_K2, completedAt: null }),
      numberTakenRow('automatic', { id: 'nt-z-data', k: DUP_K, completedAt: '2026-10-03T10:00:00.000Z' }),
    ])).toBe(fillExpected('TRIGGER_AUTO', DUP_NR, `fakturę ${DUP_K}`));
  });

  it('ta sama sprzedaż: TRIGGER_SAME; dokument bez numeru — „(bez numeru)” jak v_num', () => {
    expect(retiredDraftSendRefusal(DUP_NR, [numberTakenRow('decided', { choice: 'same_sale' })]))
      .toBe(fillExpected('TRIGGER_SAME', DUP_NR, DUP_K));
    expect(retiredDraftSendRefusal(null, [numberTakenRow('automatic')]))
      .toBe(fillExpected('TRIGGER_AUTO', '(bez numeru)', `fakturę ${DUP_K}`));
  });

  it('korekta też: ta sama odmowa co w banerze; bez wpisu number_taken — null', () => {
    const rows = [numberTakenRow('automatic')];
    const kor = retiredDraftView({ invoiceNumber: DUP_NR, invoiceKind: 'correction', submissions: rows, kindHeld: true });
    expect(kor!.sendRefusal).toBe(retiredDraftSendRefusal(DUP_NR, rows));
    expect(retiredDraftSendRefusal(DUP_NR, rows)).toBe(fillExpected('TRIGGER_AUTO', DUP_NR, `fakturę ${DUP_K}`));
    expect(retiredDraftSendRefusal(DUP_NR, [olderSentRow({ status: 'abandoned' })])).toBeNull();
  });
});

/** Wszystkie napisy z obiektu tekstów; funkcje wołane z argumentami-znacznikami. */
function collectTexts(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 5) return out;
  if (typeof value === 'string') {
    out.push(value);
  } else if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown;
    const args = Array.from({ length: Math.max(fn.length, 1) }, (_, i) => `{a${i}}`);
    try {
      collectTexts(fn(...args), out, depth + 1);
    } catch {
      // Funkcja z innym kształtem argumentów — jej teksty sprawdzają widoki niżej.
    }
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectTexts(v, out, depth + 1);
  }
  return out;
}

/** Teksty, które widzi klient: obiekt tekstów, wzorce SQL, odmowy panelu, banery i odmowy szkicu wycofanego. */
function clientTexts(): string[] {
  const out = collectTexts(DUPLICATE_DECISION_TEXTS);
  out.push(...Object.values(DUPLICATE_DECISION_SQL_TEXTS as Record<string, { template: string }>).map((t) => t.template));
  for (let i = 0; i < ORDER.length; i += 1) {
    const c = withFaults(i);
    const v = view(c.facts, { canManage: c.canManage, environment: c.environment }) as { message?: string | null };
    if (v.message) out.push(v.message);
  }
  for (const kind of ['regular', 'advance', 'correction', 'final']) {
    for (const rows of [
      [numberTakenRow('decided', { choice: 'same_sale' })],
      [numberTakenRow('decided', { choice: 'same_sale', reason: 'known-number', via: 'operator' })],
      [numberTakenRow('decided', { choice: 'other_sale' })],
      [numberTakenRow('automatic')],
      [numberTakenRow('unmarked')],
    ]) {
      for (const kindHeld of [false, true]) {
        const v = retiredDraftView({ invoiceNumber: DUP_NR, invoiceKind: kind, submissions: rows, kindHeld });
        if (!v) continue;
        out.push(v.title, v.body, v.sendRefusal ?? '', v.deleteRefusal ?? '', v.cta?.label ?? '');
      }
    }
  }
  return out.filter(Boolean);
}

describe('U1f: teksty klienta (przegląd prawnika, decyzje A i 8)', () => {
  it('żaden tekst klienta nie odsyła do operatora (reguła 07.10)', () => {
    const withOperator = clientTexts().filter((t) => /operator/i.test(t));
    expect(withOperator).toEqual([]);
  });

  it('żaden tekst zwykłej faktury i zaliczki (nieusuwalnych) nie każe ich usuwać', () => {
    const nonDeletable: string[] = [];
    for (const kind of ['regular', 'advance']) {
      for (const rows of [[numberTakenRow('decided', { choice: 'same_sale' })], [numberTakenRow('decided', { choice: 'other_sale' })], [numberTakenRow('automatic')], [numberTakenRow('unmarked')]]) {
        const v = retiredDraftView({ invoiceNumber: DUP_NR, invoiceKind: kind, submissions: rows, kindHeld: false })!;
        nonDeletable.push(v.title, v.body, v.sendRefusal ?? '', v.deleteRefusal ?? '');
      }
    }
    nonDeletable.push(...Object.values(DUPLICATE_DECISION_SQL_TEXTS as Record<string, { template: string }>).map((t) => t.template));
    expect(nonDeletable.filter((t) => /usuń (go|je|wpłaty)/i.test(t))).toEqual([]);
    expect(clientTexts().filter((t) => /usuń (go|je|wpłaty)/i.test(t))).toEqual([]);
  });

  it('C5: oba pola „Rozumiem skutki: …” i CONFIRM słowo w słowo', () => {
    const texts = collectTexts(DUPLICATE_DECISION_TEXTS);
    expect(texts).toContain('Zaznacz „Rozumiem skutki” i zapisz decyzję jeszcze raz.');
    const labels = texts.filter((t) => t.startsWith('Rozumiem skutki: '));
    expect(labels.some((t) => /^Rozumiem skutki: faktura .+ w KSeF dokumentuje tę samą sprzedaż co dokument .+, mimo różnic zaznaczonych w tabeli\.$/.test(t)))
      .toBe(true);
    expect(labels.some((t) => /^Rozumiem skutki: faktura .+ w KSeF dokumentuje inną sprzedaż niż dokument .+\.$/.test(t))).toBe(true);
    // „Rozumiem skutki” poza etykietą pola tylko w cudzysłowie (CONFIRM).
    expect(texts.filter((t) => t.includes('Rozumiem skutki') && !t.startsWith('Rozumiem skutki: ') && !t.includes('„Rozumiem skutki”')))
      .toEqual([]);
  });

  it('zdanie o wstrzymanych korektach tylko przy heldCorrections (KSeF produkcyjny)', () => {
    expect(collectTexts(DUPLICATE_DECISION_TEXTS).some((t) => t.includes('Korekty do produkcyjnego KSeF są teraz wstrzymane przez FaktFlow.'))).toBe(true);
    expect(decidableView(decisionFacts()).heldCorrections).toBe(false);
    expect(decidableView(decisionFacts({ check: validCheck({ env: 'production' }) }), { environment: 'production' }).heldCorrections).toBe(true);
  });
});

describe('U1g (C1): teksty SQL 00148 — wzorce RAISE z % i fillSqlText', () => {
  it('lustro ma klucz dla każdego wiersza 2.11.A (z TRIGGER_RENUMBER), wzorce słowo w słowo i ich liczbę argumentów', () => {
    expect(DUPLICATE_DECISION_SQL_TEXTS).toEqual(EXPECTED_SQL_TEXTS);
    expect(Object.keys(DUPLICATE_DECISION_SQL_TEXTS)).toContain('TRIGGER_RENUMBER');
  });

  it('żaden wzorzec nie ma apostrofu; liczba % = arity (format() z gołym % by padł)', () => {
    for (const [key, { template, arity }] of Object.entries(DUPLICATE_DECISION_SQL_TEXTS as Record<string, { template: string; arity: number }>)) {
      expect(template, key).not.toContain("'");
      expect(template.split('%').length - 1, key).toBe(arity);
    }
  });

  it('fillSqlText wypełnia od lewej do prawej, nie podstawia w argumentach i odmawia przy złej liczbie', () => {
    expect(fillSqlText('a % b % c', 'X', 'Y')).toBe('a X b Y c');
    expect(fillSqlText('% i %', '50%', 'x')).toBe('50% i x');
    expect(fillSqlText('bez znaczników')).toBe('bez znaczników');
    expect(() => fillSqlText('a % b', 'X', 'Y')).toThrow();
    expect(() => fillSqlText('a % b %', 'X')).toThrow();
  });

  it('TRIGGER_AUTO bez K: „przez inną fakturę Twojej firmy wystawioną” (poprawka v3)', () => {
    const t = (DUPLICATE_DECISION_SQL_TEXTS as Record<string, { template: string }>).TRIGGER_AUTO!.template;
    expect(fillSqlText(t, DUP_NR, 'inną fakturę Twojej firmy')).toContain('przez inną fakturę Twojej firmy wystawioną');
    expect(fillSqlText(t, DUP_NR, `fakturę ${DUP_K}`)).toContain(`przez fakturę ${DUP_K} wystawioną poza FaktFlow`);
  });
});

describe('U1h: zgodność polityki jsonb z SQL — wspólna tabela (R6)', () => {
  it('tabela pokrywa oba powody PR B, każdy wybór i nie ma wiersza v: 1.0 (C14)', () => {
    expect(DUPLICATE_CHECK_CASES.some((c) => c.allows)).toBe(true);
    expect(DUPLICATE_CHECK_CASES.some((c) => !c.allows)).toBe(true);
    expect(new Set(DUPLICATE_CHECK_CASES.map((c) => c.name)).size).toBe(DUPLICATE_CHECK_CASES.length);
    expect(DUPLICATE_CHECK_CASES.filter((c) => JSON.stringify(c.check).includes('"v":1.0'))).toEqual([]);
  });

  it.each(DUPLICATE_CHECK_CASES.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(duplicateCheckAllows(c.check, c.choice)).toBe(c.allows);
  });

});
