/**
 * D-A4-1b-3 PR B: wspólne dane testów decyzji klienta przy nierozstrzygniętym
 * duplikacie 440.
 *
 * 1. `DUPLICATE_CHECK_CASES` — tabela zgodności polityki jsonb: SQL
 *    `ksef_duplicate_check_allows(p_check, p_choice)` (00148, test bazy R6)
 *    i TypeScript `duplicateCheckAllows(raw, choice)` (test U1h) mają dać
 *    dla każdego wiersza ten sam wynik — `allows`, spisany ręcznie z sekcji
 *    2.1.1 specyfikacji. Każdy `check` przechodzi przez JSON (supabase-js), więc
 *    „brak klucza” to brak klucza, nie `undefined`. Bez wiersza `v: 1.0`
 *    (C14): supabase-js wysyła `1.0` jako `1` — ten przypadek sprawdza R6b
 *    literałem SQL.
 * 2. Budowniczowie faktów i wpisów `ksef_submissions` dla czystej polityki
 *    (`duplicateDecisionOptions`, `retiredDraftView`, `retiredDraftSendRefusal`)
 *    w kształcie wierszy, które czyta ładowarka (`loadDuplicateDecisionFacts`,
 *    sekcja 2.3): faktura z kolumnami `DUPLICATE_DECISION_INVOICE_COLUMNS`,
 *    WSZYSTKIE wpisy faktury z surowym `original_check` (jsonb) i odczyt
 *    faktury Y (`holdsOriginal`) przy powodzie `known-number`.
 *
 * Typy są tu strukturalne (bez importu modułu polityki), żeby plik
 * kompilował się także przed wdrożeniem PR B — importuje go test bazy (R6).
 * NIP fikcyjny (1234567890).
 */

/** Wybór klienta — to samo co `DuplicateChoice` z `lib/ksef/duplicate-decision.ts`. */
export type DuplicateCaseChoice = 'same_sale' | 'other_sale';

export interface DuplicateCheckCase {
  name: string;
  /** Surowa wartość `ksef_submissions.original_check` (jsonb) — także nieobiektowa. */
  check: unknown;
  /** `null` = „dowolny wybór” (blokada, I5D). */
  choice: DuplicateCaseChoice | null;
  allows: boolean;
}

export const DUP_TENANT_ID = '13131313-1313-4313-8313-131313131313';
export const DUP_INVOICE_ID = '7a7a7a7a-0000-4000-8000-000000000001';
/** Faktura Y — w FaktFlow ma już numer KSeF oryginału (`known-number`). */
export const DUP_KNOWN_ID = '7a7a7a7a-0000-4000-8000-000000000002';
export const DUP_KNOWN_NUMBER = 'FV/INNA/1';
/** Numer naszego dokumentu (P_2), zajęty w KSeF. */
export const DUP_NR = 'FV/2026/10/7';
/** Numer KSeF oryginału (K). */
export const DUP_K = '1234567890-20261001-0100A0B0C0D0-1A';
/** Drugi numer KSeF — inny oryginał. */
export const DUP_K2 = '1234567890-20261002-0200A0B0C0D0-2B';
/** SHA-256 (hex) bajtów oryginału. */
export const DUP_SHA = 'bb'.repeat(32);
/** Program oryginału spoza FaktFlow. */
export const DUP_PROGRAM = 'Inny Program 1.0';
/** Moment decyzji zapisany w `original_check.decision.at`. */
export const DUP_DECIDED_AT = '2026-10-05T10:00:00.000Z';

const KNOWN_INVOICE = { id: DUP_KNOWN_ID, internalNumber: DUP_KNOWN_NUMBER };

/** Zapis runnera po udanym sprawdzeniu oryginału (`no-own-file`, dane kompletne). */
export function validCheck(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    env: 'test',
    checkedAt: '2026-10-02T08:00:00.000Z',
    reason: 'no-own-file',
    sha256: DUP_SHA,
    archivePath: `${DUP_TENANT_ID}/ksef-import/${DUP_K}.xml`,
    sizeBytes: 2048,
    summary: {
      systemInfo: DUP_PROGRAM,
      number: DUP_NR,
      issueDate: '2026-10-01',
      buyerNip: '1234567890',
      buyerName: 'Nabywca Testowy Sp. z o.o.',
      gross: '1230.00',
      currency: 'PLN',
    },
    sameContentExceptHeader: null,
    ownHistory: false,
    acquiredAt: '2026-10-01T09:00:00.000Z',
    httpStatus: null,
    knownInvoice: null,
    recheck: null,
    ...over,
  };
}

/** Zapis `known-number` z danymi oryginału (od PR B runner pobiera K także wtedy). */
export function knownNumberCheck(over: Record<string, unknown> = {}): Record<string, unknown> {
  return validCheck({ reason: 'known-number', knownInvoice: { ...KNOWN_INVOICE }, sameContentExceptHeader: false, ...over });
}

/** Kopia bez wskazanego klucza (jsonb bez klucza ≠ klucz z `null`). */
export function withoutKey(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

const ALL_CHOICES: ReadonlyArray<DuplicateCaseChoice | null> = [null, 'same_sale', 'other_sale'];

/** Powody bez decyzji klienta w PR B (każdy wybór odmawia). */
const OTHER_REASONS = [
  'download-refused',
  'download-pending',
  'storage-pending',
  'archive-pending',
  'faktflow-original',
  'same-content-other-program',
  'archive-conflict',
] as const;

const DECISION = { choice: 'other_sale', via: 'client', at: DUP_DECIDED_AT, reason: 'no-own-file', env: 'test' };

/**
 * Oczekiwania z 2.1.1: obiekt, `v` = 1 (liczba), bez klucza `decision`, powód
 * no-own-file albo known-number, `sha256` = 64 małe znaki hex (napis),
 * `summary` obiektem, `ownHistory` = false; przy known-number `knownInvoice.id`
 * niepustym napisem. `recheck` nie blokuje.
 */
export const DUPLICATE_CHECK_CASES: ReadonlyArray<DuplicateCheckCase> = [
  // Powody PR B × wybór.
  ...ALL_CHOICES.map((choice) => ({ name: `no-own-file, wybór ${choice ?? 'dowolny'}`, check: validCheck(), choice, allows: true })),
  ...ALL_CHOICES.map((choice) => ({ name: `known-number z knownInvoice, wybór ${choice ?? 'dowolny'}`, check: knownNumberCheck(), choice, allows: true })),
  // Pozostałe powody × wybór — decyzji w panelu nie ma.
  ...OTHER_REASONS.flatMap((reason) => ALL_CHOICES.map((choice) => ({
    name: `${reason}, wybór ${choice ?? 'dowolny'}`, check: validCheck({ reason }), choice, allows: false,
  }))),
  { name: 'powód nieznany', check: validCheck({ reason: 'cokolwiek' }), choice: null, allows: false },
  { name: 'powód nie jest napisem', check: validCheck({ reason: 7 }), choice: null, allows: false },
  // ownHistory: tylko false dopuszcza (true = oryginał może być nasz, null = nie wiadomo).
  { name: 'ownHistory true', check: validCheck({ ownHistory: true }), choice: null, allows: false },
  { name: 'ownHistory true, known-number', check: knownNumberCheck({ ownHistory: true }), choice: 'same_sale', allows: false },
  { name: 'ownHistory null', check: validCheck({ ownHistory: null }), choice: null, allows: false },
  { name: 'ownHistory brak klucza', check: withoutKey(validCheck(), 'ownHistory'), choice: null, allows: false },
  { name: 'ownHistory 0 (liczba)', check: validCheck({ ownHistory: 0 }), choice: null, allows: false },
  // sha256: dane oryginału są wymagane.
  { name: 'sha256 brak klucza', check: withoutKey(validCheck(), 'sha256'), choice: null, allows: false },
  { name: 'sha256 null (zapis PR A bez pobrania)', check: validCheck({ sha256: null }), choice: null, allows: false },
  { name: 'sha256 wielkimi literami', check: validCheck({ sha256: 'BB'.repeat(32) }), choice: null, allows: false },
  { name: 'sha256 liczbą', check: validCheck({ sha256: 1234 }), choice: null, allows: false },
  { name: 'sha256 za krótki', check: validCheck({ sha256: 'bb'.repeat(31) }), choice: null, allows: false },
  { name: 'sha256 z cudzym znakiem', check: validCheck({ sha256: `${'bb'.repeat(31)}bz` }), choice: null, allows: false },
  // summary: obiekt.
  { name: 'summary brak klucza', check: withoutKey(validCheck(), 'summary'), choice: null, allows: false },
  { name: 'summary null', check: validCheck({ summary: null }), choice: null, allows: false },
  { name: 'summary tablicą', check: validCheck({ summary: [] }), choice: null, allows: false },
  { name: 'summary napisem', check: validCheck({ summary: 'FV/2026/10/7' }), choice: null, allows: false },
  // decision: obecność klucza = dokument już wycofany decyzją (także wartość zniekształcona).
  { name: 'decision zapisana', check: validCheck({ decision: { ...DECISION } }), choice: null, allows: false },
  { name: 'decision zapisana, ten sam wybór', check: validCheck({ decision: { ...DECISION } }), choice: 'other_sale', allows: false },
  { name: 'decision napisem (zniekształcona)', check: validCheck({ decision: 'other_sale' }), choice: null, allows: false },
  { name: 'decision null', check: validCheck({ decision: null }), choice: null, allows: false },
  { name: 'decision pustym obiektem', check: validCheck({ decision: {} }), choice: 'same_sale', allows: false },
  // Wersja zapisu i kształt.
  { name: 'v: 2', check: validCheck({ v: 2 }), choice: null, allows: false },
  { name: 'v: "1" (napis)', check: validCheck({ v: '1' }), choice: null, allows: false },
  { name: 'v brak klucza', check: withoutKey(validCheck(), 'v'), choice: null, allows: false },
  { name: 'check null (wpis sprzed 00144)', check: null, choice: null, allows: false },
  { name: 'check napisem', check: 'no-own-file', choice: null, allows: false },
  { name: 'check tablicą', check: [validCheck()], choice: null, allows: false },
  { name: 'check pustym obiektem', check: {}, choice: 'other_sale', allows: false },
  // known-number: knownInvoice.id niepustym napisem.
  { name: 'known-number bez knownInvoice', check: withoutKey(knownNumberCheck(), 'knownInvoice'), choice: null, allows: false },
  { name: 'known-number, knownInvoice null', check: knownNumberCheck({ knownInvoice: null }), choice: 'same_sale', allows: false },
  { name: 'known-number, knownInvoice.id liczbą', check: knownNumberCheck({ knownInvoice: { id: 123, internalNumber: DUP_KNOWN_NUMBER } }), choice: null, allows: false },
  { name: 'known-number, knownInvoice.id pusty', check: knownNumberCheck({ knownInvoice: { id: '', internalNumber: DUP_KNOWN_NUMBER } }), choice: 'other_sale', allows: false },
  { name: 'known-number, knownInvoice bez id', check: knownNumberCheck({ knownInvoice: { internalNumber: DUP_KNOWN_NUMBER } }), choice: null, allows: false },
  { name: 'known-number, knownInvoice tablicą', check: knownNumberCheck({ knownInvoice: [{ ...KNOWN_INVOICE }] }), choice: null, allows: false },
  { name: 'known-number bez danych oryginału (zapis PR A)', check: knownNumberCheck({ sha256: null, summary: null, archivePath: null, ownHistory: null }), choice: null, allows: false },
  // no-own-file nie patrzy na knownInvoice (C2).
  { name: 'no-own-file z knownInvoice.id liczbą', check: validCheck({ knownInvoice: { id: 123 } }), choice: 'same_sale', allows: true },
  { name: 'no-own-file z knownInvoice', check: validCheck({ knownInvoice: { ...KNOWN_INVOICE } }), choice: 'other_sale', allows: true },
  // Nieudane ponowne sprawdzenie zostawia dane wcześniejszego udanego — nie blokuje.
  {
    name: 'recheck po nieudanym ponownym sprawdzeniu',
    check: validCheck({ recheck: { reason: 'download-pending', httpStatus: 503, checkedAt: '2026-10-06T10:00:00.000Z' } }),
    choice: 'same_sale',
    allows: true,
  },
  { name: 'oryginał z FaktFlow przy known-number (decyzja 12)', check: knownNumberCheck({ summary: { ...(validCheck().summary as Record<string, unknown>), systemInfo: 'KSeF SaaS v1.0' } }), choice: 'other_sale', allows: true },
  { name: 'nieznane klucze dodatkowe', check: validCheck({ cokolwiek: true }), choice: null, allows: true },
];

// ──────────────────────────────────────────────────────────────────────────
// Fakty czystej polityki — kształt wierszy ładowarki (2.3).

/** Wiersz faktury — kolumny `DUPLICATE_DECISION_INVOICE_COLUMNS` (2.3). */
export interface DuplicateFactsInvoice {
  id: string;
  tenant_id: string;
  internal_number: string | null;
  direction: string | null;
  ksef_status: string | null;
  last_error_code: string | null;
  ksef_number: string | null;
  invoice_kind: string | null;
  stripe_invoice_id: string | null;
  offline_idempotency_key: string | null;
  offline_qr_offline: string | null;
  offline_qr_certyfikat: string | null;
  paid_amount: number | null;
  issue_date: string | null;
  buyer_nip: string | null;
  buyer_data: Record<string, unknown> | null;
  gross_total: number | null;
  currency: string | null;
}

/** Wpis `ksef_submissions` — kolumny czytane przez ładowarkę (2.3); `original_check` surowy. */
export interface DuplicateFactsSubmission {
  id: string;
  status: string;
  session_reference_number: string | null;
  request_payload_hash: string | null;
  response_ksef_number: string | null;
  original_ksef_number: string | null;
  original_session_reference_number: string | null;
  original_check: unknown;
  attempted_at: string | null;
  completed_at: string | null;
}

/** Faktura Y odczytana przez ładowarkę; `holdsOriginal` = wychodząca, przyjęta, z numerem K, inna niż X. */
export interface DuplicateFactsKnownInvoice {
  id: string;
  internalNumber: string | null;
  holdsOriginal: boolean;
}

export interface DuplicateFactsShape {
  invoice: DuplicateFactsInvoice;
  submissions: DuplicateFactsSubmission[];
  knownInvoice: DuplicateFactsKnownInvoice | null;
}

/** Faktura czekająca na decyzję: failed `KSEF_DUPLICATE_RECONCILE`, zwykła, bez wpłat. */
export function decisionInvoice(over: Partial<DuplicateFactsInvoice> = {}): DuplicateFactsInvoice {
  return {
    id: DUP_INVOICE_ID,
    tenant_id: DUP_TENANT_ID,
    internal_number: DUP_NR,
    direction: 'outgoing',
    ksef_status: 'failed',
    last_error_code: 'KSEF_DUPLICATE_RECONCILE',
    ksef_number: null,
    invoice_kind: 'regular',
    stripe_invoice_id: null,
    offline_idempotency_key: null,
    offline_qr_offline: null,
    offline_qr_certyfikat: null,
    paid_amount: 0,
    issue_date: '2026-10-01',
    buyer_nip: '1234567890',
    buyer_data: { name: 'Nabywca Testowy Sp. z o.o.', nip: '1234567890' },
    gross_total: 1230,
    currency: 'PLN',
    ...over,
  };
}

/** Znacznik: najnowszy otwarty wpis `sent` z numerem oryginału i zapisem sprawdzenia. */
export function markerRow(check: unknown, over: Partial<DuplicateFactsSubmission> = {}): DuplicateFactsSubmission {
  return {
    id: 'sub-2-znacznik',
    status: 'sent',
    session_reference_number: 'SES-OWN-1',
    request_payload_hash: 'aa'.repeat(32),
    response_ksef_number: null,
    original_ksef_number: DUP_K,
    original_session_reference_number: 'SES-ORIG-1',
    original_check: check,
    attempted_at: '2026-10-01T10:00:00.000Z',
    completed_at: null,
    ...over,
  };
}

/** Starsza otwarta próba bez znacznika (decyzja zamyka i ją). */
export function olderSentRow(over: Partial<DuplicateFactsSubmission> = {}): DuplicateFactsSubmission {
  return {
    id: 'sub-1-starsza',
    status: 'sent',
    session_reference_number: 'SES-OWN-0',
    request_payload_hash: 'cc'.repeat(32),
    response_ksef_number: null,
    original_ksef_number: null,
    original_session_reference_number: null,
    original_check: null,
    attempted_at: '2026-09-30T10:00:00.000Z',
    completed_at: null,
    ...over,
  };
}

/** Fakty decydowalnej faktury `no-own-file` (domyślnie) — każde pole do nadpisania. */
export function decisionFacts(over: {
  invoice?: Partial<DuplicateFactsInvoice>;
  check?: unknown;
  marker?: Partial<DuplicateFactsSubmission>;
  /** Dodatkowe wpisy obok znacznika i starszej próby. */
  extra?: DuplicateFactsSubmission[];
  /** Pełna lista wpisów zamiast domyślnej. */
  submissions?: DuplicateFactsSubmission[];
  knownInvoice?: DuplicateFactsKnownInvoice | null;
} = {}): DuplicateFactsShape {
  const check = 'check' in over ? over.check : validCheck();
  return {
    invoice: decisionInvoice(over.invoice),
    submissions: over.submissions ?? [markerRow(check, over.marker), olderSentRow(), ...(over.extra ?? [])],
    knownInvoice: over.knownInvoice ?? null,
  };
}

/** Fakty decydowalnej faktury `known-number`: Y w FaktFlow ma K i jest przyjęta (`holdsOriginal`). */
export function knownNumberFacts(holdsOriginal = true, over: { check?: Record<string, unknown>; invoice?: Partial<DuplicateFactsInvoice> } = {}): DuplicateFactsShape {
  return decisionFacts({
    invoice: over.invoice,
    check: knownNumberCheck(over.check),
    knownInvoice: { id: DUP_KNOWN_ID, internalNumber: DUP_KNOWN_NUMBER, holdsOriginal },
  });
}

/**
 * Wpis `number_taken` szkicu wycofanego (2.1.4):
 *  - `decided` — decyzja klienta (`original_check.decision`), z K;
 *  - `automatic` — automatyczny „numer zajęty” (`markKsefSubmissionsNumberTaken`), z K;
 *  - `unmarked` — zamknięty wpis bez numeru oryginału.
 */
export function numberTakenRow(
  shape: 'decided' | 'automatic' | 'unmarked',
  over: {
    id?: string;
    k?: string;
    choice?: DuplicateCaseChoice;
    via?: 'client' | 'operator';
    reason?: 'no-own-file' | 'known-number';
    completedAt?: string | null;
    at?: string;
  } = {},
): DuplicateFactsSubmission {
  const k = over.k ?? DUP_K;
  const base = (id: string): DuplicateFactsSubmission => ({
    id: over.id ?? id,
    status: 'number_taken',
    session_reference_number: `SES-${id}`,
    request_payload_hash: 'aa'.repeat(32),
    response_ksef_number: null,
    original_ksef_number: null,
    original_session_reference_number: null,
    original_check: null,
    attempted_at: '2026-10-01T10:00:00.000Z',
    completed_at: over.completedAt === undefined ? '2026-10-04T10:00:00.000Z' : over.completedAt,
  });
  if (shape === 'unmarked') return base('nt-bez-znacznika');
  if (shape === 'automatic') {
    return { ...base('nt-automatyczny'), original_ksef_number: k, original_session_reference_number: 'SES-ORIG-1' };
  }
  const reason = over.reason ?? 'no-own-file';
  const check = reason === 'known-number' ? knownNumberCheck() : validCheck();
  return {
    ...base('nt-decyzja'),
    original_ksef_number: k,
    original_session_reference_number: 'SES-ORIG-1',
    original_check: {
      ...check,
      decision: { choice: over.choice ?? 'other_sale', via: over.via ?? 'client', at: over.at ?? DUP_DECIDED_AT, reason, env: 'test' },
    },
    completed_at: over.completedAt === undefined ? DUP_DECIDED_AT : over.completedAt,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Teksty SQL 00148 (sekcja 2.11.A) — wzorce z `%` RAISE i ich argumenty.

/**
 * Lustro `DUPLICATE_DECISION_SQL_TEXTS`, przepisane ręcznie ze specyfikacji
 * (2.11.A, słowo w słowo). `%` to znacznik RAISE; żaden wzorzec nie ma
 * dosłownego `%` ani apostrofu (C1).
 */
export const EXPECTED_SQL_TEXTS: Readonly<Record<string, { template: string; arity: number }>> = {
  NOTE: { template: 'Zapisując decyzję klienta, opisz w notatce kanał, datę i osobę (co najmniej 10 znaków).', arity: 0 },
  ROLE: { template: 'Decyzję w sprawie dokumentu, którego numer jest zajęty w KSeF, zapisuje właściciel albo administrator firmy.', arity: 0 },
  ALREADY: { template: 'Decyzja dla dokumentu % jest już zapisana („%”). Jeśli była błędna, napisz do nas: pomoc@faktflow.pl, podając numer dokumentu.', arity: 2 },
  IN_FLIGHT: { template: 'Sprawdzamy dokument % w KSeF — odśwież stronę za kilka minut.', arity: 1 },
  'not-pending': { template: 'Dokument % nie czeka już na Twoją decyzję — odśwież stronę.', arity: 1 },
  'in-ksef': { template: 'Dokument % ma już numer KSeF — decyzja nie jest potrzebna. Odśwież stronę; jeśli komunikat wraca, napisz do nas: pomoc@faktflow.pl.', arity: 1 },
  kind: { template: 'Dokument % to korekta, faktura zaliczkowa albo rozliczeniowa — tej decyzji nie zapiszesz jeszcze w FaktFlow. Nie wystawiaj go ponownie i napisz do nas: pomoc@faktflow.pl, podając numer dokumentu.', arity: 1 },
  billing: { template: 'Dokument % to faktura abonamentu FaktFlow — decyzję zapisuje pomoc FaktFlow.', arity: 1 },
  offline: { template: 'Dokument % był wystawiony w trybie offline i mógł już trafić do nabywcy — tej decyzji nie zapiszesz w FaktFlow. Nie wystawiaj go ponownie i napisz do nas: pomoc@faktflow.pl, podając numer dokumentu.', arity: 1 },
  'no-marker': { template: 'Dla dokumentu % nie mamy zapisanej odpowiedzi KSeF o fakturze z tym numerem — tej decyzji nie zapiszesz w FaktFlow. Nie wystawiaj go ponownie i napisz do nas: pomoc@faktflow.pl, podając numer dokumentu.', arity: 1 },
  'conflicting-originals': { template: 'W historii dokumentu % są odpowiedzi KSeF o dwóch różnych fakturach — tej decyzji nie zapiszesz w FaktFlow. Nie wystawiaj go ponownie i napisz do nas: pomoc@faktflow.pl, podając numer dokumentu.', arity: 1 },
  'no-check': { template: 'Dla dokumentu % nie mamy jeszcze danych faktury z KSeF — sprawdzimy ją ponownie automatycznie (zwykle w ciągu 2 dni). Nie wystawiaj go ponownie.', arity: 1 },
  reason: { template: 'Dla dokumentu % ta decyzja nie jest dostępna w panelu. Nie wystawiaj go ponownie; szczegóły są na karcie faktury, a pytania: pomoc@faktflow.pl.', arity: 1 },
  'known-stale': { template: 'Dokument w FaktFlow, który ma albo miał numer KSeF %, nie zgadza się już z naszym zapisem — sprawdzimy fakturę w KSeF ponownie automatycznie (zwykle w ciągu 2 dni). Jeśli ten komunikat zostanie dłużej, napisz do nas: pomoc@faktflow.pl. Nie wystawiaj dokumentu % ponownie.', arity: 2 },
  'own-history': { template: 'Faktura % w KSeF może być wcześniejszą wersją dokumentu % wysłaną z FaktFlow — tej decyzji nie zapiszesz w panelu. Nie wystawiaj go ponownie i napisz do nas: pomoc@faktflow.pl, podając numer dokumentu.', arity: 2 },
  payments: { template: 'Na dokumencie % są zapisane wpłaty — decyzji nie zapiszemy, dopóki wpłaty są przy tym dokumencie. W FaktFlow nie zmienisz ich sam: napisz do nas: pomoc@faktflow.pl, podając numer dokumentu — ustalimy, przy której fakturze je zapisać. Nie wystawiaj go ponownie.', arity: 1 },
  STALE: { template: 'Dane faktury w KSeF dla dokumentu % zmieniły się od otwarcia strony — odśwież stronę i zdecyduj jeszcze raz.', arity: 1 },
  ENV: { template: 'Dane faktury % sprawdziliśmy w środowisku KSeF „%”, a FaktFlow pracuje teraz w środowisku „%” — tej decyzji nie zapiszesz. Nie wystawiaj dokumentu % ponownie i napisz do nas: pomoc@faktflow.pl.', arity: 4 },
  EVIDENCE: { template: 'Dokument % mógł dotrzeć do KSeF w innej próbie — decyzji nie zapiszemy. Nie wystawiaj go ponownie i napisz do nas: pomoc@faktflow.pl.', arity: 1 },
  TRIGGER_SAME: { template: 'Dokument % jest wycofany: to ta sama sprzedaż co faktura % w KSeF. Tego dokumentu nie wyślesz do KSeF.', arity: 2 },
  TRIGGER_OTHER: { template: 'Dokument % jest wycofany: numer jest zajęty w KSeF przez fakturę %. Tego dokumentu nie wyślesz do KSeF — tę sprzedaż wystaw jako nową fakturę z nowym numerem.', arity: 2 },
  TRIGGER_AUTO: { template: 'Numer % jest zajęty w KSeF przez % wystawioną poza FaktFlow — tego dokumentu nie wyślesz do KSeF (KSeF odrzuciłby go jako duplikat). Jeśli to inna sprzedaż, wystaw ją jako nową fakturę z nowym numerem.', arity: 2 },
  TRIGGER_DELETE: { template: 'Wycofanego dokumentu % nie usuniesz: zajmuje numer, który w KSeF ma już %, i zostaje w FaktFlow, żeby ten numer nie został podpowiedziany ponownie. Jeśli musisz go usunąć, napisz do nas: pomoc@faktflow.pl.', arity: 2 },
  TRIGGER_RENUMBER: { template: 'Numeru wycofanego dokumentu % nie zmienisz: ten numer ma w KSeF już %, a dokument zostaje z nim w FaktFlow, żeby numer nie został podpowiedziany ponownie. Inną sprzedaż wystaw jako nową fakturę z nowym numerem.', arity: 2 },
  TRIGGER_DIRECTION: { template: 'Wycofanego dokumentu % nie zmienisz na fakturę zakupową: zajmuje numer, który w KSeF ma już %, i zostaje w FaktFlow jako faktura sprzedaży, żeby tego numeru nie dostała inna faktura sprzedaży.', arity: 2 },
  CATALOG_NUMBER_TAKEN: { template: 'W KSeF jest już faktura Twojej firmy o tym numerze, wystawiona w innym programie. Tego dokumentu nie wyślesz do KSeF. Jeśli to ta sama sprzedaż — nie wystawiaj jej ponownie. Jeśli inna — wystaw ją jako nową fakturę z nowym numerem.', arity: 0 },
};

/** Wypełnienie wzorca RAISE od lewej do prawej — niezależne od `fillSqlText` modułu. */
export function fillExpected(key: string, ...args: string[]): string {
  const entry = EXPECTED_SQL_TEXTS[key];
  if (!entry) throw new Error(`brak wzorca ${key}`);
  const parts = entry.template.split('%');
  if (parts.length - 1 !== args.length) throw new Error(`${key}: ${parts.length - 1} znaczników, ${args.length} argumentów`);
  return parts.reduce((out, part, i) => out + part + (i < args.length ? args[i] : ''), '');
}
